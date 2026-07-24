import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Refresca la sesión de Supabase en cada request y protege rutas privadas.
 * También aplica una CSP estricta por-respuesta.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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
  const isProtected =
    path.startsWith("/library") ||
    path.startsWith("/settings") ||
    path.startsWith("/admin") ||
    path.startsWith("/watch");

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
  // YouTube (tráilers TMDB) y los dominios de primera parte que sirven el
  // reproductor `embed`. Al añadir un servidor `pattern-embed` con un dominio
  // nuevo, incluir aquí su origen o el iframe será bloqueado por CSP.
  const csp = [
    "default-src 'self'",
    "img-src 'self' https://image.tmdb.org https://*.supabase.co https://i.ytimg.com data: blob:",
    "media-src 'self' https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.themoviedb.org https: wss://*.supabase.co",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src https://www.youtube-nocookie.com https://www.mexnodus.com https://mexnodus.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);

  return response;
}
