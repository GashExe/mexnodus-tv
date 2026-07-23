/**
 * Taxonomía canónica de categorías (en español).
 * ==============================================
 * Las fuentes traen categorías caóticas: duplicados por mayúsculas
 * ("Movies"/"MOVIES"), prefijos de proveedor ("XUMO🇺🇸: Comedy"), sinónimos
 * ("Game Show"/"Game Shows"/"GAME SHOWS") y relleno ("Undefined", "FEATURED").
 * Este módulo las reduce a una taxonomía corta, profesional y en español.
 *
 * Reglas de `normalizeCategories`:
 *  1. Quita prefijos de proveedor (todo hasta el primer ":").
 *  2. Quita emojis/banderas, baja a minúsculas y busca en el mapa.
 *  3. Lo desconocido se OMITE (mejor pocas categorías limpias que ruido);
 *     si el canal queda sin ninguna → ["General"].
 */

// ── Taxonomía canónica ──────────────────────────────────────────────────────
export const CANONICAL_CATEGORIES = [
  "Noticias",
  "Deportes",
  "Cine",
  "Series",
  "Comedia",
  "Infantil",
  "Animación",
  "Anime",
  "Música",
  "Entretenimiento",
  "Concursos",
  "Reality",
  "Documentales",
  "Historia",
  "Ciencia y naturaleza",
  "Cultura",
  "Educación",
  "Religión",
  "Estilo de vida",
  "Cocina",
  "Viajes",
  "Aire libre",
  "Autos",
  "Terror y sci-fi",
  "Clásicos",
  "Gobierno",
  "Negocios",
  "Compras",
  "Ambiente",
  "Gaming",
  "General",
] as const;

// ── Mapa origen → canónica (claves en minúsculas, ya sin prefijo) ───────────
const MAP: Record<string, string> = {
  // Noticias
  news: "Noticias", "news & opinion": "Noticias", "news + opinion": "Noticias",
  noticias: "Noticias", "local news": "Noticias", weather: "Noticias",
  // Deportes
  sports: "Deportes", deportes: "Deportes", soccer: "Deportes", football: "Deportes",
  baseball: "Deportes", basketball: "Deportes", boxing: "Deportes", golf: "Deportes",
  "motor sports": "Deportes", "action sports": "Deportes", olympics: "Deportes",
  "combat sports": "Deportes", billiards: "Deportes", bullfighting: "Deportes",
  "sports & outdoors": "Deportes", wrestling: "Deportes",
  // Cine
  movies: "Cine", cine: "Cine", movie: "Cine", "movies;series": "Cine",
  // Series
  series: "Series", drama: "Series", "comedy drama": "Series", "crime drama": "Series",
  crime: "Series", "crime tv": "Series", telenovelas: "Series",
  // Comedia
  comedy: "Comedia", "dark comedy": "Comedia", sitcom: "Comedia",
  // Infantil
  kids: "Infantil", infantil: "Infantil", "kids + family": "Infantil",
  family: "Infantil", "children-music": "Infantil", "faith & family": "Religión",
  // Animación / Anime
  animation: "Animación", animated: "Animación",
  anime: "Anime", "anime & gaming": "Anime",
  // Música
  music: "Música", musica: "Música", "music talk": "Música", "music & radio": "Música",
  // Entretenimiento
  entertainment: "Entretenimiento", "pop culture": "Entretenimiento",
  "daytime tv": "Entretenimiento", variety: "Entretenimiento",
  "lifestyle & pop culture": "Estilo de vida", romance: "Entretenimiento",
  // Concursos / Reality
  "game show": "Concursos", "game shows": "Concursos",
  reality: "Reality", "reality tv": "Reality", "reality competition": "Reality",
  // Documentales / Historia / Ciencia
  documentary: "Documentales", documentales: "Documentales", biography: "Documentales",
  "history + docs": "Historia", history: "Historia", "history & learning": "Historia",
  "history & science": "Ciencia y naturaleza",
  science: "Ciencia y naturaleza", nature: "Ciencia y naturaleza",
  "nature + science": "Ciencia y naturaleza", animals: "Ciencia y naturaleza",
  "animals & nature": "Ciencia y naturaleza", environment: "Ciencia y naturaleza",
  // Cultura / Educación / Religión
  culture: "Cultura", art: "Cultura", "black voices. black stories.": "Cultura",
  creators: "Cultura",
  education: "Educación", educational: "Educación", computers: "Educación",
  religious: "Religión", faith: "Religión", "inspiration + faith": "Religión",
  // Estilo de vida / Cocina / Viajes / Aire libre / Autos
  lifestyle: "Estilo de vida", health: "Estilo de vida", home: "Estilo de vida",
  "home improvement": "Estilo de vida", "house/garden": "Estilo de vida",
  "home & design": "Estilo de vida", "home & food": "Cocina",
  cooking: "Cocina", food: "Cocina", "food + travel": "Cocina",
  travel: "Viajes", "travel & lifestyle": "Viajes",
  outdoor: "Aire libre", fishing: "Aire libre", hunting: "Aire libre",
  auto: "Autos", automotive: "Autos",
  // Terror / Clásicos
  horror: "Terror y sci-fi", "sci-fi & horror": "Terror y sci-fi",
  "science fiction": "Terror y sci-fi", paranormal: "Terror y sci-fi",
  "horror & sci-fi": "Terror y sci-fi",
  classic: "Clásicos", "classic tv": "Clásicos", western: "Clásicos",
  "western & classic tv": "Clásicos", "westerns + classics": "Clásicos",
  "westerns & country": "Clásicos", "action & drama": "Cine", action: "Cine",
  adventure: "Cine",
  // Gobierno / Negocios / Compras
  legislative: "Gobierno", public: "Gobierno", law: "Gobierno",
  business: "Negocios", "bus./financial": "Negocios",
  shop: "Compras", shopping: "Compras", auction: "Compras",
  // Ambiente / Gaming
  ambiance: "Ambiente", "mood + ambiance": "Ambiente", relax: "Ambiente",
  gaming: "Gaming", interactive: "Gaming",
  // General / relleno
  general: "General", tv: "General", nacional: "General", "local channels": "General",
  latino: "General", "en español": "General", featured: "General",
  undefined: "General", uncategorized: "General", demo: "General",
};

/** Normaliza una categoría de origen a la canónica; null si no aporta nada. */
export function normalizeCategory(raw: string): string | null {
  if (!raw) return null;
  // 1. fuera prefijo de proveedor ("XUMO🇺🇸: Comedy" → "Comedy")
  const idx = raw.indexOf(":");
  let s = idx >= 0 ? raw.slice(idx + 1) : raw;
  // 2. fuera emojis/símbolos raros; minúsculas
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}✪★]/gu, "").trim().toLowerCase();
  if (!s) return null;
  return MAP[s] ?? null;
}

/**
 * Normaliza la lista de categorías de un canal: mapea, deduplica y garantiza
 * al menos ["General"].
 */
export function normalizeCategories(raw: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw ?? []) {
    const c = normalizeCategory(r);
    if (c && c !== "General" && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.length ? out : ["General"];
}
