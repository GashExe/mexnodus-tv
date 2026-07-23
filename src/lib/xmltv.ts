/**
 * Parser XMLTV (EPG) mínimo y sin dependencias.
 * Extrae <programme channel start stop> con <title> y <desc>.
 * No hace red: recibe el texto ya descargado por una capa con guardia SSRF.
 *
 * Formato de fechas XMLTV: "20240722183000 +0000" (YYYYMMDDHHMMSS ±HHMM).
 */

export interface XmltvProgramme {
  channelId: string; // atributo channel (se cruza con channels.epg_id)
  start: string; // ISO-8601
  stop: string; // ISO-8601
  title: string;
  desc: string | null;
  category: string | null;
}

/** Convierte una fecha XMLTV a ISO-8601. Devuelve null si es inválida. */
export function parseXmltvDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00", tz] = m;
  const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "+00:00";
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function firstTag(block: string, tag: string): string | null {
  // toma el primer <tag ...>contenido</tag> (ignora atributos como lang)
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function attr(openTag: string, name: string): string | null {
  const m = openTag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

export function parseXMLTV(xml: string): XmltvProgramme[] {
  const out: XmltvProgramme[] = [];
  // captura cada bloque <programme ...> ... </programme>
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const openAttrs = m[1];
    const body = m[2];
    const channelId = attr(openAttrs, "channel");
    const startRaw = attr(openAttrs, "start");
    const stopRaw = attr(openAttrs, "stop");
    if (!channelId || !startRaw) continue;
    const start = parseXmltvDate(startRaw);
    const stop = stopRaw ? parseXmltvDate(stopRaw) : null;
    if (!start) continue;
    const title = firstTag(body, "title") ?? "Sin título";
    out.push({
      channelId,
      start,
      // si falta stop, asume 30 min
      stop: stop ?? new Date(new Date(start).getTime() + 30 * 60000).toISOString(),
      title,
      desc: firstTag(body, "desc"),
      category: firstTag(body, "category"),
    });
  }
  return out;
}
