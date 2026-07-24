import "server-only";
import { createClient } from "@/lib/supabase/server";
import { selectPlayback, trustToScore, type Candidate, type SelectionResult } from "./engine";
import { DEFAULT_WEIGHTS } from "./weights";
import { DEFAULT_AUDIO_PRIORITY, DEFAULT_SUBTITLE_PRIORITY } from "@/lib/language";
import { getAdapter, type AdapterContext } from "@/lib/providers/registry";
import type { LangCode, UserPreferences } from "@/lib/types/db";

/** Adaptadores dinámicos: sintetizan la URL al vuelo, sin fila por título. */
const DYNAMIC_ADAPTERS = ["pattern-embed"];

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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Contexto TMDB (id + temporada/episodio) del objetivo, para los adaptadores. */
async function loadTmdbContext(
  sb: Supabase,
  target: Target,
): Promise<Pick<AdapterContext, "externalIds" | "kind" | "season" | "episode"> | null> {
  if (target.kind === "title") {
    const { data } = await sb
      .from("media_titles")
      .select("tmdb_id, kind")
      .eq("id", target.id)
      .maybeSingle();
    const t = data as { tmdb_id: number | null; kind: string } | null;
    if (!t?.tmdb_id) return null;
    return { externalIds: { tmdb_id: t.tmdb_id }, kind: t.kind === "series" ? "series" : "movie" };
  }
  if (target.kind === "episode") {
    const { data } = await sb
      .from("episodes")
      .select("season_number, episode_number, series_id")
      .eq("id", target.id)
      .maybeSingle();
    const ep = data as { season_number: number; episode_number: number; series_id: string } | null;
    if (!ep) return null;
    const { data: series } = await sb
      .from("media_titles")
      .select("tmdb_id")
      .eq("id", ep.series_id)
      .maybeSingle();
    const tmdb = (series as { tmdb_id: number | null } | null)?.tmdb_id;
    if (!tmdb) return null;
    return {
      externalIds: { tmdb_id: tmdb },
      kind: "episode",
      season: ep.season_number,
      episode: ep.episode_number,
    };
  }
  return null; // canales/eventos no usan patrón TMDB
}

/**
 * Sintetiza candidatos al vuelo desde los proveedores dinámicos (patrón por
 * TMDB). No hay fila en `media_availabilities`: la autorización es a nivel de
 * proveedor (primera parte, `is_active` + `trust_level`).
 */
async function synthesizeDynamicCandidates(sb: Supabase, target: Target): Promise<Candidate[]> {
  const ctx = await loadTmdbContext(sb, target);
  if (!ctx) return [];

  const { data: providers } = await sb
    .from("providers")
    .select("id, adapter, public_config, trust_level, priority")
    .eq("is_active", true)
    .in("adapter", DYNAMIC_ADAPTERS);

  const out: Candidate[] = [];
  for (const p of (providers ?? []) as {
    id: string;
    adapter: string;
    public_config: Record<string, unknown> | null;
    trust_level: string;
    priority: number | null;
  }[]) {
    const adapter = getAdapter(p.adapter);
    if (!adapter) continue;
    const sources = adapter.resolve({ ...ctx, publicConfig: p.public_config ?? {} });
    sources.forEach((s, i) => {
      out.push({
        id: `dyn:${p.id}:${target.id}:${i}`,
        provider_id: p.id,
        playback_type: s.playbackType,
        play_url: s.url,
        resolution_height: null,
        bitrate_kbps: null,
        fps: null,
        video_codec: null,
        hdr: false,
        dolby_vision: false,
        audio_51: false,
        startup_ms: null,
        stability: null,
        uptime_pct: null,
        last_checked_at: null,
        review_status: "approved",
        publish_authorization: "authorized",
        region_restrictions: null,
        priority: p.priority ?? 0,
        audio_languages: (s.audioLanguages as LangCode[]) ?? [],
        subtitle_languages: (s.subtitleLanguages as LangCode[]) ?? [],
        provider_trust: trustToScore(p.trust_level),
      });
    });
  }
  return out;
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

  const stored = (rows ?? []).map(toCandidate);
  const dynamic = await synthesizeDynamicCandidates(sb, target);
  const candidates = [...stored, ...dynamic];

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
