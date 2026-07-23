import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { hasTmdb } from "@/lib/env";
import {
  tmdbPopularMovies,
  tmdbPopularSeries,
  tmdbTopRatedMovies,
  tmdbTopRatedSeries,
  tmdbPages,
  toMediaTitleRow,
} from "@/lib/tmdb";

export const maxDuration = 120;

/**
 * Sincroniza metadatos desde TMDB hacia media_titles (upsert por (kind, tmdb_id)).
 * Solo metadatos: NO crea disponibilidades ni URLs de reproducción.
 * Trae varias páginas de populares + mejor valoradas (acotado para Vercel).
 */
export async function POST() {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) return NextResponse.json({ error: "no auth" }, { status: 403 });
  if (!hasTmdb()) {
    return NextResponse.json(
      { error: "TMDB no configurado. Define TMDB_ACCESS_TOKEN para sincronizar (mientras tanto usa los seeds mock)." },
      { status: 400 },
    );
  }

  const PAGES = 8; // 8 páginas × 20 × 4 listas ≈ 640 títulos por sync
  const supabase = await createClient();
  try {
    const [popM, topM, popS, topS] = await Promise.all([
      tmdbPages(tmdbPopularMovies, PAGES),
      tmdbPages(tmdbTopRatedMovies, PAGES),
      tmdbPages(tmdbPopularSeries, PAGES),
      tmdbPages(tmdbTopRatedSeries, PAGES),
    ]);
    // dedup por (kind, tmdb_id) antes del upsert
    const map = new Map<string, ReturnType<typeof toMediaTitleRow>>();
    for (const m of [...popM, ...topM]) map.set(`movie:${m.id}`, toMediaTitleRow(m, "movie"));
    for (const s of [...popS, ...topS]) map.set(`series:${s.id}`, toMediaTitleRow(s, "series"));
    const rows = [...map.values()];
    const { error, count } = await supabase
      .from("media_titles")
      .upsert(rows, { onConflict: "kind,tmdb_id", count: "exact" });
    if (error) throw error;

    await supabase.from("import_jobs").insert({
      kind: "tmdb",
      status: "done",
      created_by: actor.id,
      total: rows.length,
      processed: rows.length,
      succeeded: count ?? rows.length,
      finished_at: new Date().toISOString(),
    });
    await supabase.from("audit_logs").insert({ actor_id: actor.id, action: "tmdb.sync", metadata: { count: rows.length } });

    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
