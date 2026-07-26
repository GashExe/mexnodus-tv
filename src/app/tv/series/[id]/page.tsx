import { notFound } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import { getTitle, getSeasons, getEpisodes } from "@/lib/data";
import { backdrop, poster } from "@/lib/format";
import { Chip, EmptyState } from "@/components/ui";

export default async function TvSeriesDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s } = await searchParams;
  const title = await getTitle(id);
  if (!title) notFound();

  const seasons = await getSeasons(id);
  const activeSeason = seasons.find((x) => String(x.season_number) === s) ?? seasons[0] ?? null;
  const episodes = activeSeason ? await getEpisodes(activeSeason.id) : [];

  const bg = backdrop(title.backdrop_path, "w780") ?? poster(title.poster_path, "w342");

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-card">
        <div className="relative h-[26vh] min-h-[180px] w-full">
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {title.year && <Chip>{title.year}</Chip>}
          {seasons.length > 0 && (
            <Chip>
              {seasons.length} temporada{seasons.length === 1 ? "" : "s"}
            </Chip>
          )}
        </div>
        {title.overview && (
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-2">{title.overview}</p>
        )}
      </div>

      {seasons.length === 0 ? (
        <EmptyState
          title="Esta serie aún no tiene temporadas"
          hint="Sincroniza temporadas y episodios desde el panel admin (TMDB)."
        />
      ) : (
        <>
          {seasons.length > 1 && (
            <div className="flex flex-wrap gap-3">
              {seasons.map((se) => (
                <Link
                  key={se.id}
                  href={`/tv/series/${id}?s=${se.season_number}`}
                  data-focusable
                  className={`rounded-pill px-5 py-2.5 text-base focus-visible:outline-none ${
                    activeSeason?.id === se.id
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-ink-2"
                  }`}
                >
                  {se.title ?? `Temporada ${se.season_number}`}
                </Link>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {episodes.length === 0 ? (
              <EmptyState title="Sin episodios en esta temporada" />
            ) : (
              episodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/tv/watch/episode/${ep.id}`}
                  data-focusable
                  className="flex items-center gap-4 rounded-card border border-line/70 bg-surface p-4 transition focus-visible:border-accent focus-visible:outline-none"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-surface-2 font-mono text-base text-ink-2">
                    {ep.episode_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">
                      {ep.title ?? `Episodio ${ep.episode_number}`}
                    </p>
                    {ep.overview && <p className="line-clamp-1 text-sm text-ink-3">{ep.overview}</p>}
                  </div>
                  <Play size={20} fill="currentColor" className="shrink-0 text-accent" />
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
