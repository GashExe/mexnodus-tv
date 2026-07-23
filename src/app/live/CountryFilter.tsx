"use client";

import { useRouter } from "next/navigation";
import { flagEmoji, countryName } from "@/lib/geo";

/**
 * Selector de país para la guía en vivo. Navega preservando la vista y la
 * categoría activas. Los países disponibles se calculan en el servidor a partir
 * de los canales presentes.
 */
export function CountryFilter({
  countries,
  selected,
  view,
  cat,
}: {
  countries: string[];
  selected?: string;
  view: string;
  cat?: string;
}) {
  const router = useRouter();

  function go(country: string) {
    const params = new URLSearchParams({ view });
    if (cat) params.set("cat", cat);
    if (country) params.set("country", country);
    router.push(`/live?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">País</span>
      <select
        value={selected ?? ""}
        onChange={(e) => go(e.target.value)}
        className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
      >
        <option value="">Todos</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {`${flagEmoji(c)} ${countryName(c)}`.trim()}
          </option>
        ))}
      </select>
    </label>
  );
}
