import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

type SupabaseLike = ReturnType<typeof createServerClient>;

/**
 * Orígenes permitidos en `frame-src`, derivados de los proveedores `pattern-embed`
 * activos (función SQL `embed_frame_origins`). Se cachea en memoria 30s para no
 * consultar la BD en cada request: agregar un dominio en el panel tarda ≤30s en
 * reflejarse, pero verlo no cuesta consultas extra.
 */
let frameOriginsCache: { origins: string[]; at: number } | null = null;
const FRAME_CACHE_MS = 30_000;

async function embedFrameOrigins(supabase: SupabaseLike): Promise<string[]> {
  const now = Date.now();
  if (frameOriginsCache && now - frameOriginsCache.at < FRAME_CACHE_MS) {
    return frameOriginsCache.origins;
  }
  try {
    const { data } = await supabase.rpc("embed_frame_origins");
    const origins = Array.isArray(data) ? (data as unknown[]).filter((o): o is string => typeof o === "string") : [];
    frameOriginsCache = { origins, at: now };
    return origins;
  } catch {
    // BD/función no disponible: no bloquea la app, solo no añade orígenes embed.
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
  const embedOrigins = await embedFrameOrigins(supabase);
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
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);

  return response;
}
