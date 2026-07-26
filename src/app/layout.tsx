import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/nav/TopNav";
import { createClient } from "@/lib/supabase/server";
import { SURFACE_HEADER } from "@/lib/tv/surface";

export const metadata: Metadata = {
  title: "MexNodus TV",
  description:
    "Plataforma unificada de catálogo y reproducción: cine, series, anime, TV en vivo, radio y FAST.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isTv = (await headers()).get(SURFACE_HEADER) === "tv";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // En TV no hay cromo de escritorio que necesite el rol, y ahorra una consulta
  // en un aparato lento.
  let role: string | null = null;
  if (user && !isTv) {
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    role = (data as { role?: string } | null)?.role ?? "user";
  }

  // La superficie de TV trae su propio cromo (nav lateral) y su propia zona
  // segura de overscan, así que se salta el TopNav, el contenedor centrado y el
  // footer. Se decide aquí y no con layouts raíz múltiples porque eso obligaría a
  // mover todas las páginas existentes a un route group.
  if (isTv) {
    return (
      <html lang="es" data-theme="dark" className="tv-scale" suppressHydrationWarning>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    );
  }

  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>
          <TopNav signedIn={!!user} role={role} email={user?.email ?? null} />
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-4 sm:px-8">{children}</main>
          <footer className="mx-auto max-w-[1600px] px-4 py-10 text-xs text-ink-3 sm:px-8">
            MexNodus TV · núcleo funcional · reproduce únicamente fuentes aprobadas y autorizadas.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
