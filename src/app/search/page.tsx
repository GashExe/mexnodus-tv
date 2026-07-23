import { search } from "@/lib/data";
import { CatalogGrid } from "@/components/CatalogGrid";
import { Eyebrow } from "@/components/ui";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await search(q) : [];
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Buscar</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Buscar en el catálogo</h1>
      </div>
      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Título de película o serie…"
          className="flex-1 rounded-pill border border-line bg-surface px-5 py-3 outline-none focus:border-accent"
        />
        <button className="rounded-pill bg-accent px-6 py-3 font-semibold text-white">Buscar</button>
      </form>
      {q && <p className="text-sm text-ink-3">{results.length} resultado(s) para “{q}”.</p>}
      <CatalogGrid items={results} />
    </div>
  );
}
