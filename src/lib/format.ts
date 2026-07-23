import { TMDB_IMG } from "@/lib/tmdb";

/** URL de póster que funciona tanto con paths de TMDB como con URLs absolutas. */
export function poster(path: string | null | undefined, size = "w500"): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}/${size}${path}`;
}
export function backdrop(path: string | null | undefined, size = "w1280"): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}/${size}${path}`;
}

export function fmtRuntime(min: number | null | undefined): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function fmtProgress(seconds: number, duration: number | null): string {
  if (!duration) return "";
  const pct = Math.min(100, Math.round((seconds / duration) * 100));
  return `${pct}%`;
}
