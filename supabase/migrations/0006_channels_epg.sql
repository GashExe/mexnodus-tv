-- ════════════════════════════════════════════════════════════════════════════
-- 0006 · canales en vivo, señales, categorías, EPG y eventos
-- Un canal es una entidad canónica independiente de sus señales.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.channels (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  kind           channel_kind not null default 'tv',
  logo_path      text,
  country        text,
  language       lang_code default 'und',
  categories     text[] default '{}',
  logical_number int,
  is_live        boolean not null default true,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists idx_channels_kind on public.channels(kind) where is_active;

create table if not exists public.channel_categories (
  id   uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  ord  int default 0
);

create table if not exists public.channel_category_links (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  category_id uuid not null references public.channel_categories(id) on delete cascade,
  primary key (channel_id, category_id)
);

-- ── Señales del canal (principal + respaldos). Cada una con su propio estado. ──
create table if not exists public.channel_streams (
  id                    uuid primary key default gen_random_uuid(),
  channel_id            uuid not null references public.channels(id) on delete cascade,
  provider_id           uuid references public.providers(id) on delete set null,
  label                 text,
  play_url              text not null,
  playback_type         playback_type not null default 'hls',
  is_primary            boolean not null default false,
  priority              int not null default 0,
  resolution_height     int,
  fps                   int,
  bitrate_kbps          int,
  latency_ms            int,
  response_ms           int,
  tech_status           tech_status not null default 'unknown',
  review_status         review_status not null default 'pending',
  publish_authorization publish_authorization not null default 'unauthorized',
  stability             int check (stability between 0 and 100),
  uptime_pct            numeric(5,2),
  last_checked_at       timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);
create index if not exists idx_streams_channel on public.channel_streams(channel_id, priority desc) where is_active;
create index if not exists idx_streams_playable on public.channel_streams(review_status, publish_authorization) where is_active;

-- FKs diferidas desde 0005 ahora que existe channels/channel_streams
alter table public.media_availabilities
  add constraint fk_avail_channel foreign key (channel_id)
  references public.channels(id) on delete cascade;
alter table public.stream_checks
  add constraint fk_check_stream foreign key (channel_stream_id)
  references public.channel_streams(id) on delete cascade;
alter table public.availability_history
  add constraint fk_hist_stream foreign key (channel_stream_id)
  references public.channel_streams(id) on delete cascade;

-- ── EPG ──
create table if not exists public.epg_sources (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  url           text,
  format        text default 'xmltv',
  last_synced_at timestamptz,
  is_active     boolean not null default true
);

create table if not exists public.programs (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.channels(id) on delete cascade,
  epg_source_id uuid references public.epg_sources(id) on delete set null,
  title         text not null,
  description   text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  category      text,
  season_number int,
  episode_number int
);
create index if not exists idx_programs_channel_time on public.programs(channel_id, starts_at);

-- ── Eventos (deportes / en directo puntual) ──
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  name        text not null,
  category    text,          -- 'sports','concert'...
  starts_at   timestamptz,
  ends_at     timestamptz,
  channel_id  uuid references public.channels(id) on delete set null,
  is_active   boolean not null default true
);

alter table public.media_availabilities
  add constraint fk_avail_event foreign key (event_id)
  references public.events(id) on delete cascade;
