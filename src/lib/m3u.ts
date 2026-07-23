/**
 * Parser de playlists M3U/M3U8 extendidas (formato #EXTINF).
 * Extrae canales y sus atributos (tvg-id, tvg-logo, group-title, idioma…).
 * No hace red: recibe el texto ya descargado por una capa con guardia SSRF.
 */
import { normalizeLang } from "@/lib/language";
import type { LangCode } from "@/lib/types/db";

export interface M3uChannel {
  name: string;
  url: string;
  tvgId: string | null;
  tvgName: string | null;
  logo: string | null;
  group: string | null;
  /** Categorías de género normalizadas (group-title dividido por `;`/`,`). */
  categories: string[];
  language: LangCode;
  country: string | null;
}

const attrRe = /([a-zA-Z0-9-]+)="([^"]*)"/g;

function parseAttrs(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(line)) !== null) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

/**
 * Convención iptv-org: el `tvg-id` codifica país e (a veces) señal como
 * `Identificador.pais@feed` — p.ej. `ADN40.mx@SD`, `AngelTV.in@Spanish`.
 * Extrae el código de país ISO-3166 (2 letras) en mayúsculas, o null.
 */
export function countryFromTvgId(tvgId: string | null): string | null {
  if (!tvgId) return null;
  const base = tvgId.split("@")[0];
  const m = base.match(/\.([a-zA-Z]{2})$/);
  return m ? m[1].toUpperCase() : null;
}

/** Devuelve el sufijo `@feed` del tvg-id (calidad o idioma), o null. */
export function feedFromTvgId(tvgId: string | null): string | null {
  if (!tvgId) return null;
  const at = tvgId.indexOf("@");
  return at >= 0 ? tvgId.slice(at + 1) : null;
}

// Convención de listas tipo m3u.cl: el país va como sufijo del nombre visible,
// p.ej. "Rewind TV ✪ | CL". Solo aceptamos 2 letras MAYÚSCULAS tras "|".
const NAME_COUNTRY_RE = /\|\s*([A-Z]{2})\s*$/;

// Marcadores de calidad/estado de iptv-org que NO forman parte del nombre:
// "(576p)", "(1080p)", "[Not 24/7]", "[Geo-blocked]"… Se quitan para mostrar y
// para el slug (si no, un nombre no latino se reduciría solo a "576p").
const QUALITY_RE = /\s*(?:\(\d{2,4}[pi]\)|\[[^\]]*\])\s*/gi;

/** Extrae el código de país del sufijo "| CC" del nombre visible, o null. */
export function countryFromName(name: string | null): string | null {
  if (!name) return null;
  const m = name.match(NAME_COUNTRY_RE);
  return m ? m[1].toUpperCase() : null;
}

/** Limpia el nombre visible: quita el sufijo "| CC", calidad/estado y ✪/★. */
export function cleanChannelName(name: string): string {
  return name
    .replace(NAME_COUNTRY_RE, "")
    .replace(QUALITY_RE, " ")
    .replace(/[✪★]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Divide un `group-title` en categorías de género limpias. iptv-org usa `;`
 * para múltiples géneros (p.ej. "Animation;Kids") y "Undefined" como relleno,
 * que descartamos por no aportar como categoría.
 */
export function splitCategories(group: string | null): string[] {
  if (!group) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of group.split(/[;,]/)) {
    const g = raw.trim();
    if (!g || g.toLowerCase() === "undefined") continue;
    if (!seen.has(g.toLowerCase())) {
      seen.add(g.toLowerCase());
      out.push(g);
    }
  }
  return out;
}

export function parseM3U(text: string): M3uChannel[] {
  const lines = text.split(/\r?\n/);
  const out: M3uChannel[] = [];
  let pending: Omit<M3uChannel, "url"> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "#EXTM3U") continue;

    if (line.startsWith("#EXTINF")) {
      const attrs = parseAttrs(line);
      const commaIdx = line.lastIndexOf(",");
      const displayName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Sin nombre";
      const tvgId = attrs["tvg-id"] || null;
      const group = attrs["group-title"] || null;
      // idioma: preferimos el atributo explícito; si falta, intentamos el sufijo
      // `@feed` del tvg-id (p.ej. "@Spanish"), que a veces indica idioma.
      let language = normalizeLang(attrs["tvg-language"] || attrs["language"] || null);
      if (language === "und") {
        const fromFeed = normalizeLang(feedFromTvgId(tvgId));
        if (fromFeed !== "und") language = fromFeed;
      }
      pending = {
        // tvg-name suele venir limpio; si no, limpiamos el nombre visible.
        name: attrs["tvg-name"] || cleanChannelName(displayName) || "Sin nombre",
        tvgId,
        tvgName: attrs["tvg-name"] || null,
        logo: attrs["tvg-logo"] || null,
        group,
        categories: splitCategories(group),
        language,
        // país: atributo explícito → código del tvg-id → sufijo del nombre.
        country:
          (attrs["tvg-country"]?.toUpperCase() ||
            countryFromTvgId(tvgId) ||
            countryFromName(displayName)) ?? null,
      };
    } else if (line.startsWith("#")) {
      // otras directivas (#EXTVLCOPT, #EXTGRP...) — ignoradas en esta versión
      continue;
    } else if (pending) {
      out.push({ ...pending, url: line });
      pending = null;
    }
  }
  return out;
}

export interface ChannelFilter {
  /** Solo estos países (códigos ISO 2 letras). Si se omite, no filtra por país. */
  includeCountries?: string[];
  /** Excluye estos países. Se aplica siempre, incluso con includeCountries. */
  excludeCountries?: string[];
  /** Solo estos idiomas. Combina con includeCountries por OR. */
  languages?: LangCode[];
}

/**
 * Filtra canales por país/idioma. La exclusión manda: un canal en
 * `excludeCountries` se descarta aunque encaje en el resto. Si no se especifica
 * ni include ni languages, solo se aplica la exclusión (útil para "todo menos X").
 */
export function filterChannels(channels: M3uChannel[], f: ChannelFilter): M3uChannel[] {
  const inc = f.includeCountries?.map((c) => c.toUpperCase());
  const exc = new Set((f.excludeCountries ?? []).map((c) => c.toUpperCase()));
  const langs = f.languages ? new Set(f.languages) : null;
  return channels.filter((ch) => {
    if (ch.country && exc.has(ch.country)) return false;
    if (!inc && !langs) return true; // solo exclusión
    const okCountry = inc ? (ch.country ? inc.includes(ch.country) : false) : false;
    const okLang = langs ? langs.has(ch.language) : false;
    return okCountry || okLang;
  });
}

/** Hash corto y estable (FNV-1a) en base36. Determinista entre importaciones. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Deriva un slug estable para el CANAL canónico (identidad, no la señal).
 *
 * Dos reglas clave contra la duplicación:
 *  1. Se ignora el sufijo `@feed` del tvg-id (SD/HD/regional): son SEÑALES del
 *     mismo canal, así que comparten slug y la ingesta las agrupa como respaldos.
 *  2. Nombres no latinos (CJK, cirílico, árabe…) al quitar acentos/no-ASCII se
 *     quedarían vacíos o genéricos ("576p") y fusionarían canales distintos: en
 *     ese caso usamos un hash estable de nombre+país (o URL si no hay nombre).
 */
export function channelSlug(
  ch: Pick<M3uChannel, "name" | "tvgId"> & { url?: string; country?: string | null },
): string {
  const base = (ch.tvgId?.split("@")[0] || ch.name || "").trim();
  const slug = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // Sin ninguna letra latina el slug es ambiguo/colisiona → hash determinista.
  if (!/[a-z]/.test(slug)) {
    const key = ch.name?.trim() || ch.url || ch.tvgId || "";
    return `ch-${shortHash(`${key}|${ch.country ?? ""}`)}`;
  }
  return slug;
}
