import type { MediaTitle } from "@/lib/types/db";
import { PosterCard } from "./PosterCard";
import { EmptyState } from "./ui";
import { Film } from "lucide-react";

export function CatalogGrid({ items }: { items: MediaTitle[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nada que mostrar" hint="Ajusta los filtros o sincroniza el catálogo desde el panel admin." icon={<Film />} />;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((t) => (
        <PosterCard key={t.id} title={t} />
      ))}
    </div>
  );
}
