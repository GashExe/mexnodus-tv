import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { assertSafeUrl, safeFetch } from "@/lib/ssrf";
import { parseM3U, filterChannels } from "@/lib/m3u";
import { ingestChannels } from "@/lib/live/ingest";
import { getLiveSource } from "@/lib/live/sources";
import { z } from "zod";

// La descarga + ingesta de miles de canales puede tardar; ampliamos el límite
// del route handler (Vercel lo respeta en planes con funciones largas).
export const maxDuration = 300;

const schema = z.object({
  source_id: z.string(),
  provider_id: z.string().uuid().optional(),
  /** Sobrescribe los países excluidos de la fuente (por defecto usa los suyos). */
  exclude_countries: z.array(z.string()).optional(),
  authorize: z.boolean().default(false),
});

/**
 * Importa una fuente IPTV del catálogo (HerbertHe/iptv-sources).
 * Descarga la playlist, opcionalmente excluye países (China por defecto) y crea
 * los canales como PENDIENTES y NO autorizados. Una URL accesible NO autoriza.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) return NextResponse.json({ error: "no auth" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { source_id, provider_id, exclude_countries, authorize } = parsed.data;

  const source = getLiveSource(source_id);
  if (!source) return NextResponse.json({ error: "Fuente desconocida" }, { status: 400 });

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .insert({ kind: "m3u", source_url: source.url, status: "running", created_by: actor.id })
    .select("id")
    .single();
  const jobId = job?.id as string;

  // solo un admin puede autorizar directamente en la importación
  const canAuthorize = authorize && actor.role === "admin";

  try {
    const check = assertSafeUrl(source.url);
    if (!check.ok) throw new Error(`URL rechazada: ${check.reason}`);
    const res = await safeFetch(source.url, { maxBytes: 48 * 1024 * 1024, timeoutMs: 60000 });
    if (res.status !== 200) throw new Error(`HTTP ${res.status} al descargar la playlist`);

    const all = parseM3U(res.body);
    const total = all.length;

    const exclude = exclude_countries ?? source.excludeCountries ?? [];
    const channels = exclude.length ? filterChannels(all, { excludeCountries: exclude }) : all;

    const { created, failed, channels: uniqueChannels } = await ingestChannels(supabase, channels, {
      jobId,
      providerId: provider_id ?? null,
      canAuthorize,
      labelPrefix: source.id,
    });

    await supabase
      .from("import_jobs")
      .update({
        status: "done",
        total,
        processed: channels.length,
        succeeded: created,
        failed,
        finished_at: new Date().toISOString(),
        summary: {
          source: source.id,
          total,
          after_filter: channels.length,
          unique_channels: uniqueChannels,
          created,
          failed,
          excluded_countries: exclude,
          authorized: canAuthorize,
        },
      })
      .eq("id", jobId);
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      action: "import.live_source",
      metadata: { source: source.id, created, failed, authorized: canAuthorize, excluded: exclude },
    });

    return NextResponse.json({
      ok: true,
      source: source.id,
      total,
      after_filter: channels.length,
      unique_channels: uniqueChannels,
      created,
      failed,
      excluded_countries: exclude,
      authorized: canAuthorize,
    });
  } catch (e) {
    await supabase
      .from("import_jobs")
      .update({ status: "error", summary: { error: (e as Error).message } })
      .eq("id", jobId);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
