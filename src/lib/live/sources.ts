/**
 * Catálogo de fuentes IPTV en vivo auto-actualizadas.
 * ==================================================
 * Basado en el proyecto HerbertHe/iptv-sources, que agrega y republica varias
 * fuentes IPTV (iptv-org, fanmingming/live, etc.) en la rama `gh-pages` con
 * actualización automática. Nosotros solo consumimos las playlists resultantes.
 *
 * IMPORTANTE (decisión de producto): que la playlist sea accesible NO autoriza
 * la publicación de sus canales. Todo lo importado entra como PENDIENTE y NO
 * autorizado; un humano lo aprueba en /admin/review. Ver README "Limitaciones".
 *
 * China se excluye por defecto a petición del proyecto (el usuario pidió "todo
 * menos China"). Es un default por fuente, sobreescribible en la importación.
 */

export interface LiveSource {
  id: string;
  label: string;
  description: string;
  /** URL cruda (GitHub gh-pages). Se descarga con guardia SSRF. */
  url: string;
  /** Espejo alternativo (dominio propio del proyecto upstream). */
  mirror?: string;
  recommended?: boolean;
  approxChannels?: number;
  /** Países excluidos por defecto para esta fuente (códigos ISO 2 letras). */
  excludeCountries?: string[];
}

const RAW = "https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages";
const MIRROR = "https://m3u.ibert.me";

export const LIVE_SOURCES: LiveSource[] = [
  {
    id: "m3u-cl-total",
    label: "m3u.cl · Latinoamérica y España (total)",
    description:
      "Lista total de m3u.cl, muy centrada en canales en español: Chile, " +
      "Argentina, México, España, Perú, Venezuela, Colombia… (~1000 canales). " +
      "No trae categoría de género; el país se deduce del nombre.",
    url: "https://m3u.cl/lista/total.m3u",
    recommended: true,
    approxChannels: 1065,
  },
  {
    id: "iptv-org-global",
    label: "iptv-org · Mundial (todos los países)",
    description:
      "Catálogo global de iptv-org agregado por HerbertHe/iptv-sources. Miles de " +
      "canales de todo el mundo, categorizados por género (Noticias, Deportes, " +
      "Cine, Infantil…). País deducido del tvg-id. Excluye China por defecto.",
    url: `${RAW}/o_all.m3u`,
    mirror: `${MIRROR}/o_all.m3u`,
    recommended: true,
    approxChannels: 11000,
    excludeCountries: ["CN"],
  },
  {
    id: "all-merged",
    label: "Merge completo (todas las fuentes upstream)",
    description:
      "Unión de las 8 fuentes upstream. Máxima cobertura pero incluye listas " +
      "regionales redundantes y menos consistentes. Excluye China por defecto.",
    url: `${RAW}/all.m3u`,
    mirror: `${MIRROR}/all.m3u`,
    approxChannels: 13000,
    excludeCountries: ["CN"],
  },

  // ── Servicios FAST (Free Ad-Supported TV) vía apsattv.com ──────────────────
  // Listas auto-actualizadas de plataformas FAST. Sobre todo EE. UU./inglés.
  {
    id: "samsung-tv-plus-us",
    label: "Samsung TV Plus (EE. UU.)",
    description: "Canales FAST de Samsung TV Plus (EE. UU.), categorizados por género.",
    url: "https://apsattv.com/ssungusa.m3u",
    approxChannels: 400,
  },
  {
    id: "lg-channels",
    label: "LG Channels",
    description: "Canales FAST de LG. Sin género; el país aparece en el nombre (AU/US…).",
    url: "https://www.apsattv.com/lg.m3u",
    approxChannels: 1286,
  },
  {
    id: "roku-channel",
    label: "The Roku Channel",
    description: "Canales FAST de The Roku Channel, categorizados por género.",
    url: "https://www.apsattv.com/rok.m3u",
    approxChannels: 328,
  },
  {
    id: "vizio-watchfree",
    label: "Vizio WatchFree+",
    description: "Canales FAST de Vizio WatchFree+, categorizados por género.",
    url: "https://www.apsattv.com/vizio.m3u",
    approxChannels: 433,
  },
  {
    id: "distrotv",
    label: "DistroTV",
    description: "Canales FAST de DistroTV. Categoría de género limitada.",
    url: "https://www.apsattv.com/distro.m3u",
    approxChannels: 336,
  },
  {
    id: "xiaomi",
    label: "Xiaomi TV",
    description: "Canales FAST de Xiaomi. Solo nombres (sin género ni tvg-id).",
    url: "https://www.apsattv.com/xiaomi.m3u",
    approxChannels: 254,
  },
  {
    id: "xumo",
    label: "Xumo Play",
    description: "Canales FAST de Xumo Play, categorizados por género (prefijo XUMO).",
    url: "https://www.apsattv.com/xumo.m3u",
    approxChannels: 389,
  },
];

export function getLiveSource(id: string): LiveSource | undefined {
  return LIVE_SOURCES.find((s) => s.id === id);
}
