import "server-only";
import { createClient } from "@/lib/supabase/server";
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

export async function getChannels(kind?: Channel["kind"]): Promise<Channel[]> {
  const sb = await db();
  let q = sb.from("channels").select("*").eq("is_active", true).order("logical_number");
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return (data as Channel[]) ?? [];
}

export async function getChannel(id: string): Promise<Channel | null> {
  const sb = await db();
  const { data } = await sb.from("channels").select("*").eq("id", id).maybeSingle();
  return (data as Channel) ?? null;
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

export async function search(query: string): Promise<MediaTitle[]> {
  const sb = await db();
  const { data } = await sb
    .from("media_titles")
    .select("*")
    .ilike("title", `%${query}%`)
    .eq("is_active", true)
    .limit(30);
  return (data as MediaTitle[]) ?? [];
}
