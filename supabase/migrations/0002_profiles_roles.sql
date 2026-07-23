-- ════════════════════════════════════════════════════════════════════════════
-- 0002 · perfiles, roles y preferencias de usuario
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  avatar_url   text,
  role         app_role not null default 'user',
  country      text not null default 'MX',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Perfil 1:1 con auth.users. El rol gobierna RLS.';

create table if not exists public.user_preferences (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  -- prioridad por defecto: latino › general › castellano
  audio_priority    lang_code[] not null default array['es-MX','es-419','es','es-ES']::lang_code[],
  subtitle_priority lang_code[] not null default array['es-419','es-MX','es','es-ES']::lang_code[],
  max_resolution    int not null default 1080 check (max_resolution in (480,720,1080,2160)),
  autoplay_next     boolean not null default true,
  data_saver        boolean not null default false,
  prefer_hdr        boolean not null default false,
  player_prefs      jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);
comment on table public.user_preferences is 'Preferencias de idioma/calidad que alimentan el Playback Selection Engine.';
