import { getChannels, getGuide, getChannelFacets } from "@/lib/data";
import { ChannelCard } from "@/components/ChannelCard";
import { EpgGuide } from "@/components/EpgGuide";
import { CountryFilter } from "./CountryFilter";
import { CategoryFilter } from "./CategoryFilter";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Tv, LayoutGrid, ListTree } from "lucide-react";
import Link from "next/link";

const PAGE_LIMIT = 600;

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; view?: string; country?: string }>;
}) {
  const { cat, view = "guide", country } = await searchParams;
  // Filtrado EN SERVIDOR (Supabase corta en 1000/consulta). Las facetas salen de
  // todo el catálogo; la cuadrícula/guía traen solo el subconjunto filtrado.
  const [facets, filtered, guideFiltered] = await Promise.all([
    getChannelFacets(country),
    getChannels({ country, category: cat, limit: PAGE_LIMIT }),
    getGuide({ country, category: cat, limit: PAGE_LIMIT }),
  ]);
  const { categories, countries } = facets;
  const truncated = filtered.length >= PAGE_LIMIT;

  const q = (v: string) =>
    `/live?view=${v}${cat ? `&cat=${encodeURIComponent(cat)}` : ""}${country ? `&country=${country}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Televisión en vivo</Eyebrow>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Guía de canales</h1>
        </div>
        <div className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1">
          <Link
            href={q("guide")}
            data-focusable
            className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm ${view === "guide" ? "bg-accent text-white" : "text-ink-2"}`}
          >
            <ListTree size={15} /> Guía EPG
          </Link>
          <Link
            href={q("grid")}
            data-focusable
            className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm ${view === "grid" ? "bg-accent text-white" : "text-ink-2"}`}
          >
            <LayoutGrid size={15} /> Cuadrícula
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {countries.length > 1 && (
          <CountryFilter countries={countries} selected={country} view={view} cat={cat} />
        )}
        {categories.length > 0 && (
          <CategoryFilter categories={categories} selected={cat} view={view} country={country} />
        )}
        <span className="ml-auto font-mono text-[12px] text-ink-3">
          {truncated ? `${PAGE_LIMIT}+ canales · filtra para acotar` : `${filtered.length} canales`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={country || cat ? "No hay canales para este filtro" : "No hay canales todavía"}
          hint={
            country || cat
              ? "Prueba con otro país o categoría."
              : "Ve a Admin → Importar para sembrar canales."
          }
          icon={<Tv />}
        />
      ) : view === "guide" ? (
        <EpgGuide entries={guideFiltered} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}
