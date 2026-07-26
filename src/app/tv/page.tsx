import Link from "next/link";
import { Play } from "lucide-react";
import { TvRow } from "@/components/tv/TvRow";
import { TvPosterCard } from "@/components/tv/TvPosterCard";
import { TvChannelCard } from "@/components/tv/TvChannelCard";
import { createClient } from "@/lib/supabase/server";
import { backdrop } from "@/lib/format";
import {
  getFeatured,
  getByKinds,
  getRecent,
  getSpanishTitles,
  getHealthyChannels,
  getContinueWatching,
} from "@/lib/data";
import type { MediaTitle } from "@/lib/types/db";

export default async function TvHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 10 por fila y no 18: cuatro filas de 18 son 72 pósters, y ese peso es lo que
  // cerraba la app en un Stick de 1GB. Con mando nadie recorre 18 fichas de lado
  // de todas formas. `getFeatured` solo aporta el hero, así que pide 1.
  const [featured, movies, series, recent, spanish, channels, cont] = await Promise.all([
    getFeatured(undefined, 1),
    getByKinds(["movie", "documentary"], 10),
    getByKinds(["series", "anime"], 10),
    getRecent(10),
    getSpanishTitles(10),
    getHealthyChannels({ country: "MX", limit: 6 }),
    user ? getContinueWatching(user.id) : Promise.resolve([]),
  ]);

  const hero = featured[0] ?? null;
  // `w780` en vez de `w1280`: el hero mide ~886px de ancho y 30vh de alto.
  const heroBg = hero ? backdrop(hero.backdrop_path, "w780") : null;

  return (
    <div className="space-y-6">
      {hero && (
        <section className="relative overflow-hidden rounded-card border border-line/60">
          <div className="relative h-[30vh] min-h-[220px] w-full">
            {heroBg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroBg} alt="" className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-transparent" />
          </div>
          <div className="absolute inset-0 flex flex-col justify-center gap-3 p-8">
            <h1 className="max-w-xl text-3xl font-bold tracking-tight">{hero.title}</h1>
            {hero.overview && (
              <p className="line-clamp-2 max-w-lg text-sm text-ink-2">{hero.overview}</p>
            )}
            <Link
              href={`/tv/watch/title/${hero.id}`}
              data-focusable
              className="inline-flex w-fit items-center gap-2 rounded-pill bg-accent px-6 py-3 text-base font-semibold text-white shadow-glow focus-visible:outline-none"
            >
              <Play size={20} fill="currentColor" /> Reproducir
            </Link>
          </div>
        </section>
      )}

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

      {channels.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Canales en vivo</h2>
          <div className="grid grid-cols-3 gap-4">
            {channels.map((ch) => (
              <TvChannelCard key={ch.id} channel={ch} />
            ))}
          </div>
        </section>
      )}

      <TvRow title="Películas destacadas" items={movies} />
      <TvRow title="Series" items={series} />
      <TvRow
        title="En español latino"
        items={spanish}
        emptyHint="Aprueba disponibilidades con audio es-419 para poblar esta fila."
      />
      <TvRow title="Agregado recientemente" items={recent} />
    </div>
  );
}
