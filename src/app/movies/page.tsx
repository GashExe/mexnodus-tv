import { CatalogGrid } from "@/components/CatalogGrid";
import { Eyebrow } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { MediaTitle } from "@/lib/types/db";
import Link from "next/link";

const KIND_TABS = [
  { key: "movie", label: "Películas" },
  { key: "documentary", label: "Documentales" },
  { key: "kids", label: "Infantil" },
] as const;

export default async function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; genre?: string }>;
}) {
  const { kind = "movie", genre } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("media_titles")
    .select("*")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("popularity", { ascending: false })
    .limit(120);
  if (genre) q = q.contains("genres", [Number(genre)]);
  const { data } = await q;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Catálogo</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Películas y más</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {KIND_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/movies?kind=${t.key}`}
            data-focusable
            className={`rounded-pill px-4 py-2 text-sm ${
              kind === t.key ? "bg-accent text-white" : "border border-line bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <CatalogGrid items={(data as MediaTitle[]) ?? []} />
    </div>
  );
}
