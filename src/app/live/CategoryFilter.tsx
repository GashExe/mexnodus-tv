"use client";

import { useRouter } from "next/navigation";

/**
 * Selector de categoría (género) para la guía en vivo. Navega preservando la
 * vista y el país activos. Con ~150 categorías, un desplegable es mejor que
 * una fila de chips.
 */
export function CategoryFilter({
  categories,
  selected,
  view,
  country,
}: {
  categories: string[];
  selected?: string;
  view: string;
  country?: string;
}) {
  const router = useRouter();

  function go(cat: string) {
    const params = new URLSearchParams({ view });
    if (country) params.set("country", country);
    if (cat) params.set("cat", cat);
    router.push(`/live?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">Categoría</span>
      <select
        value={selected ?? ""}
        onChange={(e) => go(e.target.value)}
        className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
      >
        <option value="">Todas</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
