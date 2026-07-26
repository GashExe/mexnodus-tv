import type { MediaTitle } from "@/lib/types/db";
import { TvPosterCard } from "./TvPosterCard";
import { EmptyState } from "@/components/ui";

/**
 * Cuadrícula de catálogo para TV: 4 columnas fijas, no las 6 de `CatalogGrid`.
 * A tres metros, seis columnas dejan los pósters demasiado pequeños para leer
 * el título, y además obligan a más pulsaciones horizontales para cruzar la fila.
 *
 * El `py-4` deja sitio al `scale(1.06)` del foco en la primera y última fila.
 */
export function TvGrid({
  items,
  emptyTitle = "Sin resultados",
  emptyHint,
}: {
  items: MediaTitle[];
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (items.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <div className="grid grid-cols-4 gap-5 py-4">
      {items.map((t) => (
        <TvPosterCard key={t.id} title={t} />
      ))}
    </div>
  );
}
