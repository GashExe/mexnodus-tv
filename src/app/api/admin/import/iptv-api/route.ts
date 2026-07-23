import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { safeFetch } from "@/lib/ssrf";
import { ingestChannels } from "@/lib/live/ingest";
import { apiToChannels, fetchIptvApi } from "@/lib/live/iptv-api";
import { z } from "zod";

// Descarga ~21 MB de JSON + ingesta de miles de canales/señales.
export const maxDuration = 300;

const schema = z.object({
  exclude_countries: z.array(z.string()).default(["CN"]),
  include_nsfw: z.boolean().default(false),
  authorize: z.boolean().default(false),
});

/**
 * Importa desde la API estructurada de iptv-org (channels/streams/logos).
 * Agrupa señales por canal → respaldos (failover). Crea todo PENDIENTE y NO
 * autorizado (una señal accesible no autoriza su publicación).
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) return NextResponse.json({ error: "no auth" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { exclude_countries, include_nsfw, authorize } = parsed.data;

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .insert({ kind: "m3u", source_url: "https://iptv-org.github.io/api", status: "running", created_by: actor.id })
    .select("id")
    .single();
  const jobId = job?.id as string;
  const canAuthorize = authorize && actor.role === "admin";

  try {
    const fetcher = async (url: string) => {
      const res = await safeFetch(url, { maxBytes: 24 * 1024 * 1024, timeoutMs: 60000 });
      if (res.status !== 200) throw new Error(`HTTP ${res.status} en ${url}`);
      return res.body;
    };
    const { channels, streams, logos, categories } = await fetchIptvApi(fetcher);
    const built = apiToChannels(channels, streams, logos, categories, {
      excludeCountries: exclude_countries,
      includeNsfw: include_nsfw,
    });

    const { created, failed, channels: uniqueChannels } = await ingestChannels(supabase, built, {
      jobId,
      providerId: null,
      canAuthorize,
      labelPrefix: "iptv-org-api",
    });

    await supabase
      .from("import_jobs")
      .update({
        status: "done",
        total: built.length,
        processed: built.length,
        succeeded: created,
        failed,
        finished_at: new Date().toISOString(),
        summary: { source: "iptv-org-api", streams: built.length, unique_channels: uniqueChannels, created, failed, excluded_countries: exclude_countries, authorized: canAuthorize },
      })
      .eq("id", jobId);
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      action: "import.iptv_api",
      metadata: { created, failed, authorized: canAuthorize, excluded: exclude_countries },
    });

    return NextResponse.json({ ok: true, source: "iptv-org-api", streams: built.length, unique_channels: uniqueChannels, created, failed, authorized: canAuthorize });
  } catch (e) {
    await supabase.from("import_jobs").update({ status: "error", summary: { error: (e as Error).message } }).eq("id", jobId);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
