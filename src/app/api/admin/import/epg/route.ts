import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { assertSafeUrl, safeFetch } from "@/lib/ssrf";
import { parseXMLTV } from "@/lib/xmltv";
import { z } from "zod";

const schema = z.object({
  url: z.string().url().optional(),
  content: z.string().optional(),
});

/**
 * Importa una guía EPG en formato XMLTV (por URL o pegando el contenido) y
 * la cruza con los canales existentes por `channels.epg_id` (= tvg-id).
 * Reemplaza los programas de cada canal afectado por los del XMLTV.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) return NextResponse.json({ error: "no auth" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { url, content } = parsed.data;
  if (!url && !content) return NextResponse.json({ error: "Proporciona url o content" }, { status: 400 });

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .insert({ kind: "epg", source_url: url ?? "(pegado)", status: "running", created_by: actor.id })
    .select("id")
    .single();
  const jobId = job?.id as string;

  try {
    let xml = content ?? "";
    if (url) {
      const check = assertSafeUrl(url);
      if (!check.ok) throw new Error(`URL rechazada: ${check.reason}`);
      const res = await safeFetch(url, { maxBytes: 12 * 1024 * 1024, timeoutMs: 15000 });
      if (res.status !== 200) throw new Error(`HTTP ${res.status} al descargar el EPG`);
      xml = res.body;
    }

    const programmes = parseXMLTV(xml);

    // registra/actualiza la fuente EPG
    const { data: source } = await supabase
      .from("epg_sources")
      .insert({ name: url ?? "EPG importado", url: url ?? null, format: "xmltv", last_synced_at: new Date().toISOString() })
      .select("id")
      .single();

    // mapa epg_id -> channel_id
    const { data: channels } = await supabase.from("channels").select("id, epg_id").not("epg_id", "is", null);
    const byEpg = new Map<string, string>();
    for (const c of channels ?? []) byEpg.set((c as { epg_id: string }).epg_id, (c as { id: string }).id);

    // agrupa programas por canal conocido
    const rows: Record<string, unknown>[] = [];
    const touchedChannels = new Set<string>();
    let skipped = 0;
    for (const p of programmes) {
      const channelId = byEpg.get(p.channelId);
      if (!channelId) {
        skipped++;
        continue;
      }
      touchedChannels.add(channelId);
      rows.push({
        channel_id: channelId,
        epg_source_id: source?.id ?? null,
        title: p.title,
        description: p.desc,
        starts_at: p.start,
        ends_at: p.stop,
        category: p.category,
      });
    }

    // reemplaza los programas de los canales afectados
    if (touchedChannels.size > 0) {
      await supabase.from("programs").delete().in("channel_id", [...touchedChannels]);
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("programs").insert(rows);
      if (error) throw error;
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "done",
        total: programmes.length,
        processed: rows.length,
        succeeded: rows.length,
        failed: skipped,
        finished_at: new Date().toISOString(),
        summary: { inserted: rows.length, channels: touchedChannels.size, skipped_no_match: skipped },
      })
      .eq("id", jobId);
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      action: "import.epg",
      metadata: { inserted: rows.length, channels: touchedChannels.size },
    });

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
      channels: touchedChannels.size,
      skipped_no_match: skipped,
      parsed: programmes.length,
    });
  } catch (e) {
    await supabase.from("import_jobs").update({ status: "error", summary: { error: (e as Error).message } }).eq("id", jobId);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
