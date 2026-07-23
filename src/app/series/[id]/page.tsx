import { notFound } from "next/navigation";
import Link from "next/link";
import { Play, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTitle, getSeasons, getEpisodes, isFavorite } from "@/lib/data";
import { poster, backdrop } from "@/lib/format";
import { Chip, Eyebrow, EmptyState } from "@/components/ui";
import { FavoriteButton } from "@/components/FavoriteButton";
import { TrailerButton } from "@/components/TrailerButton";
import { CastRow } from "@/components/CastRow";
import { tmdbTitleExtras, type TitleExtras } from "@/lib/tmdb";
import { hasTmdb } from "@/lib/env";

export default async function SeriesDetail({
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const seasons = await getSeasons(id);
  const activeSeason = seasons.find((x) => String(x.season_number) === s) ?? seasons[0] ?? null;
  const episodes = activeSeason ? await getEpisodes(activeSeason.id) : [];
  const fav = user ? await isFavorite(user.id, id) : false;
  const extras: TitleExtras | null =
    title.tmdb_id && hasTmdb() ? await tmdbTitleExtras("series", title.tmdb_id).catch(() => null) : null;

  const bg = backdrop(title.backdrop_path) ?? poster(title.poster_path, "w780");

  return (
    <div className="space-y-8">
      <div className="relative -mx-4 -mt-4 overflow-hidden sm:-mx-8">
        <div className="relative h-[34vh] min-h-[220px] w-full">
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
        </div>
      </div>

      <div>
        <Eyebrow>{title.kind}</Eyebrow>
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">{title.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {extras?.voteAverage ? (
            <span
              className="inline-flex items-center gap-1 rounded-pill border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[13px] font-semibold text-gold"
              title={extras.voteCount ? `${extras.voteCount.toLocaleString("es-MX")} votos en TMDB` : undefined}
            >
              <Star size={13} fill="currentColor" /> {extras.voteAverage.toFixed(1)}
            </span>
          ) : null}
          {title.year && <Chip>{title.year}</Chip>}
          {seasons.length > 0 && (
            <Chip>{seasons.length} temporada{seasons.length === 1 ? "" : "s"}</Chip>
          )}
          {title.original_language && <Chip>{title.original_language}</Chip>}
        </div>
        {title.overview && <p className="mt-4 max-w-2xl text-sm text-ink-2 sm:text-base">{title.overview}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {extras?.trailerKey && <TrailerButton youTubeKey={extras.trailerKey} title={title.title} />}
          {user && <FavoriteButton titleId={title.id} initial={fav} />}
        </div>
      </div>

      {extras?.cast?.length ? <CastRow cast={extras.cast} /> : null}

      {seasons.length === 0 ? (
        <EmptyState title="Esta serie aún no tiene temporadas" hint="Sincroniza temporadas y episodios desde el panel admin (TMDB)." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {seasons.map((se) => (
              <Link
                key={se.id}
                href={`/series/${id}?s=${se.season_number}`}
                data-focusable
                className={`rounded-pill px-4 py-2 text-sm ${
                  activeSeason?.id === se.id ? "bg-accent text-white" : "border border-line bg-surface text-ink-2 hover:text-ink"
                }`}
              >
                {se.title ?? `Temporada ${se.season_number}`}
              </Link>
            ))}
          </div>

          <div className="space-y-2">
            {episodes.length === 0 ? (
              <EmptyState title="Sin episodios en esta temporada" />
            ) : (
              episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-center gap-4 rounded-card border border-line/70 bg-surface p-3 transition hover:border-accent/40"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-surface-2 font-mono text-sm text-ink-2">
                    {ep.episode_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{ep.title ?? `Episodio ${ep.episode_number}`}</p>
                    {ep.overview && <p className="line-clamp-1 text-sm text-ink-3">{ep.overview}</p>}
                  </div>
                  <Link
                    href={`/watch/episode/${ep.id}`}
                    data-focusable
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    <Play size={15} fill="currentColor" /> Ver
                  </Link>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
