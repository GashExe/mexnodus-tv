import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { PERMISSIONS_POLICY } from "@/lib/security/embed-shield";
import { getEmbedFrameOrigins } from "@/lib/security/frame-origins";

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
  // YouTube (tráilers TMDB) + los orígenes exactos de los proveedores
  // `pattern-embed` activos (se administran desde el panel, sin código ni redeploy).
  const { origins: embedOrigins, error: originsError } = await getEmbedFrameOrigins();
  if (originsError) {
    console.error("[middleware] no se pudieron leer los frame-src origins:", originsError.message);
  }
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

  // Documento de reproducción sin caché mientras se diagnostica la CSP dinámica:
  // garantiza que el `frame-src` recién actualizado se sirva siempre fresco.
  if (path.startsWith("/watch")) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}
