import Link from "next/link";
import type { Channel } from "@/lib/types/db";
import { poster } from "@/lib/format";
import { flagEmoji } from "@/lib/geo";
import { Radio, Tv } from "lucide-react";

/** Igual que `ChannelCard`, pero enlaza dentro de /tv y con tipografía legible a distancia. */
export function TvChannelCard({ channel }: { channel: Channel }) {
  const logo = poster(channel.logo_path);
  const Icon = channel.kind === "radio" ? Radio : Tv;
  return (
    <Link
      href={`/tv/watch/channel/${channel.id}`}
      data-focusable
      className="flex items-center gap-3 overflow-hidden rounded-card border border-line/60 bg-surface p-3 transition focus-visible:border-accent focus-visible:outline-none"
    >
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-surface-2">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain" />
        ) : (
          <Icon size={26} className="text-ink-3" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {channel.logical_number != null && (
            <span className="font-mono text-xs text-ink-3">{channel.logical_number}</span>
          )}
          <p className="truncate text-base font-medium">{channel.name}</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono text-xs text-crit">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crit" /> EN VIVO
          </span>
          <span className="truncate font-mono text-xs text-ink-3">
            {channel.categories?.[0] ?? channel.kind}
          </span>
          {channel.country && (
            <span className="font-mono text-xs text-ink-3">{flagEmoji(channel.country) || channel.country}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
