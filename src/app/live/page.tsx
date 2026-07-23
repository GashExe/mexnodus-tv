import { getChannels, getGuide } from "@/lib/data";
import { ChannelCard } from "@/components/ChannelCard";
import { EpgGuide } from "@/components/EpgGuide";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Tv, LayoutGrid, ListTree } from "lucide-react";
import Link from "next/link";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; view?: string }>;
}) {
  const { cat, view = "guide" } = await searchParams;
  const [channels, guide] = await Promise.all([getChannels(), getGuide()]);

  const categories = Array.from(new Set(channels.flatMap((c) => c.categories ?? []))).sort();
  const filtered = cat ? channels.filter((c) => (c.categories ?? []).includes(cat)) : channels;
  const guideFiltered = cat ? guide.filter((g) => (g.channel.categories ?? []).includes(cat)) : guide;

  const q = (v: string) => `/live?view=${v}${cat ? `&cat=${encodeURIComponent(cat)}` : ""}`;

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

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/live?view=${view}`} className={`rounded-pill px-4 py-2 text-sm ${!cat ? "bg-surface-2 text-ink" : "border border-line bg-surface text-ink-2"}`}>
            Todos
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/live?view=${view}&cat=${encodeURIComponent(c)}`}
              className={`rounded-pill px-4 py-2 text-sm capitalize ${cat === c ? "bg-surface-2 text-ink" : "border border-line bg-surface text-ink-2 hover:text-ink"}`}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {channels.length === 0 ? (
        <EmptyState
          title="No hay canales todavía"
          hint="Ve a Admin → Importar → 'Cargar demo IPTV' para sembrar canales autorizados y su EPG."
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
