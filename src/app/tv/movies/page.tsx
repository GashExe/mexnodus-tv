import Link from "next/link";
import { TvGrid } from "@/components/tv/TvGrid";
import { createClient } from "@/lib/supabase/server";
import type { MediaTitle } from "@/lib/types/db";

const KIND_TABS = [
  { key: "movie", label: "Películas" },
  { key: "documentary", label: "Documentales" },
  { key: "kids", label: "Infantil" },
] as const;

export default async function TvMoviesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind = "movie" } = await searchParams;
  const supabase = await createClient();
  // Menos títulos que en web (120): en un Fire TV Stick cada póster es una
  // imagen remota más que decodificar, y con mando nadie recorre 120 fichas.
  const { data } = await supabase
    .from("media_titles")
    .select("*")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("popularity", { ascending: false })
    .limit(24);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Películas y más</h1>
      <div className="flex gap-3">
        {KIND_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/tv/movies?kind=${t.key}`}
            data-focusable
            className={`rounded-pill px-5 py-2.5 text-base focus-visible:outline-none ${
              kind === t.key ? "bg-accent text-white" : "border border-line bg-surface text-ink-2"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <TvGrid items={(data as MediaTitle[]) ?? []} />
    </div>
  );
}
