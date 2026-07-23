/**
 * Cliente TMDB — SOLO servidor. El token vive en TMDB_ACCESS_TOKEN y nunca se
 * expone al cliente. Si no hay token, `hasTmdb()` es false y la app usa mocks.
 *
 * TMDB es la columna vertebral de metadatos para películas y series. Aquí solo
 * traemos metadatos; las disponibilidades/URLs de reproducción son otra capa.
 */
import "server-only";
import { serverEnv, hasTmdb } from "@/lib/env";
import type { LangCode, MediaKind } from "@/lib/types/db";

const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

export const posterUrl = (path: string | null, size = "w500") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const backdropUrl = (path: string | null, size = "w1280") =>
  path ? `${TMDB_IMG}/${size}${path}` : null;

// caché en memoria por proceso (efímera, apta para Vercel) con TTL corto
const cache = new Map<string, { data: unknown; exp: number }>();
const TTL = 5 * 60 * 1000;

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!hasTmdb()) throw new Error("TMDB no configurado");
  const qs = new URLSearchParams({
    language: serverEnv.tmdbLanguage,
    region: serverEnv.tmdbRegion,
    ...params,
  });
  const url = `${BASE}${path}?${qs}`;
  const hit = cache.get(url);
  if (hit && Date.now() < hit.exp) return hit.data as T;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${serverEnv.tmdbToken}`, Accept: "application/json" },
    // ISR-friendly: cachea también en la capa de datos de Next
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  const data = (await res.json()) as T;
  cache.set(url, { data, exp: Date.now() + TTL });
  return data;
}

// ── Tipos parciales de TMDB ─────────────────────────────────────────────────
export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  original_language: string;
  origin_country?: string[];
  runtime?: number;
  vote_average?: number;
  popularity?: number;
  imdb_id?: string;
  status?: string;
}

export interface TmdbSeries {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  original_language: string;
  origin_country?: string[];
  popularity?: number;
  status?: string;
  number_of_seasons?: number;
  seasons?: TmdbSeasonSummary[];
}

export interface TmdbSeasonSummary {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

// ── Endpoints usados por el sincronizador y el catálogo ─────────────────────
export const tmdbTrendingMovies = () =>
  tmdb<{ results: TmdbMovie[] }>("/trending/movie/week").then((r) => r.results);

export const tmdbPopularMovies = (page = 1) =>
  tmdb<{ results: TmdbMovie[] }>("/movie/popular", { page: String(page) }).then((r) => r.results);

export const tmdbPopularSeries = (page = 1) =>
  tmdb<{ results: TmdbSeries[] }>("/tv/popular", { page: String(page) }).then((r) => r.results);

export const tmdbTopRatedMovies = (page = 1) =>
  tmdb<{ results: TmdbMovie[] }>("/movie/top_rated", { page: String(page) }).then((r) => r.results);

export const tmdbTopRatedSeries = (page = 1) =>
  tmdb<{ results: TmdbSeries[] }>("/tv/top_rated", { page: String(page) }).then((r) => r.results);

/** Trae varias páginas de un fetcher de página y las concatena. */
export async function tmdbPages<T>(
  fetcher: (page: number) => Promise<T[]>,
  pages: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 1; p <= pages; p++) {
    const batch = await fetcher(p).catch(() => [] as T[]);
    if (!batch.length) break;
    out.push(...batch);
  }
  return out;
}

export const tmdbMovie = (id: number) =>
  tmdb<TmdbMovie>(`/movie/${id}`, { append_to_response: "credits,external_ids" });

export const tmdbSeries = (id: number) =>
  tmdb<TmdbSeries>(`/tv/${id}`, { append_to_response: "external_ids" });

export const tmdbSeason = (id: number, season: number) =>
  tmdb<{ episodes: TmdbEpisode[] }>(`/tv/${id}/season/${season}`).then((r) => r.episodes);

export const tmdbSearch = (query: string) =>
  tmdb<{ results: (TmdbMovie & TmdbSeries & { media_type: string })[] }>("/search/multi", { query });

// ── Extras del detalle: puntuación, tráiler y reparto ───────────────────────
export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}
export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  name: string;
  official?: boolean;
}
export interface TitleExtras {
  voteAverage: number | null;
  voteCount: number | null;
  trailerKey: string | null;
  cast: TmdbCastMember[];
}

/**
 * Trae puntuación, tráiler (clave de YouTube) y reparto de un título. Los vídeos
 * se piden en varios idiomas (incluye null) para no quedarnos sin tráiler cuando
 * no hay uno en español.
 */
export async function tmdbTitleExtras(kind: MediaKind, tmdbId: number): Promise<TitleExtras> {
  const path = kind === "series" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const data = await tmdb<{
    vote_average?: number;
    vote_count?: number;
    credits?: { cast?: TmdbCastMember[] };
    videos?: { results?: TmdbVideo[] };
  }>(path, { append_to_response: "credits,videos", include_video_language: "es,en,null" });

  const vids = data.videos?.results ?? [];
  const yt = (v: TmdbVideo) => v.site === "YouTube";
  const trailer =
    vids.find((v) => yt(v) && v.type === "Trailer" && v.official) ??
    vids.find((v) => yt(v) && v.type === "Trailer") ??
    vids.find((v) => yt(v) && (v.type === "Teaser" || v.type === "Clip"));

  return {
    voteAverage: data.vote_average ?? null,
    voteCount: data.vote_count ?? null,
    trailerKey: trailer?.key ?? null,
    cast: (data.credits?.cast ?? []).filter((c) => c.name).slice(0, 14),
  };
}

/** Mapea un idioma de TMDB (ISO-639-1) a nuestro LangCode. */
export function tmdbLangToCode(iso: string): LangCode {
  if (iso === "es") return "es";
  if (iso === "en") return "en";
  if (iso === "pt") return "pt-BR";
  return "und";
}

/** Convierte un TmdbMovie/TmdbSeries a una fila de media_titles. */
export function toMediaTitleRow(
  m: TmdbMovie | TmdbSeries,
  kind: MediaKind,
): Record<string, unknown> {
  const isMovie = "title" in m;
  return {
    kind,
    tmdb_id: m.id,
    imdb_id: (m as TmdbMovie).imdb_id ?? null,
    title: isMovie ? (m as TmdbMovie).title : (m as TmdbSeries).name,
    original_title: isMovie ? (m as TmdbMovie).original_title : (m as TmdbSeries).original_name,
    overview: m.overview || null,
    year: Number(
      (isMovie ? (m as TmdbMovie).release_date : (m as TmdbSeries).first_air_date)?.slice(0, 4),
    ) || null,
    release_date: isMovie ? (m as TmdbMovie).release_date || null : (m as TmdbSeries).first_air_date || null,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    genres: m.genres?.map((g) => g.id) ?? m.genre_ids ?? [],
    original_language: tmdbLangToCode(m.original_language),
    origin_country: m.origin_country ?? [],
    status: m.status ?? null,
    popularity: m.popularity ?? null,
    runtime_minutes: isMovie ? (m as TmdbMovie).runtime ?? null : null,
    is_active: true,
  };
}
