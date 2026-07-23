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
      pending = {
        name: attrs["tvg-name"] || displayName || "Sin nombre",
        tvgId: attrs["tvg-id"] || null,
        tvgName: attrs["tvg-name"] || null,
        logo: attrs["tvg-logo"] || null,
        group: attrs["group-title"] || null,
        language: normalizeLang(attrs["tvg-language"] || attrs["language"] || null),
        country: (attrs["tvg-country"] || null)?.toUpperCase() ?? null,
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

/** Deriva un slug estable para el canal canónico a partir del nombre/tvg-id. */
export function channelSlug(ch: Pick<M3uChannel, "name" | "tvgId">): string {
  const base = ch.tvgId || ch.name;
  return base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
