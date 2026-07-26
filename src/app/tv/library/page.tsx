import { redirect } from "next/navigation";
import { TvGrid } from "@/components/tv/TvGrid";
import { TvPosterCard } from "@/components/tv/TvPosterCard";
import { createClient } from "@/lib/supabase/server";
import { getFavorites, getContinueWatching } from "@/lib/data";
import type { MediaTitle } from "@/lib/types/db";

export default async function TvLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // El middleware ya redirige a /tv/link, pero esto cubre el caso de que la
  // sesión caduque entre el middleware y el render.
  if (!user) redirect("/tv/link?next=/tv/library");

  const [favorites, cont] = await Promise.all([
    getFavorites(user.id),
    getContinueWatching(user.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mi biblioteca</h1>

      {cont.length > 0 && (
        <section>
          <h2 className="mb-1 text-xl font-semibold tracking-tight">Continuar viendo</h2>
          <div className="no-scrollbar -mx-2 grid auto-cols-[220px] grid-flow-col gap-4 overflow-x-auto px-2 py-5">
            {cont.map((c: Record<string, unknown>) => {
              const t = c.media_titles as MediaTitle | null;
              if (!t) return null;
              return <TvPosterCard key={t.id} title={t} progress={Number(c.percent) || 0} />;
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-xl font-semibold tracking-tight">Favoritos</h2>
        <TvGrid
          items={favorites}
          emptyTitle="Todavía no has guardado nada"
          emptyHint="Marca títulos como favoritos desde el navegador y aparecerán aquí."
        />
      </section>
    </div>
  );
}
