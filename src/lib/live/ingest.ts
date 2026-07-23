/**
 * Ingesta por lotes de canales M3U → tablas canónicas.
 * =====================================================
 * Sustituye el bucle "una fila = varias consultas" (inviable con miles de
 * canales) por operaciones en bloque:
 *   1. Valida las URLs con la guardia SSRF (las inseguras van a import_errors).
 *   2. Deduplica canales por slug (mismo tvg-id → mismo canal canónico) y agrupa
 *      todas sus URLs como señales.
 *   3. Upsert de canales por slug en trozos → mapa slug→id.
 *   4. Lee las señales ya existentes para no duplicarlas.
 *   5. Inserta las señales nuevas en trozos.
 *
 * NO decide autorización: `canAuthorize` solo lo puede activar un admin y por
 * defecto todo queda `pending` + `unauthorized`.
 */
import type { createClient } from "@/lib/supabase/server";
import { assertSafeUrl } from "@/lib/ssrf";
import { channelSlug, type M3uChannel } from "@/lib/m3u";
import { normalizeCategories } from "@/lib/live/categories";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export interface IngestOptions {
  jobId: string;
  providerId?: string | null;
  canAuthorize: boolean;
  /** Prefijo para etiquetar las señales, p.ej. "iptv-org" o "M3U". */
  labelPrefix?: string;
}

export interface IngestResult {
  created: number; // señales nuevas insertadas
  failed: number; // URLs rechazadas o canales que no se pudieron crear
  channels: number; // canales canónicos únicos procesados
}

const CHUNK = 500;

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function ingestChannels(
  supabase: SupabaseServer,
  channels: M3uChannel[],
  opts: IngestOptions,
): Promise<IngestResult> {
  const prefix = opts.labelPrefix ?? "M3U";
  let failed = 0;

  // 1. Validación SSRF y registro de errores en bloque.
  const valid: M3uChannel[] = [];
  const errorRows: { job_id: string; raw: string; error: string }[] = [];
  for (const ch of channels) {
    const safe = assertSafeUrl(ch.url);
    if (safe.ok) valid.push(ch);
    else {
      failed++;
      errorRows.push({ job_id: opts.jobId, raw: ch.url, error: safe.reason ?? "URL insegura" });
    }
  }
  for (const c of chunk(errorRows)) {
    if (c.length) await supabase.from("import_errors").insert(c);
  }

  // 2. Deduplicar por slug; conservar todas las URLs distintas como señales.
  const bySlug = new Map<string, { channel: M3uChannel; urls: string[] }>();
  for (const ch of valid) {
    const slug = channelSlug(ch);
    if (!slug) continue;
    const entry = bySlug.get(slug);
    if (entry) {
      if (!entry.urls.includes(ch.url)) entry.urls.push(ch.url);
    } else {
      bySlug.set(slug, { channel: ch, urls: [ch.url] });
    }
  }

  // 3. Upsert de canales por slug en trozos → mapa slug→id.
  // Particionamos por presencia de logo: los canales SIN logo omiten la columna
  // `logo_path` para que un re-import no borre un logo ya existente (PostgREST
  // solo actualiza las columnas presentes en el payload).
  const baseRow = (slug: string, ch: M3uChannel) => ({
    slug,
    name: ch.name,
    kind: "tv" as const,
    country: ch.country,
    language: ch.language,
    // taxonomía canónica en español (unifica "Movies"/"MOVIES"/"XUMO: Movies"…)
    categories: normalizeCategories(ch.categories),
    epg_id: ch.tvgId ?? slug,
  });
  const rowsWithLogo: Record<string, unknown>[] = [];
  const rowsNoLogo: Record<string, unknown>[] = [];
  for (const [slug, { channel: ch }] of bySlug) {
    if (ch.logo) rowsWithLogo.push({ ...baseRow(slug, ch), logo_path: ch.logo });
    else rowsNoLogo.push(baseRow(slug, ch));
  }

  const slugToId = new Map<string, string>();
  for (const c of [...chunk(rowsWithLogo), ...chunk(rowsNoLogo)]) {
    if (!c.length) continue;
    const { data, error } = await supabase
      .from("channels")
      .upsert(c, { onConflict: "slug" })
      .select("id, slug");
    if (error || !data) {
      failed += c.length;
      continue;
    }
    for (const row of data as { id: string; slug: string }[]) {
      slugToId.set(row.slug, row.id);
    }
  }

  const ids = [...slugToId.values()];

  // 4. Señales ya existentes por canal (para no duplicar y calcular primaria).
  const existingByChannel = new Map<string, Set<string>>();
  for (const c of chunk(ids)) {
    const { data } = await supabase
      .from("channel_streams")
      .select("channel_id, play_url")
      .in("channel_id", c);
    for (const row of (data as { channel_id: string; play_url: string }[]) ?? []) {
      let set = existingByChannel.get(row.channel_id);
      if (!set) existingByChannel.set(row.channel_id, (set = new Set()));
      set.add(row.play_url);
    }
  }

  // 5. Construir e insertar señales nuevas.
  const streamRows: Record<string, unknown>[] = [];
  for (const [slug, { urls }] of bySlug) {
    const channelId = slugToId.get(slug);
    if (!channelId) continue;
    const existing = existingByChannel.get(channelId) ?? new Set<string>();
    let idx = existing.size; // continúa numerando tras las señales existentes
    for (const url of urls) {
      if (existing.has(url)) continue;
      const isPrimary = idx === 0;
      streamRows.push({
        channel_id: channelId,
        provider_id: opts.providerId ?? null,
        label: isPrimary ? `Principal (${prefix})` : `Respaldo (${prefix})`,
        play_url: url,
        playback_type: "hls",
        is_primary: isPrimary,
        priority: isPrimary ? 10 : Math.max(0, 9 - idx),
        tech_status: "unknown",
        review_status: opts.canAuthorize ? "approved" : "pending",
        publish_authorization: opts.canAuthorize ? "authorized" : "unauthorized",
      });
      existing.add(url); // evita duplicados dentro del mismo import
      idx++;
    }
  }

  let created = 0;
  for (const c of chunk(streamRows)) {
    const { error } = await supabase.from("channel_streams").insert(c);
    if (!error) created += c.length;
    else failed += c.length;
  }

  return { created, failed, channels: bySlug.size };
}
