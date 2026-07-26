import { notFound } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import { getTitle } from "@/lib/data";
import { backdrop, poster, fmtRuntime } from "@/lib/format";
import { Chip } from "@/components/ui";

/**
 * Ficha de película para TV.
 *
 * Deliberadamente más corta que la de escritorio: no lleva `AvailabilityPanel`
 * (información de diagnóstico para revisores, no para el sofá), ni `CastRow`
 * (sus tiles son `<div>` sin foco, el D-pad los saltaría), ni el botón de
 * favoritos, que requiere sesión y en TV se resuelve por emparejamiento.
 */
export default async function TvMovieDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = await getTitle(id);
  if (!title) notFound();

  const bg = backdrop(title.backdrop_path, "w780") ?? poster(title.poster_path, "w342");

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-card">
        <div className="relative h-[32vh] min-h-[220px] w-full">
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-44 shrink-0 overflow-hidden rounded-card border border-line">
          {poster(title.poster_path, "w342") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster(title.poster_path, "w342")!} alt="" className="aspect-[2/3] w-full object-cover" />
          ) : (
            <div className="grid aspect-[2/3] place-items-center bg-surface-2 p-2 text-center text-sm text-ink-2">
              {title.title}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{title.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {title.year && <Chip>{title.year}</Chip>}
            {fmtRuntime(title.runtime_minutes) && <Chip>{fmtRuntime(title.runtime_minutes)}</Chip>}
            {title.age_rating && <Chip tone="gold">{title.age_rating}</Chip>}
          </div>
          {title.overview && (
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-2">{title.overview}</p>
          )}
          <Link
            href={`/tv/watch/title/${title.id}`}
            data-focusable
            className="mt-6 inline-flex items-center gap-2 rounded-pill bg-accent px-7 py-3.5 text-base font-semibold text-white shadow-glow focus-visible:outline-none"
          >
            <Play size={20} fill="currentColor" /> Reproducir
          </Link>
        </div>
      </div>
    </div>
  );
}
