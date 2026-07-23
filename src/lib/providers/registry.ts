/**
 * Registro declarativo de adaptadores de proveedor.
 * ================================================
 * La auditoría encontró que varios proyectos convergen en un "registro de
 * proveedores". Aquí implementamos una versión más completa: un proveedor de la
 * base de datos referencia un `adapter` por slug; cada adaptador declara sus
 * capacidades y sabe construir/normalizar una URL de reproducción a partir de
 * su `public_config`.
 *
 * Añadir un proveedor nuevo = insertar una fila en `providers` + (si el tipo es
 * nuevo) registrar un adaptador aquí. No hay ramas dispersas por el sistema.
 *
 * IMPORTANTE: los adaptadores NO deciden autorización. Solo forman URLs. La
 * autorización de publicación es un estado separado del panel de revisión.
 */
import type {
  PlaybackType,
  ProviderCapabilities,
  ProviderType,
  LangCode,
} from "@/lib/types/db";

export interface AdapterContext {
  /** IDs externos del contenido (tmdb, imdb, anilist…). */
  externalIds: Record<string, string | number>;
  kind: "movie" | "series" | "episode" | "channel" | "radio" | "event";
  season?: number;
  episode?: number;
  /** configuración pública del proveedor (base_url, patrones, etc.). */
  publicConfig: Record<string, unknown>;
}

export interface ResolvedSource {
  playbackType: PlaybackType;
  url: string;
  audioLanguages?: LangCode[];
  subtitleLanguages?: LangCode[];
  note?: string;
}

export interface ProviderAdapter {
  slug: string;
  label: string;
  providerType: ProviderType;
  capabilities: ProviderCapabilities;
  /**
   * Construye la(s) fuente(s) candidatas. Puede devolver [] si el proveedor no
   * cubre ese contenido. Es SÍNCRONO y sin red: la verificación real es tarea
   * del worker externo. Adaptadores que requieran red devuelven la URL base y
   * marcan la disponibilidad como `unknown` hasta que el worker la verifique.
   */
  resolve(ctx: AdapterContext): ResolvedSource[];
}

const registry = new Map<string, ProviderAdapter>();

export function registerAdapter(a: ProviderAdapter): void {
  registry.set(a.slug, a);
}
export function getAdapter(slug: string): ProviderAdapter | undefined {
  return registry.get(slug);
}
export function listAdapters(): ProviderAdapter[] {
  return [...registry.values()];
}

function template(tpl: string, vars: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// ── Adaptadores integrados ──────────────────────────────────────────────────

/** Archivo/enlace HLS directo y ya autorizado (p.ej. streams de prueba). */
registerAdapter({
  slug: "direct-hls",
  label: "HLS directo",
  providerType: "official",
  capabilities: { movies: true, series: true, iptv: true, hls: true, subtitles: true },
  resolve(ctx) {
    const url = ctx.publicConfig.url as string | undefined;
    if (!url) return [];
    return [{ playbackType: "hls", url }];
  },
});

/** Archivo de vídeo directo (mp4/webm) de dominio público u oficial. */
registerAdapter({
  slug: "direct-file",
  label: "Archivo directo",
  providerType: "public_domain",
  capabilities: { movies: true, direct_file: true },
  resolve(ctx) {
    const url = ctx.publicConfig.url as string | undefined;
    return url ? [{ playbackType: "file", url }] : [];
  },
});

/** Canal de una playlist M3U ya importada (la URL vive en channel_streams). */
registerAdapter({
  slug: "m3u-iptv",
  label: "IPTV (M3U)",
  providerType: "m3u",
  capabilities: { iptv: true, radio: true, hls: true },
  resolve(ctx) {
    const url = ctx.publicConfig.url as string | undefined;
    return url ? [{ playbackType: "hls", url }] : [];
  },
});

/**
 * Servidor Jellyfin del propio usuario. Construye la URL de stream con el
 * patrón estándar; requiere auth (token de acceso) resuelto por el worker/app.
 */
registerAdapter({
  slug: "jellyfin",
  label: "Jellyfin (servidor propio)",
  providerType: "jellyfin",
  capabilities: { movies: true, series: true, subtitles: true, multi_audio: true, hls: true, requires_auth: true },
  resolve(ctx) {
    const base = (ctx.publicConfig.base_url as string | undefined)?.replace(/\/$/, "");
    const itemId = ctx.externalIds.jellyfin_item_id;
    if (!base || !itemId) return [];
    // Jellyfin: /Videos/{id}/master.m3u8 con parámetros de sesión que añade el
    // worker/app tras autenticar. Aquí solo dejamos la URL base normalizada.
    return [
      {
        playbackType: "hls",
        url: template("{base}/Videos/{id}/master.m3u8", { base, id: String(itemId) }),
        note: "Requiere token de sesión Jellyfin",
      },
    ];
  },
});

/** Internet Archive (dominio público) — deriva el HLS/MP4 desde un identifier. */
registerAdapter({
  slug: "archive-org",
  label: "Internet Archive (dominio público)",
  providerType: "public_domain",
  capabilities: { movies: true, direct_file: true },
  resolve(ctx) {
    const identifier = ctx.publicConfig.identifier as string | undefined;
    const file = ctx.publicConfig.file as string | undefined;
    if (!identifier || !file) return [];
    return [
      {
        playbackType: "file",
        url: template("https://archive.org/download/{id}/{file}", { id: identifier, file }),
      },
    ];
  },
});

/** Proveedor FAST/genérico basado en un patrón de URL declarado en la config. */
registerAdapter({
  slug: "fast-pattern",
  label: "FAST (patrón declarado)",
  providerType: "fast",
  capabilities: { iptv: true, hls: true },
  resolve(ctx) {
    const pattern = ctx.publicConfig.url_pattern as string | undefined;
    if (!pattern) return [];
    const url = template(pattern, {
      tmdb: ctx.externalIds.tmdb_id ?? "",
      season: ctx.season ?? "",
      episode: ctx.episode ?? "",
    });
    return [{ playbackType: "hls", url }];
  },
});
