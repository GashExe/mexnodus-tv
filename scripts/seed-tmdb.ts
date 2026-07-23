/**
 * Seed opcional: puebla media_titles con populares de TMDB usando la
 * service-role key (solo local/CI, nunca en el navegador).
 *
 *   TMDB_ACCESS_TOKEN=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run seed:tmdb
 */
import { createClient } from "@supabase/supabase-js";

const TMDB = "https://api.themoviedb.org/3";
const token = process.env.TMDB_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token || !url || !key) {
  console.error("Faltan TMDB_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function tmdb(path: string) {
  const res = await fetch(`${TMDB}${path}?language=es-MX&region=MX`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

function lang(iso: string) {
  return ({ es: "es", en: "en", pt: "pt-BR" } as Record<string, string>)[iso] ?? "und";
}

async function main() {
  const movies = (await tmdb("/movie/popular")).results as Record<string, unknown>[];
  const series = (await tmdb("/tv/popular")).results as Record<string, unknown>[];

  const rows = [
    ...movies.map((m) => ({
      kind: "movie",
      tmdb_id: m.id,
      title: m.title,
      original_title: m.original_title,
      overview: m.overview || null,
      year: Number(String(m.release_date ?? "").slice(0, 4)) || null,
      release_date: (m.release_date as string) || null,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
      genres: m.genre_ids ?? [],
      original_language: lang(m.original_language as string),
      popularity: m.popularity,
      is_active: true,
    })),
    ...series.map((s) => ({
      kind: "series",
      tmdb_id: s.id,
      title: s.name,
      original_title: s.original_name,
      overview: s.overview || null,
      year: Number(String(s.first_air_date ?? "").slice(0, 4)) || null,
      poster_path: s.poster_path,
      backdrop_path: s.backdrop_path,
      genres: s.genre_ids ?? [],
      original_language: lang(s.original_language as string),
      popularity: s.popularity,
      is_active: true,
    })),
  ];

  const { error, count } = await sb.from("media_titles").upsert(rows, { onConflict: "kind,tmdb_id", count: "exact" });
  if (error) throw error;
  console.log(`Sincronizados ${count ?? rows.length} títulos desde TMDB.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
