import type { MediaTitle } from "@/lib/types/db";
import { TvPosterCard } from "./TvPosterCard";
import { EmptyState } from "@/components/ui";

/**
 * Carrusel horizontal para TV.
 *
 * El scroll NO se gestiona aquí: `SpatialNav` llama a `scrollIntoView` sobre la
 * tarjeta que acaba de enfocar, y como las tarjetas que aún no se ven tienen
 * rectángulo real a la derecha, la navegación espacial las encuentra sola. Por
 * eso tampoco hay flechas de "siguiente": con mando no se pulsarían nunca.
 *
 * El `py-5` no es decorativo: `overflow-x-auto` obliga al eje vertical a
 * recortar, así que sin ese margen el `scale(1.06)` del foco quedaría cortado
 * por arriba y por abajo.
 */
export function TvRow({
  title,
  items,
  emptyHint,
}: {
  title: string;
  items: MediaTitle[];
  emptyHint?: string;
}) {
  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold tracking-tight">{title}</h2>
      {items.length === 0 ? (
        <EmptyState title="Sin contenido todavía" hint={emptyHint} />
      ) : (
        <div className="no-scrollbar -mx-2 grid auto-cols-[220px] grid-flow-col gap-4 overflow-x-auto px-2 py-5">
          {items.map((t) => (
            <TvPosterCard key={t.id} title={t} />
          ))}
        </div>
      )}
    </section>
  );
}
