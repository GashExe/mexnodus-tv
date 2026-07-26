import Link from "next/link";
import { poster } from "@/lib/format";
import type { MediaTitle } from "@/lib/types/db";
import { Play } from "lucide-react";

/**
 * Póster para TV. Mismo contrato que `PosterCard`, con dos diferencias que
 * importan con mando:
 *
 * 1. Los realces van en `group-focus-visible:`, no en `group-hover:`. Sin ratón
 *    no hay hover, así que en la versión de escritorio el degradado y el botón
 *    de play no aparecen NUNCA en una tele.
 * 2. El título no se trunca a una línea ni depende del hover: a tres metros hay
 *    que poder leerlo sin enfocarlo.
 */

const KIND_PATH: Record<string, string> = {
  movie: "/tv/movies",
  documentary: "/tv/movies",
  kids: "/tv/movies",
  anime: "/tv/series",
  series: "/tv/series",
};

export function TvPosterCard({
  title,
  progress,
}: {
  title: MediaTitle;
  progress?: number | null;
}) {
  // `w342` y no el `w500` por defecto: la tarjeta mide 220px CSS, que a la
  // densidad del Stick son ~330px reales. `w500` gastaba más del doble de bytes
  // de los necesarios, y con 40 pósters en pantalla eso es lo que tumbaba el
  // WebView en un aparato de 1GB.
  const src = poster(title.poster_path, "w342");
  const href = `${KIND_PATH[title.kind] ?? "/tv/movies"}/${title.id}`;
  return (
    <Link
      href={href}
      data-focusable
      className="group relative block overflow-hidden rounded-card border border-line/60 bg-surface-2 transition duration-200 focus-visible:outline-none focus-visible:border-accent"
    >
      <div className="relative aspect-[2/3] w-full">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title.title}
            loading="lazy"
            // Dimensiones intrínsecas del `w342` de TMDB: le dan al navegador la
            // relación de aspecto sin esperar a la descarga, y evitan el reflow
            // de toda la fila cada vez que llega un póster.
            width={342}
            height={513}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface p-3 text-center">
            <span className="text-sm font-semibold text-ink-2">{title.title}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-transparent opacity-0 transition group-focus-visible:opacity-100" />
        <div className="pointer-events-none absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-accent text-white opacity-0 shadow-glow transition group-focus-visible:opacity-100">
          <Play size={18} fill="currentColor" />
        </div>
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{title.title}</p>
        <p className="mt-0.5 font-mono text-xs text-ink-3">
          {title.year ?? "—"} · {title.kind}
        </p>
      </div>
      {typeof progress === "number" && progress > 0 && (
        <div
          className="absolute bottom-0 left-0 h-1.5 bg-accent"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      )}
    </Link>
  );
}
