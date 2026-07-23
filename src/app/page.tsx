import { Hero } from "@/components/Hero";
import { Row } from "@/components/Row";
import { PosterCard } from "@/components/PosterCard";
import { SectionTitle } from "@/components/ui";
import { ChannelCard } from "@/components/ChannelCard";
import { createClient } from "@/lib/supabase/server";
import {
  getFeatured,
  getByKinds,
  getRecent,
  getSpanishTitles,
  getChannels,
  getContinueWatching,
} from "@/lib/data";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [featured, movies, series, recent, spanish, channels, cont] = await Promise.all([
    getFeatured(),
    getByKinds(["movie", "documentary"]),
    getByKinds(["series", "anime"]),
    getRecent(),
    getSpanishTitles(),
    getChannels(),
    user ? getContinueWatching(user.id) : Promise.resolve([]),
  ]);

  const hero = featured[0] ?? null;

  return (
    <div className="space-y-10">
      <Hero title={hero} />

      {cont.length > 0 && (
        <section>
          <SectionTitle>Continuar viendo</SectionTitle>
          <div className="grid grid-flow-col auto-cols-[44vw] gap-3 overflow-x-auto pb-2 sm:auto-cols-[190px] no-scrollbar">
            {cont.map((c: Record<string, unknown>) => {
              const t = c.media_titles as Parameters<typeof PosterCard>[0]["title"];
              if (!t) return null;
              return <PosterCard key={t.id} title={t} progress={Number(c.percent) || 0} />;
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle action={<Link href="/live" className="text-sm text-accent hover:underline">Ver todo</Link>}>
          Canales en vivo
        </SectionTitle>
        {channels.length === 0 ? (
          <p className="text-sm text-ink-3">Importa una playlist M3U desde el panel admin para ver canales.</p>
        ) : (
          <div className="grid grid-flow-col auto-cols-[220px] gap-3 overflow-x-auto pb-2 no-scrollbar">
            {channels.slice(0, 10).map((ch) => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
          </div>
        )}
      </section>

      <Row title="Películas destacadas" items={movies} action={<Link href="/movies" className="text-sm text-accent hover:underline">Ver todo</Link>} />
      <Row title="Series" items={series} action={<Link href="/series" className="text-sm text-accent hover:underline">Ver todo</Link>} />
      <Row title="En español latino" items={spanish} emptyHint="Aprueba disponibilidades con audio es-419 para poblar esta fila." />
      <Row title="Agregado recientemente" items={recent} />
    </div>
  );
}
