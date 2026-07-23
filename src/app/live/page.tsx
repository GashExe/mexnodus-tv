import { getChannels } from "@/lib/data";
import { ChannelCard } from "@/components/ChannelCard";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Tv } from "lucide-react";

export default async function LivePage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const channels = await getChannels();

  const categories = Array.from(new Set(channels.flatMap((c) => c.categories ?? []))).sort();
  const filtered = cat ? channels.filter((c) => (c.categories ?? []).includes(cat)) : channels;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Televisión en vivo</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Guía de canales</h1>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <a href="/live" className={`rounded-pill px-4 py-2 text-sm ${!cat ? "bg-accent text-white" : "border border-line bg-surface text-ink-2"}`}>
            Todos
          </a>
          {categories.map((c) => (
            <a
              key={c}
              href={`/live?cat=${encodeURIComponent(c)}`}
              className={`rounded-pill px-4 py-2 text-sm capitalize ${cat === c ? "bg-accent text-white" : "border border-line bg-surface text-ink-2 hover:text-ink"}`}
            >
              {c}
            </a>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No hay canales todavía"
          hint="Importa una playlist M3U desde el panel admin y aprueba sus señales."
          icon={<Tv />}
        />
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
