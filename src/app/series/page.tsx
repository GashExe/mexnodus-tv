import { CatalogGrid } from "@/components/CatalogGrid";
import { Eyebrow } from "@/components/ui";
import { getByKinds } from "@/lib/data";

export default async function SeriesPage() {
  const items = await getByKinds(["series", "anime"], 120);
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Catálogo</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Series y anime</h1>
      </div>
      <CatalogGrid items={items} />
    </div>
  );
}
