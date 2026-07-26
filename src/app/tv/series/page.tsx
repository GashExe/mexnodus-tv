import { TvGrid } from "@/components/tv/TvGrid";
import { createClient } from "@/lib/supabase/server";
import type { MediaTitle } from "@/lib/types/db";

export default async function TvSeriesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_titles")
    .select("*")
    .in("kind", ["series", "anime"])
    .eq("is_active", true)
    .order("popularity", { ascending: false })
    .limit(24);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Series y anime</h1>
      <TvGrid items={(data as MediaTitle[]) ?? []} />
    </div>
  );
}
