import { User } from "lucide-react";
import { poster } from "@/lib/format";
import type { TmdbCastMember } from "@/lib/tmdb";
import { SectionTitle } from "@/components/ui";

/** Reparto principal en fila horizontal (foto + nombre + personaje). */
export function CastRow({ cast }: { cast: TmdbCastMember[] }) {
  if (!cast.length) return null;
  return (
    <section>
      <SectionTitle>Reparto</SectionTitle>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {cast.map((c) => {
          const photo = poster(c.profile_path, "w185");
          return (
            <div key={c.id} className="w-24 shrink-0 sm:w-28">
              <div className="aspect-[2/3] overflow-hidden rounded-card border border-line/60 bg-surface-2">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-ink-3">
                    <User size={26} />
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-[13px] font-medium" title={c.name}>
                {c.name}
              </p>
              {c.character && (
                <p className="truncate text-[12px] text-ink-3" title={c.character}>
                  {c.character}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
