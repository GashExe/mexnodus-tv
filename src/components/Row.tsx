import type { MediaTitle } from "@/lib/types/db";
import { PosterCard } from "./PosterCard";
import { SectionTitle, EmptyState } from "./ui";
import type { ReactNode } from "react";

/** Fila horizontal desplazable de pósters, con snap y foco por teclado/D-pad. */
export function Row({
  title,
  items,
  action,
  emptyHint,
}: {
  title: string;
  items: MediaTitle[];
  action?: ReactNode;
  emptyHint?: string;
}) {
  return (
    <section className="animate-fade-up">
      <SectionTitle action={action}>{title}</SectionTitle>
      {items.length === 0 ? (
        <EmptyState title="Sin contenido todavía" hint={emptyHint} />
      ) : (
        <div className="grid grid-flow-col auto-cols-[44vw] gap-3 overflow-x-auto pb-2 snap-x sm:auto-cols-[190px] no-scrollbar">
          {items.map((t) => (
            <div key={t.id} className="snap-start">
              <PosterCard title={t} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
