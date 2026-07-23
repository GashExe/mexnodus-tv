/**
 * Tipos del dominio de MexNodus TV.
 * Reflejan el esquema SQL de supabase/migrations. El modelo separa por diseño:
 *   Identidad ≠ Metadatos ≠ Proveedor ≠ Disponibilidad ≠ URL ≠ Calidad ≠ Revisión.
 */

// ── Enumeraciones (espejo de los ENUM de Postgres) ──────────────────────────
export type AppRole = "user" | "reviewer" | "admin";

export type MediaKind = "movie" | "series" | "documentary" | "kids" | "anime";

export type ChannelKind = "tv" | "radio" | "fast" | "event";

export type PlaybackType = "hls" | "dash" | "file" | "embed" | "jellyfin" | "iptv";

export type TechStatus = "unknown" | "online" | "degraded" | "offline";

export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";

export type PublishAuthorization = "unauthorized" | "authorized" | "revoked";

export type ProviderType =
  | "official"
  | "public_domain"
  | "government"
  | "university"
  | "fast"
  | "user"
  | "jellyfin"
  | "m3u"
  | "aggregate";

export type TrustLevel = "untrusted" | "low" | "medium" | "high" | "verified";

/** Idiomas modelados explícitamente (no se infieren del título). */
export type LangCode =
  | "es-MX"
  | "es-419"
  | "es-ES"
  | "es"
  | "en"
  | "pt-BR"
  | "mul"
  | "und";

// ── Catálogo canónico ───────────────────────────────────────────────────────
export interface MediaTitle {
  id: string;
  kind: MediaKind;
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;
  anilist_id: number | null;
  external_ids: Record<string, string | number> | null;
  title: string;
  original_title: string | null;
  alternative_titles: string[] | null;
  overview: string | null;
  year: number | null;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: number[] | null;
  age_rating: string | null;
  runtime_minutes: number | null;
  original_language: LangCode | string | null;
  origin_country: string[] | null;
  status: string | null;
  popularity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  series_id: string;
  season_number: number;
  title: string | null;
  overview: string | null;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number | null;
}

export interface Episode {
  id: string;
  series_id: string;
  season_id: string;
  season_number: number;
  episode_number: number;
  title: string | null;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime_minutes: number | null;
  tmdb_id: number | null;
}

// ── Proveedores ─────────────────────────────────────────────────────────────
export interface Provider {
  id: string;
  slug: string;
  name: string;
  type: ProviderType;
  domain: string | null;
  status: TechStatus;
  country: string | null;
  languages: LangCode[] | null;
  capabilities: ProviderCapabilities;
  regions: string[] | null;
  priority: number;
  trust_level: TrustLevel;
  risk_level: number; // 0..100
  last_reviewed_at: string | null;
  adapter: string; // clave del adaptador registrado
  public_config: Record<string, unknown> | null;
  // secret_config vive en tabla aparte, jamás se serializa al cliente
  is_active: boolean;
  created_at: string;
}

export interface ProviderCapabilities {
  movies?: boolean;
  series?: boolean;
  iptv?: boolean;
  radio?: boolean;
  subtitles?: boolean;
  multi_audio?: boolean;
  hls?: boolean;
  dash?: boolean;
  direct_file?: boolean;
  embed?: boolean;
  requires_auth?: boolean;
}

// ── Disponibilidades y pistas ───────────────────────────────────────────────
export interface MediaAvailability {
  id: string;
  provider_id: string;
  // exactamente una de estas relaciones está presente (CHECK en SQL)
  media_title_id: string | null;
  episode_id: string | null;
  channel_id: string | null;
  event_id: string | null;
  playback_type: PlaybackType;
  play_url: string | null;
  official_page: string | null;
  country: string | null;
  region_restrictions: string[] | null;
  requires_auth: boolean;
  requires_subscription: boolean;
  resolution_height: number | null; // 480, 720, 1080, 2160
  bitrate_kbps: number | null;
  fps: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  hdr: boolean;
  dolby_vision: boolean;
  audio_51: boolean;
  audio_languages: LangCode[] | null;
  subtitle_languages: LangCode[] | null;
  startup_ms: number | null;
  stability: number | null; // 0..100
  uptime_pct: number | null; // 0..100
  last_checked_at: string | null;
  tech_status: TechStatus;
  review_status: ReviewStatus;
  publish_authorization: PublishAuthorization;
  priority: number;
  final_score: number | null;
  is_active: boolean;
  created_at: string;
}

export interface AudioTrack {
  id: string;
  availability_id: string;
  language: LangCode | string;
  label: string | null;
  codec: string | null;
  channels: number | null;
  is_forced: boolean;
  is_hearing_impaired: boolean;
  is_default: boolean;
  origin: string | null; // "declared" | "probed" | "manual"
  verification_status: "unverified" | "verified" | "failed";
}

export interface SubtitleTrack {
  id: string;
  availability_id: string;
  language: LangCode | string;
  label: string | null;
  codec: string | null;
  is_forced: boolean;
  is_hearing_impaired: boolean;
  is_default: boolean;
  origin: string | null;
  verification_status: "unverified" | "verified" | "failed";
}

// ── Canales / IPTV ──────────────────────────────────────────────────────────
export interface Channel {
  id: string;
  slug: string;
  name: string;
  kind: ChannelKind;
  logo_path: string | null;
  country: string | null;
  language: LangCode | string | null;
  categories: string[] | null;
  logical_number: number | null;
  is_live: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ChannelStream {
  id: string;
  channel_id: string;
  provider_id: string | null;
  label: string | null;
  play_url: string;
  playback_type: PlaybackType;
  is_primary: boolean;
  priority: number;
  resolution_height: number | null;
  fps: number | null;
  bitrate_kbps: number | null;
  latency_ms: number | null;
  response_ms: number | null;
  tech_status: TechStatus;
  review_status: ReviewStatus;
  publish_authorization: PublishAuthorization;
  stability: number | null;
  uptime_pct: number | null;
  last_checked_at: string | null;
  is_active: boolean;
}

// ── Datos de usuario ────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  country: string;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  audio_priority: LangCode[];
  subtitle_priority: LangCode[];
  max_resolution: number; // 480|720|1080|2160
  autoplay_next: boolean;
  data_saver: boolean;
  prefer_hdr: boolean;
  player_prefs: Record<string, unknown>;
  updated_at: string;
}

export interface WatchProgress {
  user_id: string;
  media_title_id: string | null;
  episode_id: string | null;
  position_seconds: number;
  duration_seconds: number | null;
  percent: number;
  completed: boolean;
  updated_at: string;
}

// ── Tipo Database (subconjunto tipado para @supabase/ssr) ────────────────────
// Las tablas más consultadas están tipadas; el resto se permite de forma laxa
// para no acoplar toda la app a tipos generados en esta primera versión.
type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      user_preferences: TableDef<UserPreferences>;
      media_titles: TableDef<MediaTitle>;
      seasons: TableDef<Season>;
      episodes: TableDef<Episode>;
      providers: TableDef<Provider>;
      media_availabilities: TableDef<MediaAvailability>;
      audio_tracks: TableDef<AudioTrack>;
      subtitle_tracks: TableDef<SubtitleTrack>;
      channels: TableDef<Channel>;
      channel_streams: TableDef<ChannelStream>;
      watch_progress: TableDef<WatchProgress>;
      user_favorites: TableDef<{
        user_id: string;
        media_title_id: string | null;
        channel_id: string | null;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
