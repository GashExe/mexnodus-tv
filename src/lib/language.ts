/**
 * Modelo de idioma de MexNodus TV.
 *
 * Principio: NO inferir el idioma del nombre del contenido. El idioma vive en
 * pistas de audio/subtítulos modeladas por separado. Aquí solo resolvemos
 * "¿qué tan bien encaja esta pista con las preferencias del usuario?".
 */
import type { LangCode } from "@/lib/types/db";

export const SPANISH_LATAM: LangCode[] = ["es-MX", "es-419"];
export const SPANISH_ANY: LangCode[] = ["es-MX", "es-419", "es", "es-ES"];

/** Orden por defecto de preferencia de AUDIO. El usuario puede reordenarlo. */
export const DEFAULT_AUDIO_PRIORITY: LangCode[] = ["es-MX", "es-419", "es", "es-ES"];

/** Orden por defecto de preferencia de SUBTÍTULOS. */
export const DEFAULT_SUBTITLE_PRIORITY: LangCode[] = ["es-419", "es-MX", "es", "es-ES"];

export const LANG_LABEL: Record<string, string> = {
  "es-MX": "Español (México)",
  "es-419": "Español latino",
  "es-ES": "Español (España)",
  es: "Español",
  en: "Inglés",
  "pt-BR": "Portugués (Brasil)",
  mul: "Multi-idioma",
  und: "Sin determinar",
};

/**
 * Normaliza etiquetas de idioma heterogéneas (M3U, TMDB, cabeceras) a un
 * LangCode conocido. Ejemplos: "lat" → es-419, "spa" → es, "castellano" → es-ES.
 */
export function normalizeLang(raw: string | null | undefined): LangCode {
  if (!raw) return "und";
  const s = raw.trim().toLowerCase().replace("_", "-");
  const table: Record<string, LangCode> = {
    "es-mx": "es-MX",
    mx: "es-MX",
    mex: "es-MX",
    latino: "es-419",
    lat: "es-419",
    "es-419": "es-419",
    "es-la": "es-419",
    castellano: "es-ES",
    "es-es": "es-ES",
    esp: "es-ES",
    es: "es",
    spa: "es",
    spanish: "es",
    en: "en",
    eng: "en",
    english: "en",
    "pt-br": "pt-BR",
    pob: "pt-BR",
    mul: "mul",
    multi: "mul",
    und: "und",
  };
  if (table[s]) return table[s];
  // prefijos: "es-anything" → es, "en-anything" → en
  if (s.startsWith("es")) return "es";
  if (s.startsWith("en")) return "en";
  if (s.startsWith("pt")) return "pt-BR";
  return "und";
}

/**
 * Devuelve un rango 0..1 de cómo de bien encaja `available` (idiomas presentes)
 * con `priority` (orden de preferencia). 1 = mejor coincidencia posible.
 * Considera equivalencias latinas (es-MX ↔ es-419) con pequeña penalización.
 */
export function languageMatchScore(available: LangCode[], priority: LangCode[]): number {
  if (!available.length || !priority.length) return 0;
  const set = new Set(available);
  for (let i = 0; i < priority.length; i++) {
    const want = priority[i];
    // coincidencia exacta
    if (set.has(want)) return 1 - i / (priority.length + 1);
    // equivalencias dentro del español latino
    if (SPANISH_LATAM.includes(want) && available.some((a) => SPANISH_LATAM.includes(a))) {
      return (1 - i / (priority.length + 1)) * 0.95;
    }
    // "es" genérico cubre cualquier español con leve penalización
    if (want === "es" && available.some((a) => SPANISH_ANY.includes(a))) {
      return (1 - i / (priority.length + 1)) * 0.9;
    }
  }
  return 0;
}

export const hasSpanishAudio = (langs: LangCode[]) =>
  langs.some((l) => SPANISH_ANY.includes(l));
export const hasLatamAudio = (langs: LangCode[]) =>
  langs.some((l) => SPANISH_LATAM.includes(l));
export const hasSpanishSubtitles = (langs: LangCode[]) =>
  langs.some((l) => SPANISH_ANY.includes(l));
