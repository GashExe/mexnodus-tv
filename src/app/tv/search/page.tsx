import { TvGrid } from "@/components/tv/TvGrid";
import { search } from "@/lib/data";

/**
 * Búsqueda.
 *
 * Es un `<form method="get">` sin JavaScript, igual que la de escritorio: al
 * enfocar el campo, Fire OS abre su propio teclado en pantalla y el mando lo
 * maneja de forma nativa. Un teclado propio en cuadrícula se vería mejor, pero
 * el del sistema ya soporta dictado por voz desde el mando, que es más rápido
 * que cualquier cosa que pudiéramos dibujar.
 */
export default async function TvSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = q ? await search(q) : [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Buscar</h1>

      <form method="get" className="flex gap-3">
        <input
          name="q"
          defaultValue={q ?? ""}
          autoFocus
          placeholder="Título de película o serie…"
          data-focusable
          className="flex-1 rounded-pill border border-line bg-surface px-6 py-3.5 text-base outline-none focus:border-accent"
        />
        <button
          data-focusable
          className="rounded-pill bg-accent px-7 py-3.5 text-base font-semibold text-white focus-visible:outline-none"
        >
          Buscar
        </button>
      </form>

      {q && (
        <TvGrid
          items={results}
          emptyTitle={`Sin resultados para «${q}»`}
          emptyHint="Prueba con el título original o menos palabras."
        />
      )}
    </div>
  );
}
