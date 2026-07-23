import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFavorites, getContinueWatching } from "@/lib/data";
import { CatalogGrid } from "@/components/CatalogGrid";
import { PosterCard } from "@/components/PosterCard";
import { SectionTitle, Eyebrow, EmptyState } from "@/components/ui";
import type { MediaTitle } from "@/lib/types/db";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/library");

  const [favorites, cont] = await Promise.all([getFavorites(user.id), getContinueWatching(user.id)]);

  return (
    <div className="space-y-10">
      <div>
        <Eyebrow>Tu biblioteca</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Biblioteca</h1>
      </div>

      <section>
        <SectionTitle>Continuar viendo</SectionTitle>
        {cont.length === 0 ? (
          <EmptyState title="Aún no has empezado nada" hint="Reproduce una película o episodio y aparecerá aquí." />
        ) : (
          <div className="grid grid-flow-col auto-cols-[44vw] gap-3 overflow-x-auto pb-2 sm:auto-cols-[190px] no-scrollbar">
            {cont.map((c: Record<string, unknown>) => {
              const t = c.media_titles as MediaTitle;
              return t ? <PosterCard key={t.id} title={t} progress={Number(c.percent) || 0} /> : null;
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Favoritos</SectionTitle>
        <CatalogGrid items={favorites} />
      </section>
    </div>
  );
}
