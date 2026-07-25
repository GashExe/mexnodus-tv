/**
 * Orígenes permitidos en `frame-src` (CSP dinámica)
 * =================================================
 * Los proveedores `pattern-embed` activos definen qué orígenes puede enmarcar la
 * app. Este módulo deriva esos orígenes desde `domain` / `movie_pattern` /
 * `series_pattern` / `extra_frame_origins` y los consulta con la llave
 * service-role (solo servidor/edge, nunca llega al navegador). NO hace falta
 * migración ni SQL.
 *
 * `extra_frame_origins` existe porque VARIOS proveedores responden con un 302 a
 * un DOMINIO DISTINTO donde vive el reproductor real (p.ej. embedmaster.link →
 * embdmstrplayer.com). La CSP evalúa `frame-src` en CADA salto de la cadena de
 * redirecciones, así que si solo se declara el origen del patrón, el navegador
 * bloquea el iframe al redirigir y la reproducción queda en blanco.
 *
 * Frescura sin redeploy (Vercel multi-instancia):
 *  · La caché en memoria es SOLO una optimización de latencia por-isolate; la
 *    corrección nunca depende de ella. Su TTL es corto ({@link FRAME_CACHE_MS}),
 *    así un proveedor nuevo aparece en todas las instancias en ≤ ese tiempo.
 *  · Los errores de Supabase se REGISTRAN (no se ocultan) y se cae a lo último
 *    conocido para no romper el framing.
 *  · El endpoint admin y el diagnóstico usan `{ fresh: true }` (sin caché).
 *  · Las mutaciones de proveedor invalidan la caché de su propio runtime.
 */
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/** Deriva el origen EXACTO de un dominio o de un patrón de URL. */
export function deriveOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = /^https?:\/\//.test(value) ? value : `https://${value}`;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export interface ProviderOriginRow {
  domain: string | null;
  public_config: Record<string, unknown> | null;
}

/**
 * Normaliza `public_config.extra_frame_origins` a una lista de cadenas. Acepta
 * un array JSON o una cadena separada por comas/espacios/saltos de línea (que es
 * lo que escribe el formulario del panel).
 */
export function readExtraFrameOrigins(
  publicConfig: Record<string, unknown> | null | undefined,
): string[] {
  const raw = publicConfig?.extra_frame_origins;
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[\s,]+/)
      : [];
  return parts.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

/** Reúne los orígenes únicos de un conjunto de proveedores. Puro y testeable. */
export function collectOrigins(rows: ProviderOriginRow[]): string[] {
  const set = new Set<string>();
  for (const p of rows) {
    const cfg = p.public_config ?? {};
    for (const o of [
      deriveOrigin(cfg.movie_pattern as string | undefined),
      deriveOrigin(cfg.series_pattern as string | undefined),
      deriveOrigin(p.domain),
      // Destinos de redirección del proveedor (el reproductor real suele vivir
      // en otro dominio): sin ellos la CSP corta el iframe al redirigir.
      ...readExtraFrameOrigins(cfg).map(deriveOrigin),
    ]) {
      if (o) set.add(o);
    }
  }
  return [...set];
}

export interface FrameOriginsResult {
  origins: string[];
  error: Error | null;
  cached: boolean;
}

/** Consulta SIEMPRE fresca a Supabase. Registra el error real si falla. */
export async function fetchEmbedFrameOrigins(): Promise<Omit<FrameOriginsResult, "cached">> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    const error = new Error("SUPABASE_SERVICE_ROLE_KEY ausente; frame-src no puede leer proveedores");
    console.error("[frame-origins]", error.message);
    return { origins: [], error };
  }
  try {
    const admin = createClient(publicEnv.supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("providers")
      .select("domain, public_config")
      .eq("is_active", true)
      .eq("adapter", "pattern-embed");
    if (error) {
      console.error("[frame-origins] error consultando providers:", error.message, error);
      return { origins: [], error: new Error(error.message) };
    }
    return { origins: collectOrigins((data ?? []) as ProviderOriginRow[]), error: null };
  } catch (e) {
    console.error("[frame-origins] excepción consultando providers:", e);
    return { origins: [], error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ── Caché corta por-isolate (optimización, no fuente de verdad) ──────────────
let cache: { origins: string[]; at: number } | null = null;
/** TTL deliberadamente corto: garantiza frescura sin redeploy entre instancias. */
export const FRAME_CACHE_MS = 10_000;

/**
 * Orígenes con caché corta. Con `{ fresh: true }` ignora la caché. Ante error de
 * consulta, reutiliza lo último conocido (si existe) y propaga el error para que
 * el llamador lo registre; nunca deja el framing en un estado roto silencioso.
 */
export async function getEmbedFrameOrigins(opts?: { fresh?: boolean }): Promise<FrameOriginsResult> {
  const now = Date.now();
  if (!opts?.fresh && cache && now - cache.at < FRAME_CACHE_MS) {
    return { origins: cache.origins, error: null, cached: true };
  }
  const { origins, error } = await fetchEmbedFrameOrigins();
  if (error) {
    if (cache) return { origins: cache.origins, error, cached: true };
    return { origins: [], error, cached: false };
  }
  cache = { origins, at: now };
  return { origins, error: null, cached: false };
}

/**
 * Invalida la caché en memoria del runtime actual. Se llama al crear/editar/
 * activar/desactivar un proveedor. NOTA: en Vercel el middleware (edge) y las
 * server actions (node) viven en isolates distintos, así que esto no cruza
 * runtimes — la frescura entre instancias la garantiza el TTL corto.
 */
export function invalidateFrameOriginsCache(): void {
  cache = null;
}
