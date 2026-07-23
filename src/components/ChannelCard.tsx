import Link from "next/link";
import type { Channel } from "@/lib/types/db";
import { poster } from "@/lib/format";
import { Radio, Tv } from "lucide-react";

export function ChannelCard({ channel }: { channel: Channel }) {
  const logo = poster(channel.logo_path);
  const Icon = channel.kind === "radio" ? Radio : Tv;
  return (
    <Link
      href={`/watch/channel/${channel.id}`}
      data-focusable
      className="group flex items-center gap-3 overflow-hidden rounded-card border border-line/60 bg-surface p-3 transition hover:border-accent/50"
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-surface-2">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain" />
        ) : (
          <Icon size={22} className="text-ink-3" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {channel.logical_number != null && (
            <span className="font-mono text-[11px] text-ink-3">{channel.logical_number}</span>
          )}
          <p className="truncate text-sm font-medium">{channel.name}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-crit">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crit" /> EN VIVO
          </span>
          <span className="font-mono text-[10px] text-ink-3">{channel.categories?.[0] ?? channel.kind}</span>
        </div>
      </div>
    </Link>
  );
}
