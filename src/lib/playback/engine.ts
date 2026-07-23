/**
 * Playback Selection Engine
 * =========================
 * Módulo puro (sin I/O). Recibe disponibilidades de UN contenido y devuelve la
 * mejor opción reproducible más una lista ordenada de fallbacks, con las
 * razones y la puntuación de cada candidato.
 *
 * Reglas duras (gates), evaluadas ANTES de puntuar:
 *   1. Debe estar aprobada para reproducción:
 *        review_status === "approved" && publish_authorization === "authorized"
 *   2. No debe estar geobloqueada para el país del usuario.
 *   3. El tipo de reproducción debe ser soportado por el dispositivo.
 * Solo los candidatos que pasan los gates se puntúan con pesos configurables.
 *
 * No se selecciona 4K inestable en inglés sobre 1080p estable en español si las
 * preferencias priorizan español: el peso de idioma domina al de resolución.
 */
import type { LangCode, MediaAvailability } from "@/lib/types/db";
import {
  languageMatchScore,
  hasLatamAudio,
  hasSpanishAudio,
  SPANISH_LATAM,
  SPANISH_ANY,
} from "@/lib/language";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_DEVICE,
  type PlaybackWeights,
  type SelectionPreferences,
  type DeviceCapabilities,
} from "./weights";

/** Entrada mínima que el motor necesita de cada disponibilidad. */
export interface Candidate
  extends Pick<
    MediaAvailability,
    | "id"
    | "provider_id"
    | "playback_type"
    | "play_url"
    | "resolution_height"
    | "bitrate_kbps"
    | "fps"
    | "video_codec"
    | "hdr"
    | "dolby_vision"
    | "audio_51"
    | "startup_ms"
    | "stability"
    | "uptime_pct"
    | "last_checked_at"
    | "review_status"
    | "publish_authorization"
    | "region_restrictions"
    | "priority"
  > {
  audio_languages: LangCode[];
  subtitle_languages: LangCode[];
  /** 0..100; confiabilidad del proveedor, resuelta desde providers.trust_level */
  provider_trust: number;
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  eligible: boolean;
  rejectionReason?: string;
  reasons: string[];
  /** desglose por factor (para debugging/UI admin) */
  breakdown: Record<string, number>;
}

export interface SelectionResult {
  primary: ScoredCandidate | null;
  alternatives: ScoredCandidate[];
  fallbacks: ScoredCandidate[]; // = alternatives, orden de reintento
  rejected: ScoredCandidate[];
  evaluatedAt: string;
}

export interface SelectionContext {
  preferences: SelectionPreferences;
  device?: DeviceCapabilities;
  weights?: PlaybackWeights;
}

const TRUST_MAP: Record<string, number> = {
  untrusted: 0,
  low: 25,
  medium: 55,
  high: 80,
  verified: 100,
};

export function trustToScore(level: string): number {
  return TRUST_MAP[level] ?? 0;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Rango 0..1 de la resolución respecto al máximo preferido/soportado. */
function resolutionScore(height: number | null, cap: number): number {
  if (!height) return 0;
  const usable = Math.min(height, cap);
  return clamp01(usable / 2160);
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / 86_400_000;
}

/** ¿El dispositivo puede reproducir este candidato? */
function deviceSupports(c: Candidate, device: DeviceCapabilities): boolean {
  if (c.playback_type === "hls" && !device.supportsHls) return false;
  if (c.playback_type === "dash" && !device.supportsDash) return false;
  if ((c.video_codec === "hevc" || c.video_codec === "h265") && !device.hevc) return false;
  return true;
}

/** ¿Está permitido geográficamente para el país del usuario? */
function geoAllowed(c: Candidate, country: string): boolean {
  const r = c.region_restrictions;
  if (!r || r.length === 0) return true; // sin restricciones declaradas
  // Convención: lista blanca de países permitidos.
  return r.map((x) => x.toUpperCase()).includes(country.toUpperCase());
}

/** Gate de autorización: la regla más importante y no negociable. */
export function isPlayable(c: Pick<Candidate, "review_status" | "publish_authorization">): boolean {
  return c.review_status === "approved" && c.publish_authorization === "authorized";
}

function scoreCandidate(
  c: Candidate,
  ctx: Required<SelectionContext>,
): ScoredCandidate {
  const { preferences: prefs, device, weights: w } = ctx;
  const reasons: string[] = [];
  const breakdown: Record<string, number> = {};

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!isPlayable(c)) {
    return {
      candidate: c,
      score: 0,
      eligible: false,
      rejectionReason:
        c.publish_authorization !== "authorized"
          ? "No autorizada para publicación"
          : "Revisión no aprobada",
      reasons: [],
      breakdown,
    };
  }
  if (!geoAllowed(c, prefs.country)) {
    return { candidate: c, score: 0, eligible: false, rejectionReason: "Bloqueada en tu región", reasons: [], breakdown };
  }
  if (device && !deviceSupports(c, device)) {
    return { candidate: c, score: 0, eligible: false, rejectionReason: "Incompatible con el dispositivo", reasons: [], breakdown };
  }

  const add = (key: string, factor01: number, weight: number, reason?: string) => {
    const contribution = clamp01(factor01) * weight;
    breakdown[key] = Math.round(contribution * 100) / 100;
    if (reason && factor01 > 0) reasons.push(reason);
    return contribution;
  };

  let score = 0;

  // ── Idioma de audio ────────────────────────────────────────────────────
  const audio = c.audio_languages ?? [];
  if (hasLatamAudio(audio)) {
    score += add("audioLatam", 1, w.audioLatam, "Audio en español latino");
  } else {
    breakdown.audioLatam = 0;
  }
  if (hasSpanishAudio(audio) && !hasLatamAudio(audio)) {
    // español no-latino (genérico o castellano)
    const isES = audio.includes("es-ES");
    if (isES) {
      score += add("audioSpanishES", 1, w.audioSpanishES, "Audio en español (España)");
    } else {
      score += add("audioSpanish", 1, w.audioSpanish, "Audio en español");
    }
  }
  // matiz fino por orden exacto de preferencia del usuario
  score += add("audioPref", languageMatchScore(audio, prefs.audioPriority), 6);

  // ── Subtítulos en español (útil cuando no hay audio español) ────────────
  const subs = c.subtitle_languages ?? [];
  const needsSpanishSubs = !hasSpanishAudio(audio);
  if (needsSpanishSubs && subs.some((s) => SPANISH_ANY.includes(s))) {
    score += add("subtitlesSpanish", 1, w.subtitlesSpanish, "Subtítulos en español");
  } else {
    breakdown.subtitlesSpanish = 0;
  }

  // ── Calidad técnica ──────────────────────────────────────────────────────
  const cap = Math.min(prefs.maxResolution, device?.maxResolution ?? 2160);
  score += add("resolution", resolutionScore(c.resolution_height, cap), w.resolution,
    c.resolution_height ? `${c.resolution_height}p` : undefined);
  score += add("bitrate", clamp01((c.bitrate_kbps ?? 0) / 12000), w.bitrate);
  if (c.hdr && prefs.preferHdr && (device?.hdr ?? false)) {
    score += add("hdr", 1, w.hdr, c.dolby_vision ? "Dolby Vision" : "HDR");
  } else {
    breakdown.hdr = 0;
  }
  score += add("audioChannels", c.audio_51 ? 1 : 0, w.audioChannels, c.audio_51 ? "Audio 5.1" : undefined);

  // ── Fiabilidad ───────────────────────────────────────────────────────────
  score += add("stability", clamp01((c.stability ?? 50) / 100), w.stability,
    (c.stability ?? 0) >= 80 ? "Fuente estable" : undefined);
  // arranque: menor es mejor. 500ms→~1, 6000ms→~0
  const startup01 = c.startup_ms ? clamp01(1 - (c.startup_ms - 500) / 5500) : 0.5;
  score += add("startupSpeed", startup01, w.startupSpeed);
  const recency01 = clamp01(1 - daysSince(c.last_checked_at) / 30); // verificado hace <30d
  score += add("recentlyVerified", recency01, w.recentlyVerified,
    recency01 > 0.5 ? "Verificada recientemente" : undefined);
  score += add("providerTrust", clamp01(c.provider_trust / 100), w.providerTrust,
    c.provider_trust >= 80 ? "Proveedor de confianza" : undefined);

  // ── Compatibilidad y gates suaves (ya pasaron los duros) ────────────────
  score += add("deviceCompatibility", 1, w.deviceCompatibility);
  score += add("authorization", 1, w.authorization);
  score += add("geoAllowed", 1, w.geoAllowed);

  return {
    candidate: c,
    score: Math.round(score * 100) / 100,
    eligible: true,
    reasons,
    breakdown,
  };
}

/**
 * Selecciona la mejor disponibilidad y ordena los fallbacks.
 * Empates se rompen por `priority` declarada y luego por estabilidad.
 */
export function selectPlayback(
  candidates: Candidate[],
  ctx: SelectionContext,
): SelectionResult {
  const full: Required<SelectionContext> = {
    preferences: ctx.preferences,
    device: ctx.device ?? DEFAULT_DEVICE,
    weights: ctx.weights ?? DEFAULT_WEIGHTS,
  };

  const scored = candidates.map((c) => scoreCandidate(c, full));
  const eligible = scored
    .filter((s) => s.eligible)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.candidate.priority !== a.candidate.priority)
        return b.candidate.priority - a.candidate.priority;
      return (b.candidate.stability ?? 0) - (a.candidate.stability ?? 0);
    });
  const rejected = scored.filter((s) => !s.eligible);

  return {
    primary: eligible[0] ?? null,
    alternatives: eligible.slice(1),
    fallbacks: eligible.slice(1),
    rejected,
    evaluatedAt: new Date().toISOString(),
  };
}
