"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ListVideo, SkipForward, X } from "lucide-react";

export interface EpisodeNavItem {
  id: string;
  season_number: number;
  episode_number: number;
  title: string | null;
  air_date: string | null;
  runtime_minutes: number | null;
}

export interface EpisodeNavProps {
  seriesTitle: string;
  episodes: EpisodeNavItem[]; // todos, ordenados por temporada y número
  currentId: string;
  /**
   * Prefijo del destino. En TV es `/tv/watch/episode`: sin esto, saltar de
   * episodio sacaría al usuario de la superficie de tele y le devolvería el
   * layout de escritorio. Por defecto, la ruta web de siempre.
   */
  basePath?: string;
}

/**
 * Navegación de episodios para el reproductor de series: botón "siguiente
 * episodio" + popover de temporadas → episodios. Neutral respecto a la fuente:
 * solo navega a `{basePath}/{id}`. Portado del UX de TMDB-Player.
 */
export function EpisodeNav({
  seriesTitle,
  episodes,
  currentId,
  basePath = "/watch/episode",
}: EpisodeNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const current = episodes.find((e) => e.id === currentId) ?? null;
  // temporada mostrada en el popover; por defecto la del episodio actual
  const [view, setView] = useState<number | null>(current?.season_number ?? null);

  // agrupa por temporada preservando el orden
  const seasons = useMemo(() => {
    const map = new Map<number, EpisodeNavItem[]>();
    for (const ep of episodes) {
      if (!map.has(ep.season_number)) map.set(ep.season_number, []);
      map.get(ep.season_number)!.push(ep);
    }
    return [...map.entries()].map(([season, eps]) => ({ season, eps }));
  }, [episodes]);

  // siguiente = próximo en la lista global ordenada
  const nextEp = useMemo(() => {
    const i = episodes.findIndex((e) => e.id === currentId);
    return i >= 0 && i + 1 < episodes.length ? episodes[i + 1] : null;
  }, [episodes, currentId]);

  const go = (id: string) => {
    setOpen(false);
    router.push(`${basePath}/${id}`);
  };

  const viewEps = seasons.find((s) => s.season === view)?.eps ?? [];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{seriesTitle}</p>
        {current && (
          <p className="mt-0.5 truncate text-sm text-ink-3">
            <span className="font-mono text-[12px] text-ink-2">
              T{current.season_number} · E{current.episode_number}
            </span>
            {current.title ? ` — ${current.title}` : ""}
          </p>
        )}
      </div>

      <div className="relative flex items-center gap-2">
        <button
          onClick={() => {
            setView(current?.season_number ?? seasons[0]?.season ?? null);
            setOpen((v) => !v);
          }}
          data-focusable
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-medium transition ${
            open ? "bg-surface-2 text-ink" : "border border-line bg-bg text-ink-2 hover:text-ink"
          }`}
        >
          <ListVideo size={16} /> Episodios
        </button>

        <button
          onClick={() => nextEp && go(nextEp.id)}
          data-focusable
          disabled={!nextEp}
          title={
            nextEp
              ? `Siguiente: T${nextEp.season_number} · E${nextEp.episode_number}`
              : "No hay siguiente episodio"
          }
          className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente <SkipForward size={16} fill="currentColor" />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-20 mt-2 max-h-[60vh] w-[min(88vw,340px)] overflow-hidden rounded-card border border-line/70 bg-surface/98 shadow-card backdrop-blur-md">
            {/* cabecera del popover */}
            <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2.5">
              {view !== null && seasons.length > 1 ? (
                <span className="text-sm font-medium">Temporada {view}</span>
              ) : (
                <span className="text-sm font-medium">{seriesTitle}</span>
              )}
              <button
                onClick={() => setOpen(false)}
                data-focusable
                aria-label="Cerrar"
                className="ml-auto grid h-7 w-7 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            {/* selector de temporada (solo si hay varias) */}
            {seasons.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-line/60 px-3 py-2">
                {seasons.map((s) => (
                  <button
                    key={s.season}
                    onClick={() => setView(s.season)}
                    data-focusable
                    className={`shrink-0 rounded-pill px-3 py-1 text-[12px] font-medium transition ${
                      view === s.season
                        ? "bg-accent text-white"
                        : "border border-line bg-bg text-ink-2 hover:text-ink"
                    }`}
                  >
                    {s.season === 0 ? "Especiales" : `T${s.season}`}
                  </button>
                ))}
              </div>
            )}

            {/* lista de episodios de la temporada mostrada */}
            <ul className="max-h-[42vh] overflow-y-auto py-1">
              {viewEps.map((ep) => {
                const active = ep.id === currentId;
                return (
                  <li key={ep.id}>
                    <button
                      onClick={() => go(ep.id)}
                      data-focusable
                      aria-current={active}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-surface-2 ${
                        active ? "bg-surface-2" : ""
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] font-mono text-[12px] ${
                          active ? "bg-accent text-white" : "bg-bg text-ink-3 ring-1 ring-line/60"
                        }`}
                      >
                        {ep.episode_number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">
                          {ep.title ?? `Episodio ${ep.episode_number}`}
                        </span>
                        {(ep.air_date || ep.runtime_minutes) && (
                          <span className="block truncate font-mono text-[11px] text-ink-3">
                            {ep.air_date ?? ""}
                            {ep.runtime_minutes ? `  ·  ${ep.runtime_minutes}m` : ""}
                          </span>
                        )}
                      </span>
                      {active ? (
                        <span className="shrink-0 text-[11px] font-medium text-accent">Ahora</span>
                      ) : (
                        <ChevronRight size={15} className="shrink-0 text-ink-3" />
                      )}
                    </button>
                  </li>
                );
              })}
              {viewEps.length === 0 && (
                <li className="px-3.5 py-4 text-center text-sm text-ink-3">Sin episodios</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
