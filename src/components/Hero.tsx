import Link from "next/link";
import { backdrop } from "@/lib/format";
import type { MediaTitle } from "@/lib/types/db";
import { Play, Info } from "lucide-react";

const KIND_PATH: Record<string, string> = { movie: "/movies", series: "/series", anime: "/series", documentary: "/movies", kids: "/movies" };

export function Hero({ title }: { title: MediaTitle | null }) {
  if (!title) {
    return (
      <div className="mb-8 grid h-[42vh] min-h-[320px] place-items-center rounded-card border border-line bg-surface">
        <div className="text-center">
          <p className="text-lg font-semibold">Bienvenido a MexNodus TV</p>
          <p className="mt-1 text-sm text-ink-3">Configura Supabase y TMDB para poblar el catálogo.</p>
        </div>
      </div>
    );
  }
  const bg = backdrop(title.backdrop_path) ?? backdrop(title.poster_path, "w780");
  const href = `${KIND_PATH[title.kind] ?? "/movies"}/${title.id}`;
  return (
    <section className="relative mb-10 overflow-hidden rounded-card border border-line">
      <div className="relative h-[52vh] min-h-[360px] w-full">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/20 via-surface to-accent-2/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/30 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 max-w-2xl p-6 sm:p-10">
        <p className="eyebrow mb-2">Destacado · {title.kind}</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">{title.title}</h1>
        {title.overview && (
          <p className="mt-3 line-clamp-3 max-w-xl text-sm text-ink-2 sm:text-base">{title.overview}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/watch/title/${title.id}`}
            data-focusable
            className="inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 font-semibold text-white shadow-glow hover:brightness-110"
          >
            <Play size={18} fill="currentColor" /> Reproducir
          </Link>
          <Link
            href={href}
            data-focusable
            className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface/70 px-6 py-3 font-semibold text-ink backdrop-blur hover:bg-surface"
          >
            <Info size={18} /> Más información
          </Link>
        </div>
      </div>
    </section>
  );
}
