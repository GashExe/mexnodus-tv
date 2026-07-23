import Link from "next/link";
import { poster } from "@/lib/format";
import type { MediaTitle } from "@/lib/types/db";
import { Play } from "lucide-react";

const KIND_PATH: Record<string, string> = {
  movie: "/movies",
  documentary: "/movies",
  kids: "/movies",
  anime: "/series",
  series: "/series",
};

export function PosterCard({
  title,
  progress,
}: {
  title: MediaTitle;
  progress?: number | null;
}) {
  const src = poster(title.poster_path);
  const href = `${KIND_PATH[title.kind] ?? "/movies"}/${title.id}`;
  return (
    <Link
      href={href}
      data-focusable
      className="group relative block overflow-hidden rounded-card border border-line/60 bg-surface-2 transition duration-200 hover:border-accent/50 focus-visible:outline-none"
    >
      <div className="relative aspect-[2/3] w-full">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface p-3 text-center">
            <span className="text-sm font-semibold text-ink-2">{title.title}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
        <div className="absolute right-2 top-2 grid h-9 w-9 translate-y-1 place-items-center rounded-full bg-accent text-white opacity-0 shadow-glow transition group-hover:translate-y-0 group-hover:opacity-100">
          <Play size={16} fill="currentColor" />
        </div>
      </div>
      <div className="p-2.5">
        <p className="truncate text-[13px] font-medium text-ink">{title.title}</p>
        <p className="font-mono text-[11px] text-ink-3">
          {title.year ?? "—"} · {title.kind}
        </p>
      </div>
      {typeof progress === "number" && progress > 0 && (
        <div className="absolute bottom-0 left-0 h-1 bg-accent" style={{ width: `${Math.min(100, progress)}%` }} />
      )}
    </Link>
  );
}
