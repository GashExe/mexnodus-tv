/**
 * Importador de la API estructurada de iptv-org.
 * ==============================================
 * https://github.com/iptv-org/api — datasets JSON canónicos:
 *   - channels.json : metadatos (id, name, country, categories[], is_nsfw…)
 *   - streams.json  : señales enlazadas por `channel` id → varias por canal
 *   - logos.json    : logos canónicos por canal
 *   - categories.json: id → nombre legible de categoría
 *
 * VENTAJA CLAVE: como las señales vienen enlazadas al MISMO `channel` id, al
 * emitir una M3uChannel por señal (compartiendo tvgId = channel id) la ingesta
 * las agrupa como respaldos → FAILOVER real en todo el dataset. El `id` coincide
 * con el tvg-id base de las M3U, así que hace upsert sobre los canales que ya hay.
 */
import type { M3uChannel } from "@/lib/m3u";
import type { LangCode } from "@/lib/types/db";

export const IPTV_API_BASE = "https://iptv-org.github.io/api";

export interface ApiChannel {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  owners?: string[];
  country?: string | null;
  categories?: string[];
  is_nsfw?: boolean;
  closed?: string | null;
  replaced_by?: string | null;
  website?: string | null;
}

export interface ApiStream {
  channel: string | null;
  feed?: string | null;
  title?: string | null;
  url: string;
  quality?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
}

export interface ApiLogo {
  channel: string | null;
  in_use?: boolean;
  width?: number;
  height?: number;
  format?: string;
  url: string;
}

export interface ApiCategory {
  id: string;
  name: string;
}

export interface ApiBuildOptions {
  excludeCountries?: string[];
  /** Salta señales que exigen cabeceras (el navegador no puede fijarlas). Default true. */
  skipHeaderStreams?: boolean;
  /** Incluir canales NSFW. Default false. */
  includeNsfw?: boolean;
}

/** Elige el mejor logo por canal: en uso > formato (PNG/SVG) > mayor tamaño. */
export function buildLogoMap(logos: ApiLogo[]): Map<string, string> {
  const best = new Map<string, { url: string; score: number }>();
  for (const l of logos) {
    if (!l.channel || !l.url) continue;
    const score =
      (l.in_use ? 1000 : 0) +
      (l.format === "PNG" ? 100 : l.format === "SVG" ? 60 : 0) +
      Math.min(l.width ?? 0, 1000) / 10;
    const cur = best.get(l.channel);
    if (!cur || score > cur.score) best.set(l.channel, { url: l.url, score });
  }
  return new Map([...best].map(([k, v]) => [k, v.url]));
}

/** id de categoría → nombre legible (p.ej. "news" → "News"). */
export function buildCategoryMap(categories: ApiCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [c.id, c.name]));
}

/**
 * Convierte los datasets de la API en M3uChannel[] listos para `ingestChannels`.
 * Una entrada por señal; las del mismo canal comparten tvgId (= channel id).
 */
export function apiToChannels(
  channels: ApiChannel[],
  streams: ApiStream[],
  logos: ApiLogo[],
  categories: ApiCategory[],
  opts: ApiBuildOptions = {},
): M3uChannel[] {
  const { excludeCountries = [], skipHeaderStreams = true, includeNsfw = false } = opts;
  const exclude = new Set(excludeCountries.map((c) => c.toUpperCase()));
  const chById = new Map(channels.map((c) => [c.id, c]));
  const logoMap = buildLogoMap(logos);
  const catMap = buildCategoryMap(categories);

  const out: M3uChannel[] = [];
  for (const s of streams) {
    if (!s.channel || !s.url) continue;
    if (skipHeaderStreams && (s.user_agent || s.referrer)) continue;
    const c = chById.get(s.channel);
    if (!c) continue; // señal sin metadatos → fuera
    if (c.closed || c.replaced_by) continue;
    if (!includeNsfw && c.is_nsfw) continue;
    const country = c.country ? c.country.toUpperCase() : null;
    if (country && exclude.has(country)) continue;

    out.push({
      name: c.name,
      url: s.url,
      tvgId: c.id, // base para slug + cruce de EPG; agrupa señales del mismo canal
      tvgName: c.name,
      logo: logoMap.get(c.id) ?? null,
      group: null,
      categories: (c.categories ?? []).map((id) => catMap.get(id) ?? id),
      language: "und" as LangCode,
      country,
    });
  }
  return out;
}

/** Descarga los datasets (fetcher inyectable para tests / guardia SSRF). */
export async function fetchIptvApi(
  fetcher: (url: string) => Promise<string>,
): Promise<{
  channels: ApiChannel[];
  streams: ApiStream[];
  logos: ApiLogo[];
  categories: ApiCategory[];
}> {
  const [channels, streams, logos, categories] = await Promise.all([
    fetcher(`${IPTV_API_BASE}/channels.json`).then((t) => JSON.parse(t) as ApiChannel[]),
    fetcher(`${IPTV_API_BASE}/streams.json`).then((t) => JSON.parse(t) as ApiStream[]),
    fetcher(`${IPTV_API_BASE}/logos.json`).then((t) => JSON.parse(t) as ApiLogo[]),
    fetcher(`${IPTV_API_BASE}/categories.json`).then((t) => JSON.parse(t) as ApiCategory[]),
  ]);
  return { channels, streams, logos, categories };
}
