import { notFound } from "next/navigation";
import Link from "next/link";
import { Play, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTitle, isFavorite } from "@/lib/data";
import { resolvePlayback } from "@/lib/playback/resolve";
import { backdrop, poster, fmtRuntime } from "@/lib/format";
import { Chip, Eyebrow } from "@/components/ui";
import { FavoriteButton } from "@/components/FavoriteButton";
import { AvailabilityPanel } from "@/components/AvailabilityPanel";
import { TrailerButton } from "@/components/TrailerButton";
import { CastRow } from "@/components/CastRow";
import { tmdbTitleExtras, type TitleExtras } from "@/lib/tmdb";
import { hasTmdb } from "@/lib/env";

export default async function MovieDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = await getTitle(id);
  if (!title) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ result }, fav, extras] = await Promise.all([
    resolvePlayback({ kind: "title", id }, user?.id ?? null),
    user ? isFavorite(user.id, id) : Promise.resolve(false),
    title.tmdb_id && hasTmdb()
      ? tmdbTitleExtras(title.kind, title.tmdb_id).catch(() => null)
      : Promise.resolve<TitleExtras | null>(null),
  ]);

  const bg = backdrop(title.backdrop_path) ?? poster(title.poster_path, "w780");

  return (
    <div className="space-y-8">
      <div className="relative -mx-4 -mt-4 overflow-hidden sm:-mx-8">
        <div className="relative h-[38vh] min-h-[260px] w-full">
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="w-40 shrink-0 overflow-hidden rounded-card border border-line">
            {poster(title.poster_path) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster(title.poster_path)!} alt="" className="aspect-[2/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[2/3] place-items-center bg-surface-2 p-2 text-center text-sm text-ink-2">{title.title}</div>
            )}
          </div>
          <div className="flex-1">
            <Eyebrow>{title.kind}</Eyebrow>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">{title.title}</h1>
            {title.original_title && title.original_title !== title.title && (
              <p className="text-sm text-ink-3">{title.original_title}</p>
            )}
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
              {fmtRuntime(title.runtime_minutes) && <Chip>{fmtRuntime(title.runtime_minutes)}</Chip>}
              {title.age_rating && <Chip tone="gold">{title.age_rating}</Chip>}
              {title.original_language && <Chip>{title.original_language}</Chip>}
            </div>
            {title.overview && <p className="mt-4 max-w-2xl text-sm text-ink-2 sm:text-base">{title.overview}</p>}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/watch/title/${title.id}`}
                data-focusable
                className="inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 font-semibold text-white shadow-glow hover:brightness-110"
              >
                <Play size={18} fill="currentColor" /> Reproducir
              </Link>
              {extras?.trailerKey && <TrailerButton youTubeKey={extras.trailerKey} title={title.title} />}
              {user ? (
                <FavoriteButton titleId={title.id} initial={fav} />
              ) : (
                <Link href="/login" className="rounded-pill border border-line px-6 py-3 font-semibold text-ink-2">
                  Entra para guardar
                </Link>
              )}
            </div>
          </div>
        </div>

        <aside>
          <AvailabilityPanel result={result} />
        </aside>
      </div>

      {extras?.cast?.length ? <CastRow cast={extras.cast} /> : null}
    </div>
  );
}
