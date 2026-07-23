import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { hasTmdb } from "@/lib/env";
import { tmdbPopularMovies, tmdbPopularSeries, toMediaTitleRow } from "@/lib/tmdb";

/**
 * Sincroniza metadatos desde TMDB hacia media_titles (upsert por (kind, tmdb_id)).
 * Solo metadatos: NO crea disponibilidades ni URLs de reproducción.
 * Corre en el servidor con un límite de páginas bajo (apto para Vercel).
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

  const supabase = await createClient();
  try {
    const [movies, series] = await Promise.all([tmdbPopularMovies(1), tmdbPopularSeries(1)]);
    const rows = [
      ...movies.map((m) => toMediaTitleRow(m, "movie")),
      ...series.map((s) => toMediaTitleRow(s, "series")),
    ];
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
