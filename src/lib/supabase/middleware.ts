import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { PERMISSIONS_POLICY } from "@/lib/security/embed-shield";

/**
 * Orígenes permitidos en `frame-src`, derivados de los proveedores `pattern-embed`
 * activos. Se leen del lado servidor con la llave service-role (nunca llega al
 * navegador), así NO hace falta ninguna migración ni función SQL. Cacheado 30s:
 * agregar un dominio en el panel se refleja en ≤30s, sin costo por request.
 */
let frameOriginsCache: { origins: string[]; at: number } | null = null;
const FRAME_CACHE_MS = 30_000;

function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  const raw = /^https?:\/\//.test(value) ? value : `https://${value}`;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

async function embedFrameOrigins(): Promise<string[]> {
  const now = Date.now();
  if (frameOriginsCache && now - frameOriginsCache.at < FRAME_CACHE_MS) {
    return frameOriginsCache.origins;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return frameOriginsCache?.origins ?? [];
  try {
    const admin = createClient(publicEnv.supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data } = await admin
      .from("providers")
      .select("domain, public_config")
      .eq("is_active", true)
      .eq("adapter", "pattern-embed");
    const set = new Set<string>();
    for (const p of (data ?? []) as { domain: string | null; public_config: Record<string, unknown> | null }[]) {
      const cfg = p.public_config ?? {};
      for (const o of [
        originOf(cfg.movie_pattern as string | undefined),
        originOf(cfg.series_pattern as string | undefined),
        originOf(p.domain),
      ]) {
        if (o) set.add(o);
      }
    }
    const origins = [...set];
    frameOriginsCache = { origins, at: now };
    return origins;
  } catch {
    // La BD no respondió: no bloquea la app, solo no añade orígenes embed.
    return frameOriginsCache?.origins ?? [];
  }
}

/**
 * Refresca la sesión de Supabase en cada request y protege rutas privadas.
 * También aplica una CSP estricta por-respuesta.
 */
export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/register");
  // /watch es PÚBLICO a propósito: reproducir no requiere cuenta. El resto sí.
  const isProtected =
    path.startsWith("/library") ||
    path.startsWith("/settings") ||
    path.startsWith("/admin");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // CSP estricta. media-src permite HLS autorizado; frame-src permite el embed de
  // YouTube (tráilers TMDB) + los orígenes de los proveedores `pattern-embed`
  // activos (se administran desde el panel, no en código — ver 0014).
  const embedOrigins = await embedFrameOrigins();
  const frameSrc = ["https://www.youtube-nocookie.com", ...embedOrigins].join(" ");
  const csp = [
    "default-src 'self'",
    // Los logos de canales IPTV vienen de dominios arbitrarios; se permite
    // cualquier imagen https (las imágenes no ejecutan código), como en media-src.
    "img-src 'self' https: data: blob:",
    "media-src 'self' https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.themoviedb.org https: wss://*.supabase.co",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `frame-src ${frameSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Un embed no puede escapar de su marco hacia la ventana principal.
    "frame-ancestors 'self'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);

  // Secure Embed Shield (nivel documento): deniega globalmente cámara, micrófono,
  // geolocalización, portapapeles y APIs de pago — para el documento Y sus iframes.
  // Ningún proveedor puede reactivarlas desde su propio `allow`.
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);

  return response;
}
