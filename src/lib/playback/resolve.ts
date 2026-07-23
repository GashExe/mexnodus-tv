import "server-only";
import { createClient } from "@/lib/supabase/server";
import { selectPlayback, trustToScore, type Candidate, type SelectionResult } from "./engine";
import { DEFAULT_WEIGHTS } from "./weights";
import { DEFAULT_AUDIO_PRIORITY, DEFAULT_SUBTITLE_PRIORITY } from "@/lib/language";
import type { LangCode, UserPreferences } from "@/lib/types/db";

/**
 * Carga las disponibilidades de un contenido y ejecuta el Playback Selection
 * Engine con las preferencias del usuario. Server-only. RLS ya filtra a lo
 * reproducible para usuarios normales; el engine reaplica el gate por si el
 * actor es staff (que sí ve las no autorizadas) — nunca las seleccionará.
 */

type Target = { kind: "title"; id: string } | { kind: "episode"; id: string } | { kind: "channel"; id: string };

async function loadPreferences(userId: string | null): Promise<UserPreferences | null> {
  if (!userId) return null;
  const sb = await createClient();
  const { data } = await sb.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
  return (data as UserPreferences) ?? null;
}

function toCandidate(row: Record<string, unknown>): Candidate {
  const providerTrust =
    typeof row.provider_trust_level === "string"
      ? trustToScore(row.provider_trust_level)
      : trustToScore((row.providers as { trust_level?: string })?.trust_level ?? "untrusted");
  return {
    id: row.id as string,
    provider_id: row.provider_id as string,
    playback_type: row.playback_type as Candidate["playback_type"],
    play_url: (row.play_url as string) ?? null,
    resolution_height: (row.resolution_height as number) ?? null,
    bitrate_kbps: (row.bitrate_kbps as number) ?? null,
    fps: (row.fps as number) ?? null,
    video_codec: (row.video_codec as string) ?? null,
    hdr: !!row.hdr,
    dolby_vision: !!row.dolby_vision,
    audio_51: !!row.audio_51,
    startup_ms: (row.startup_ms as number) ?? null,
    stability: (row.stability as number) ?? null,
    uptime_pct: (row.uptime_pct as number) ?? null,
    last_checked_at: (row.last_checked_at as string) ?? null,
    review_status: row.review_status as Candidate["review_status"],
    publish_authorization: row.publish_authorization as Candidate["publish_authorization"],
    region_restrictions: (row.region_restrictions as string[]) ?? null,
    priority: (row.priority as number) ?? 0,
    audio_languages: ((row.audio_languages as LangCode[]) ?? []) as LangCode[],
    subtitle_languages: ((row.subtitle_languages as LangCode[]) ?? []) as LangCode[],
    provider_trust: providerTrust,
  };
}

export async function resolvePlayback(
  target: Target,
  userId: string | null,
): Promise<{ result: SelectionResult; country: string }> {
  const sb = await createClient();

  const col =
    target.kind === "title" ? "media_title_id" : target.kind === "episode" ? "episode_id" : "channel_id";

  const { data: rows } = await sb
    .from("media_availabilities")
    .select("*, providers(trust_level)")
    .eq(col, target.id)
    .eq("is_active", true);

  const candidates = (rows ?? []).map(toCandidate);

  const prefs = await loadPreferences(userId);
  const country = "MX";
  const result = selectPlayback(candidates, {
    preferences: {
      audioPriority: (prefs?.audio_priority as LangCode[]) ?? DEFAULT_AUDIO_PRIORITY,
      subtitlePriority: (prefs?.subtitle_priority as LangCode[]) ?? DEFAULT_SUBTITLE_PRIORITY,
      maxResolution: prefs?.max_resolution ?? 1080,
      preferHdr: prefs?.prefer_hdr ?? false,
      country,
    },
    weights: DEFAULT_WEIGHTS,
  });

  return { result, country };
}
