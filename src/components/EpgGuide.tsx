import Link from "next/link";
import type { GuideEntry } from "@/lib/data";
import { poster } from "@/lib/format";
import { Radio, Tv, Play } from "lucide-react";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function progressPct(start: string, end: string) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

/** Guía tipo EPG: por canal, programa actual (con barra) y el siguiente. */
export function EpgGuide({ entries }: { entries: GuideEntry[] }) {
  return (
    <div className="divide-y divide-line/60 overflow-hidden rounded-card border border-line">
      {entries.map(({ channel, current, next }) => {
        const logo = poster(channel.logo_path);
        const Icon = channel.kind === "radio" ? Radio : Tv;
        return (
          <Link
            key={channel.id}
            href={`/watch/channel/${channel.id}`}
            data-focusable
            className="group flex items-center gap-4 bg-surface px-4 py-3 transition hover:bg-surface-2"
          >
            <div className="w-8 shrink-0 text-center font-mono text-xs text-ink-3">
              {channel.logical_number ?? "—"}
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-surface-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-full w-full object-contain" />
              ) : (
                <Icon size={18} className="text-ink-3" />
              )}
            </div>

            <div className="hidden w-40 shrink-0 sm:block">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crit" />
                <p className="truncate text-sm font-medium">{channel.name}</p>
              </div>
              <p className="font-mono text-[10px] text-ink-3">{channel.categories?.[0] ?? channel.kind}</p>
            </div>

            <div className="min-w-0 flex-1">
              {current ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm text-ink">{current.title}</p>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {hhmm(current.starts_at)}–{hhmm(current.ends_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progressPct(current.starts_at, current.ends_at)}%` }} />
                  </div>
                  {next && (
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-3">
                      Después · {hhmm(next.starts_at)} {next.title}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-3">Sin guía disponible</p>
              )}
            </div>

            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition group-hover:bg-accent group-hover:text-white">
              <Play size={15} fill="currentColor" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
