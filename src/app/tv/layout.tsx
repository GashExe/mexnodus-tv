import { TvSideNav } from "@/components/tv/TvSideNav";
import { SpatialNav } from "@/components/tv/SpatialNav";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout de la superficie de TV.
 *
 * El cromo de escritorio (TopNav, contenedor centrado, footer) ya lo omite el
 * layout raíz cuando el middleware marca la petición como `tv`; aquí solo se
 * añade la nav lateral y la zona segura de overscan (`.tv-root`, en globals.css).
 *
 * `SpatialNav` se monta una sola vez para toda la superficie: es quien mueve el
 * foco con las flechas e instala `window.__mxTv` para el APK.
 */
export default async function TvLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="tv-root flex min-h-dvh gap-4">
      <SpatialNav />
      <TvSideNav signedIn={!!user} />
      <main className="min-w-0 flex-1 pb-8">{children}</main>
    </div>
  );
}
