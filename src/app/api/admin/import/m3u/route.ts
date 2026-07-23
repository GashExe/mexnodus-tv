import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { assertSafeUrl, safeFetch } from "@/lib/ssrf";
import { parseM3U, channelSlug } from "@/lib/m3u";
import { z } from "zod";

const schema = z.object({
  url: z.string().url().optional(),
  content: z.string().optional(),
  provider_id: z.string().uuid().optional(),
  authorize: z.boolean().default(false),
});

/**
 * Importa una playlist M3U (por URL o pegando el contenido).
 * Crea/actualiza canales canónicos y sus señales como PENDIENTES y NO
 * autorizadas por defecto. Una URL accesible NO implica autorización.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) return NextResponse.json({ error: "no auth" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { url, content, provider_id, authorize } = parsed.data;
  if (!url && !content) return NextResponse.json({ error: "Proporciona url o content" }, { status: 400 });

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .insert({ kind: "m3u", source_url: url ?? "(pegado)", status: "running", created_by: actor.id })
    .select("id")
    .single();
  const jobId = job?.id as string;

  // solo un admin puede autorizar directamente en la importación
  const canAuthorize = authorize && actor.role === "admin";

  try {
    let text = content ?? "";
    if (url) {
      const check = assertSafeUrl(url);
      if (!check.ok) throw new Error(`URL rechazada: ${check.reason}`);
      const res = await safeFetch(url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 12000 });
      if (res.status !== 200) throw new Error(`HTTP ${res.status} al descargar la playlist`);
      text = res.body;
    }

    const channels = parseM3U(text);
    let created = 0;
    let failed = 0;

    for (const ch of channels) {
      const slug = channelSlug(ch);
      const safe = assertSafeUrl(ch.url);
      if (!safe.ok) {
        failed++;
        await supabase.from("import_errors").insert({ job_id: jobId, raw: ch.url, error: safe.reason });
        continue;
      }
      // canal canónico (upsert por slug)
      const { data: channel } = await supabase
        .from("channels")
        .upsert(
          {
            slug,
            name: ch.name,
            kind: "tv",
            logo_path: ch.logo,
            country: ch.country,
            language: ch.language,
            categories: ch.group ? [ch.group] : [],
          },
          { onConflict: "slug" },
        )
        .select("id")
        .single();
      if (!channel) {
        failed++;
        continue;
      }
      // señal (no duplicar por url)
      const { data: existing } = await supabase
        .from("channel_streams")
        .select("id")
        .eq("channel_id", channel.id)
        .eq("play_url", ch.url)
        .maybeSingle();
      if (!existing) {
        await supabase.from("channel_streams").insert({
          channel_id: channel.id,
          provider_id: provider_id ?? null,
          label: "Importada M3U",
          play_url: ch.url,
          playback_type: "hls",
          is_primary: true,
          tech_status: "unknown",
          review_status: canAuthorize ? "approved" : "pending",
          publish_authorization: canAuthorize ? "authorized" : "unauthorized",
        });
        created++;
      }
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "done",
        total: channels.length,
        processed: channels.length,
        succeeded: created,
        failed,
        finished_at: new Date().toISOString(),
        summary: { created, failed },
      })
      .eq("id", jobId);
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      action: "import.m3u",
      metadata: { created, failed, authorized: canAuthorize },
    });

    return NextResponse.json({ ok: true, created, failed, total: channels.length, authorized: canAuthorize });
  } catch (e) {
    await supabase.from("import_jobs").update({ status: "error", summary: { error: (e as Error).message } }).eq("id", jobId);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
