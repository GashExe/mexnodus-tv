/**
 * Utilidades de país seguras para cliente y servidor (sin dependencias
 * server-only). Se usan tanto en tarjetas (server) como en el filtro de país
 * de la guía en vivo (client).
 */

/** Bandera emoji a partir de un código de país ISO-3166 alfa-2 (p.ej. "MX"). */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) return "";
  const base = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(base + (up.charCodeAt(0) - 65), base + (up.charCodeAt(1) - 65));
}

/** Nombre del país en español a partir del código ISO (fallback: el código). */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
