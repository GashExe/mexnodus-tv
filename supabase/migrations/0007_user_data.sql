-- ════════════════════════════════════════════════════════════════════════════
-- 0007 · datos de usuario: favoritos, listas, progreso, historial
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_favorites (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  media_title_id uuid references public.media_titles(id) on delete cascade,
  channel_id     uuid references public.channels(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint fav_one_target check (
    (media_title_id is not null)::int + (channel_id is not null)::int = 1
  ),
  unique (user_id, media_title_id),
  unique (user_id, channel_id)
);
create index if not exists idx_fav_user on public.user_favorites(user_id);

create table if not exists public.user_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  is_public  boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_list_items (
  list_id        uuid not null references public.user_lists(id) on delete cascade,
  media_title_id uuid references public.media_titles(id) on delete cascade,
  channel_id     uuid references public.channels(id) on delete cascade,
  ord            int default 0,
  added_at       timestamptz not null default now(),
  primary key (list_id, media_title_id, channel_id)
);

-- ── Progreso (continuar viendo). Un registro por usuario+contenido. ──
create table if not exists public.watch_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  media_title_id   uuid references public.media_titles(id) on delete cascade,
  episode_id       uuid references public.episodes(id) on delete cascade,
  position_seconds int not null default 0,
  duration_seconds int,
  percent          numeric(5,2) not null default 0,
  completed        boolean not null default false,
  updated_at       timestamptz not null default now(),
  constraint progress_one_target check (
    (media_title_id is not null)::int + (episode_id is not null)::int = 1
  ),
  unique (user_id, media_title_id),
  unique (user_id, episode_id)
);
create index if not exists idx_progress_user on public.watch_progress(user_id, updated_at desc);

-- ── Historial de reproducción (append-only) ──
create table if not exists public.watch_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  media_title_id  uuid references public.media_titles(id) on delete cascade,
  episode_id      uuid references public.episodes(id) on delete cascade,
  channel_id      uuid references public.channels(id) on delete cascade,
  availability_id uuid references public.media_availabilities(id) on delete set null,
  watched_at      timestamptz not null default now()
);
create index if not exists idx_history_user on public.watch_history(user_id, watched_at desc);
