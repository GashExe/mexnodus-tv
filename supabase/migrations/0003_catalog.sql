-- ════════════════════════════════════════════════════════════════════════════
-- 0003 · catálogo canónico
-- Una película/episodio existe UNA sola vez, aunque tenga muchas fuentes.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Identidad + metadatos del título ──
create table if not exists public.media_titles (
  id                 uuid primary key default gen_random_uuid(),
  kind               media_kind not null,
  tmdb_id            bigint,
  imdb_id            text,
  tvdb_id            bigint,
  anilist_id         bigint,
  external_ids       jsonb not null default '{}'::jsonb,
  title              text not null,
  original_title     text,
  alternative_titles text[] default '{}',
  overview           text,
  year               int,
  release_date       date,
  poster_path        text,
  backdrop_path      text,
  genres             int[] default '{}',        -- ids de género TMDB
  age_rating         text,
  runtime_minutes    int,
  original_language  lang_code default 'und',
  origin_country     text[] default '{}',
  status             text,
  popularity         real,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- un título de TMDB es único por tipo
  unique (kind, tmdb_id)
);
create index if not exists idx_media_titles_kind on public.media_titles(kind) where is_active;
create index if not exists idx_media_titles_popularity on public.media_titles(popularity desc);
create index if not exists idx_media_titles_title_trgm on public.media_titles using gin (title gin_trgm_ops);
create index if not exists idx_media_titles_genres on public.media_titles using gin (genres);

-- ── IDs externos como filas (además del jsonb, para búsquedas indexadas) ──
create table if not exists public.media_external_ids (
  id             uuid primary key default gen_random_uuid(),
  media_title_id uuid not null references public.media_titles(id) on delete cascade,
  source         text not null,           -- 'tmdb','imdb','tvdb','anilist',...
  external_id    text not null,
  unique (source, external_id)
);
create index if not exists idx_ext_ids_media on public.media_external_ids(media_title_id);

-- ── Series → temporadas → episodios ──
create table if not exists public.seasons (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references public.media_titles(id) on delete cascade,
  season_number int not null,
  title         text,
  overview      text,
  poster_path   text,
  air_date      date,
  episode_count int,
  unique (series_id, season_number)
);
create index if not exists idx_seasons_series on public.seasons(series_id);

create table if not exists public.episodes (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null references public.media_titles(id) on delete cascade,
  season_id       uuid not null references public.seasons(id) on delete cascade,
  season_number   int not null,
  episode_number  int not null,
  title           text,
  overview        text,
  still_path      text,
  air_date        date,
  runtime_minutes int,
  tmdb_id         bigint,
  unique (series_id, season_number, episode_number)
);
create index if not exists idx_episodes_series on public.episodes(series_id);
create index if not exists idx_episodes_season on public.episodes(season_id);

-- ── Personas, géneros, colecciones ──
create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  tmdb_id      bigint unique,
  name         text not null,
  profile_path text,
  known_for    text
);

create table if not exists public.genres (
  id   int primary key,            -- id de género TMDB
  name text not null,
  kind media_kind
);

create table if not exists public.media_genres (
  media_title_id uuid not null references public.media_titles(id) on delete cascade,
  genre_id       int not null references public.genres(id) on delete cascade,
  primary key (media_title_id, genre_id)
);

create table if not exists public.media_credits (
  id             uuid primary key default gen_random_uuid(),
  media_title_id uuid not null references public.media_titles(id) on delete cascade,
  person_id      uuid not null references public.people(id) on delete cascade,
  role           text,            -- 'cast' | 'director' | 'writer'...
  character_name text,
  ord            int default 0
);
create index if not exists idx_credits_media on public.media_credits(media_title_id);

create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  tmdb_id     bigint unique,
  name        text not null,
  overview    text,
  poster_path text
);
create table if not exists public.collection_items (
  collection_id  uuid not null references public.collections(id) on delete cascade,
  media_title_id uuid not null references public.media_titles(id) on delete cascade,
  ord            int default 0,
  primary key (collection_id, media_title_id)
);
