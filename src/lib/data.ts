import "server-only";
import { cache } from "react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasTmdb } from "@/lib/env";
import { tmdbSearch, toMediaTitleRow } from "@/lib/tmdb";
import type { Channel, ChannelStream, Episode, MediaTitle, Season } from "@/lib/types/db";

/**
 * Capa de acceso a datos (server-only). Todas las consultas pasan por RLS:
 * el catálogo es de lectura pública, los datos de usuario son privados.
 * Ante error/entorno sin datos, devuelven vacío para no romper el render.
 */

async function db() {
  return createClient();
}

export async function getFeatured(kind?: MediaTitle["kind"]): Promise<MediaTitle[]> {
  const sb = await db();
  let q = sb.from("media_titles").select("*").eq("is_active", true).order("popularity", { ascending: false }).limit(18);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return (data as MediaTitle[]) ?? [];
}

export async function getByKinds(kinds: MediaTitle["kind"][], limit = 18): Promise<MediaTitle[]> {
  const sb = await db();
  const { data } = await sb
    .from("media_titles")
    .select("*")
    .in("kind", kinds)
    .eq("is_active", true)
    .order("popularity", { ascending: false })
    .limit(limit);
  return (data as MediaTitle[]) ?? [];
}

export async function getRecent(limit = 18): Promise<MediaTitle[]> {
  const sb = await db();
  const { data } = await sb
    .from("media_titles")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as MediaTitle[]) ?? [];
}

/** Contenido con audio o subtítulos en español (vía disponibilidades reproducibles). */
export async function getSpanishTitles(limit = 18): Promise<MediaTitle[]> {
  const sb = await db();
  // títulos que tienen alguna disponibilidad autorizada con español en audio
  const { data } = await sb
    .from("media_availabilities")
    .select("media_title_id, media_titles!inner(*)")
    .contains("audio_languages", ["es-419"])
    .eq("review_status", "approved")
    .eq("publish_authorization", "authorized")
    .limit(limit);
  const titles = (data ?? [])
    .map((r: Record<string, unknown>) => r.media_titles as MediaTitle)
    .filter(Boolean);
  // dedup por id
  const seen = new Set<string>();
  return titles.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

export async function getTitle(id: string): Promise<MediaTitle | null> {
  const sb = await db();
  const { data } = await sb.from("media_titles").select("*").eq("id", id).maybeSingle();
  return (data as MediaTitle) ?? null;
}

export async function getSeasons(seriesId: string): Promise<Season[]> {
  const sb = await db();
  const { data } = await sb.from("seasons").select("*").eq("series_id", seriesId).order("season_number");
  return (data as Season[]) ?? [];
}

export async function getEpisodes(seasonId: string): Promise<Episode[]> {
  const sb = await db();
  const { data } = await sb.from("episodes").select("*").eq("season_id", seasonId).order("episode_number");
  return (data as Episode[]) ?? [];
}

export interface ChannelQuery {
  kind?: Channel["kind"];
  country?: string;
  category?: string;
  limit?: number;
}

/**
 * Canales activos, FILTRADOS EN EL SERVIDOR por país/categoría. Imprescindible:
 * Supabase limita cada consulta a 1000 filas, así que sin filtro server-side los
 * miles de canales importados quedarían invisibles. Con filtro (p.ej. país=MX)
 * la consulta devuelve justo ese subconjunto.
 */
export async function getChannels(opts: ChannelQuery = {}): Promise<Channel[]> {
  const sb = await db();
  let q = sb.from("channels").select("*").eq("is_active", true);
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.country) q = q.eq("country", opts.country);
  if (opts.category) q = q.contains("categories", [opts.category]);
  q = q
    .order("logical_number", { nullsFirst: false })
    .order("name")
    .limit(opts.limit ?? 1000);
  const { data } = await q;
  return (data as Channel[]) ?? [];
}

/**
 * Facetas para los filtros. Los países se calculan sobre TODO el catálogo; las
 * categorías, solo sobre los canales del país seleccionado (si lo hay), para
 * que el desplegable no ofrezca categorías sin resultados. Pagina porque
 * Supabase corta en 1000 filas por consulta. Cacheado por render.
 */
export const getChannelFacets = cache(
  async (country?: string): Promise<{ countries: string[]; categories: string[] }> => {
    const sb = await db();
    const countries = new Set<string>();
    const categories = new Set<string>();
    for (let from = 0; from < 60000; from += 1000) {
      const { data } = await sb
        .from("channels")
        .select("country, categories")
        .eq("is_active", true)
        .range(from, from + 999);
      if (!data?.length) break;
      for (const r of data as { country: string | null; categories: string[] | null }[]) {
        if (r.country) countries.add(r.country);
        if (!country || r.country === country) {
          for (const c of r.categories ?? []) categories.add(c);
        }
      }
      if (data.length < 1000) break;
    }
    return {
      countries: [...countries].sort(),
      categories: [...categories].sort((a, b) => a.localeCompare(b, "es")),
    };
  },
);

export async function getChannel(id: string): Promise<Channel | null> {
  const sb = await db();
  const { data } = await sb.from("channels").select("*").eq("id", id).maybeSingle();
  return (data as Channel) ?? null;
}

/**
 * Canales similares para "quizá te guste": prioriza mismo país + categorías en
 * común; rellena con el mismo país y, en último término, con la misma
 * categoría en cualquier país. "General" no cuenta como afinidad.
 */
export async function getRelatedChannels(ch: Channel, limit = 9): Promise<Channel[]> {
  const sb = await db();
  const out: Channel[] = [];
  const seen = new Set<string>([ch.id]);
  const cats = (ch.categories ?? []).filter((c) => c !== "General");

  const push = (rows: Channel[] | null) => {
    for (const r of rows ?? []) {
      if (out.length >= limit) return;
      if (!seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
  };

  const base = () =>
    sb.from("channels").select("*").eq("is_active", true).eq("kind", "tv").neq("id", ch.id);

  if (ch.country && cats.length) {
    const { data } = await base().eq("country", ch.country).overlaps("categories", cats).limit(limit);
    push(data as Channel[]);
  }
  if (out.length < limit && ch.country) {
    const { data } = await base().eq("country", ch.country).limit(limit * 2);
    push(data as Channel[]);
  }
  if (out.length < limit && cats.length) {
    const { data } = await base().overlaps("categories", cats).limit(limit * 2);
    push(data as Channel[]);
  }
  return out;
}

export async function getPlayableChannelStreams(channelId: string): Promise<ChannelStream[]> {
  const sb = await db();
  const { data } = await sb
    .from("channel_streams")
    .select("*")
    .eq("channel_id", channelId)
    .eq("is_active", true)
    .eq("review_status", "approved")
    .eq("publish_authorization", "authorized")
    .order("priority", { ascending: false });
  return (data as ChannelStream[]) ?? [];
}

export interface GuideEntry {
  channel: Channel;
  current: { title: string; starts_at: string; ends_at: string } | null;
  next: { title: string; starts_at: string } | null;
}

/**
 * Canales (filtrados en servidor) con su programa actual y el siguiente.
 * Toma los canales vía getChannels (respeta país/categoría y el tope de 1000) y
 * cruza los programas SOLO de esos canales.
 */
export async function getGuide(opts: ChannelQuery = {}): Promise<GuideEntry[]> {
  const channels = await getChannels(opts);
  if (!channels.length) return [];

  const sb = await db();
  const nowIso = new Date().toISOString();
  const fromIso = new Date(Date.now() - 3 * 3600_000).toISOString();
  const toIso = new Date(Date.now() + 12 * 3600_000).toISOString();

  const { data: programs } = await sb
    .from("programs")
    .select("channel_id, title, starts_at, ends_at")
    .in("channel_id", channels.map((c) => c.id))
    .gte("ends_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at");

  const byChannel = new Map<string, { title: string; starts_at: string; ends_at: string }[]>();
  for (const p of (programs ?? []) as { channel_id: string; title: string; starts_at: string; ends_at: string }[]) {
    const arr = byChannel.get(p.channel_id) ?? [];
    arr.push(p);
    byChannel.set(p.channel_id, arr);
  }

  return channels.map((channel) => {
    const list = byChannel.get(channel.id) ?? [];
    const current = list.find((p) => p.starts_at <= nowIso && p.ends_at > nowIso) ?? null;
    const next = list.find((p) => p.starts_at > nowIso) ?? null;
    return { channel, current, next: next ? { title: next.title, starts_at: next.starts_at } : null };
  });
}

export async function getCurrentProgram(channelId: string) {
  const sb = await db();
  const nowIso = new Date().toISOString();
  const { data: current } = await sb
    .from("programs")
    .select("*")
    .eq("channel_id", channelId)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .maybeSingle();
  const { data: next } = await sb
    .from("programs")
    .select("*")
    .eq("channel_id", channelId)
    .gt("starts_at", nowIso)
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  return { current, next };
}

// ── datos de usuario ──
export async function getFavorites(userId: string): Promise<MediaTitle[]> {
  const sb = await db();
  const { data } = await sb
    .from("user_favorites")
    .select("media_titles(*)")
    .eq("user_id", userId)
    .not("media_title_id", "is", null);
  return (data ?? []).map((r: Record<string, unknown>) => r.media_titles as MediaTitle).filter(Boolean);
}

export async function isFavorite(userId: string, titleId: string): Promise<boolean> {
  const sb = await db();
  const { data } = await sb
    .from("user_favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("media_title_id", titleId)
    .maybeSingle();
  return !!data;
}

export async function getContinueWatching(userId: string) {
  const sb = await db();
  const { data } = await sb
    .from("watch_progress")
    .select("*, media_titles(*)")
    .eq("user_id", userId)
    .eq("completed", false)
    .order("updated_at", { ascending: false })
    .limit(12);
  return data ?? [];
}

async function searchLocal(sb: Awaited<ReturnType<typeof db>>, query: string): Promise<MediaTitle[]> {
  const { data } = await sb
    .from("media_titles")
    .select("*")
    .ilike("title", `%${query}%`)
    .eq("is_active", true)
    .order("popularity", { ascending: false })
    .limit(40);
  return (data as MediaTitle[]) ?? [];
}

/**
 * Busca en el catálogo local; si hay pocos resultados y TMDB está configurado,
 * consulta TMDB en vivo, IMPORTA los títulos encontrados al catálogo (upsert con
 * el cliente admin) y los devuelve ya como fichas navegables. Así una búsqueda
 * de algo que no estaba entre lo sembrado lo trae y lo deja disponible.
 */
export async function search(query: string): Promise<MediaTitle[]> {
  const q = query.trim();
  if (!q) return [];
  const sb = await db();
  const local = await searchLocal(sb, q);

  // Suficiente en catálogo, o sin TMDB → no hace falta ir a la red.
  if (local.length >= 6 || !hasTmdb()) return local;

  try {
    const { results } = await tmdbSearch(q);
    const rows = results
      .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path)
      .slice(0, 20)
      .map((r) => toMediaTitleRow(r, r.media_type === "movie" ? "movie" : "series"));
    if (!rows.length) return local;

    // Upsert con service-role (el catálogo no es escribible por RLS pública) y
    // recupera las filas YA con su id. No re-consultamos por texto: TMDB guarda
    // los títulos en español ("Hereditary" → "El legado del diablo") y el texto
    // buscado no coincidiría.
    const { data: imported } = await createAdminClient()
      .from("media_titles")
      .upsert(rows, { onConflict: "kind,tmdb_id" })
      .select("*");

    const seen = new Set(local.map((l) => l.id));
    const merged = [...local];
    for (const row of (imported as MediaTitle[]) ?? []) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }
    merged.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return merged;
  } catch {
    return local; // ante fallo de TMDB, al menos lo local
  }
}
