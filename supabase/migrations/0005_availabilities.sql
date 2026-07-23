-- ════════════════════════════════════════════════════════════════════════════
-- 0005 · disponibilidades, pistas de audio/subtítulos, verificaciones e historial
-- Una disponibilidad = una forma concreta de acceder a un contenido.
-- Separa: URL ≠ calidad técnica ≠ estado técnico ≠ revisión ≠ autorización.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.media_availabilities (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           uuid not null references public.providers(id) on delete cascade,

  -- exactamente UNA relación de contenido (CHECK abajo)
  media_title_id        uuid references public.media_titles(id) on delete cascade,
  episode_id            uuid references public.episodes(id) on delete cascade,
  channel_id            uuid,     -- FK añadida en 0006 tras crear channels
  event_id              uuid,

  playback_type         playback_type not null,
  play_url              text,     -- URL pública/endpoint aprobado
  official_page         text,
  country               text,
  region_restrictions   text[] default '{}',    -- lista blanca de países permitidos
  requires_auth         boolean not null default false,
  requires_subscription boolean not null default false,

  -- calidad técnica
  resolution_height     int,
  bitrate_kbps          int,
  fps                   int,
  video_codec           text,
  audio_codec           text,
  hdr                   boolean not null default false,
  dolby_vision          boolean not null default false,
  audio_51              boolean not null default false,
  audio_languages       lang_code[] default '{}',
  subtitle_languages    lang_code[] default '{}',

  -- fiabilidad
  startup_ms            int,
  stability             int check (stability between 0 and 100),
  uptime_pct            numeric(5,2) check (uptime_pct between 0 and 100),
  last_checked_at       timestamptz,
  tech_status           tech_status not null default 'unknown',

  -- estados SEPARADOS
  review_status         review_status not null default 'pending',
  publish_authorization publish_authorization not null default 'unauthorized',

  priority              int not null default 0,
  final_score           numeric(8,2),        -- cacheado por el engine (opcional)
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint one_target check (
    (media_title_id is not null)::int
  + (episode_id is not null)::int
  + (channel_id is not null)::int
  + (event_id is not null)::int = 1
  )
);
create index if not exists idx_avail_title on public.media_availabilities(media_title_id) where is_active;
create index if not exists idx_avail_episode on public.media_availabilities(episode_id) where is_active;
create index if not exists idx_avail_channel on public.media_availabilities(channel_id) where is_active;
create index if not exists idx_avail_provider on public.media_availabilities(provider_id);
-- índice clave del gate de reproducción
create index if not exists idx_avail_playable on public.media_availabilities(review_status, publish_authorization)
  where is_active;

-- ── Pistas de audio (modeladas por separado, verificables) ──
create table if not exists public.audio_tracks (
  id                  uuid primary key default gen_random_uuid(),
  availability_id     uuid not null references public.media_availabilities(id) on delete cascade,
  language            lang_code not null default 'und',
  label               text,
  codec               text,
  channels            int,          -- 2, 6 (5.1), 8 (7.1)
  is_forced           boolean not null default false,
  is_hearing_impaired boolean not null default false,
  is_default          boolean not null default false,
  origin              text,         -- 'declared'|'probed'|'manual'
  verification_status verification_status not null default 'unverified'
);
create index if not exists idx_audio_avail on public.audio_tracks(availability_id);

-- ── Pistas de subtítulos ──
create table if not exists public.subtitle_tracks (
  id                  uuid primary key default gen_random_uuid(),
  availability_id     uuid not null references public.media_availabilities(id) on delete cascade,
  language            lang_code not null default 'und',
  label               text,
  codec               text,         -- 'srt','vtt','ass'
  is_forced           boolean not null default false,
  is_hearing_impaired boolean not null default false,
  is_default          boolean not null default false,
  origin              text,
  verification_status verification_status not null default 'unverified'
);
create index if not exists idx_subs_avail on public.subtitle_tracks(availability_id);

-- ── Verificaciones técnicas (las escribe el worker externo) ──
create table if not exists public.stream_checks (
  id              uuid primary key default gen_random_uuid(),
  availability_id uuid references public.media_availabilities(id) on delete cascade,
  channel_stream_id uuid,           -- FK añadida en 0006
  checked_at      timestamptz not null default now(),
  ok              boolean not null,
  http_status     int,
  response_ms     int,
  resolution_height int,
  bitrate_kbps    int,
  detected_codecs jsonb,
  error           text,
  source          text not null default 'worker'   -- 'worker'|'light'|'mock'
);
create index if not exists idx_checks_avail on public.stream_checks(availability_id, checked_at desc);

-- ── Historial de disponibilidad (para calcular uptime) ──
create table if not exists public.availability_history (
  id              uuid primary key default gen_random_uuid(),
  availability_id uuid references public.media_availabilities(id) on delete cascade,
  channel_stream_id uuid,
  status          tech_status not null,
  changed_at      timestamptz not null default now()
);
create index if not exists idx_avail_hist on public.availability_history(availability_id, changed_at desc);

-- ── Puntuaciones del engine (auditoría de decisiones) ──
create table if not exists public.playback_scores (
  id              uuid primary key default gen_random_uuid(),
  availability_id uuid references public.media_availabilities(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  score           numeric(8,2) not null,
  breakdown       jsonb not null default '{}'::jsonb,
  weights_version text,
  computed_at     timestamptz not null default now()
);
