-- ════════════════════════════════════════════════════════════════════════════
-- 0004 · proveedores (registro declarativo) + capacidades, versiones, evidencia
-- Añadir un proveedor = insertar una fila + declarar capacidades. Sin ramas.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.providers (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  type             provider_type not null,
  domain           text,
  status           tech_status not null default 'unknown',
  country          text,
  languages        lang_code[] default '{}',
  regions          text[] default '{}',
  priority         int not null default 0,
  trust_level      trust_level not null default 'untrusted',
  risk_level       int not null default 50 check (risk_level between 0 and 100),
  last_reviewed_at timestamptz,
  adapter          text not null default 'direct-hls',  -- slug del adaptador registrado
  public_config    jsonb not null default '{}'::jsonb,  -- base_url, patrones, etc.
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_providers_active on public.providers(is_active, priority desc);

-- ── Capacidades como filas (consulta y filtrado sencillos) ──
create table if not exists public.provider_capabilities (
  provider_id   uuid not null references public.providers(id) on delete cascade,
  movies        boolean not null default false,
  series        boolean not null default false,
  iptv          boolean not null default false,
  radio         boolean not null default false,
  subtitles     boolean not null default false,
  multi_audio   boolean not null default false,
  hls           boolean not null default false,
  dash          boolean not null default false,
  direct_file   boolean not null default false,
  embed         boolean not null default false,
  requires_auth boolean not null default false,
  primary key (provider_id)
);

-- ── Historial de versiones de configuración del proveedor ──
create table if not exists public.provider_versions (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  version     int not null,
  config      jsonb not null,
  changed_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (provider_id, version)
);

-- ── Evidencia de autorización (por qué se permite este proveedor) ──
create table if not exists public.provider_evidence (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  kind        text not null,        -- 'license','public_domain','gov_source','user_owned'...
  description text,
  url         text,
  document_path text,               -- Supabase Storage
  added_by    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ── Configuración SECRETA (tokens, credenciales). Nunca sale al cliente. ──
-- Sin políticas RLS de SELECT: solo accesible vía service-role del servidor.
create table if not exists public.provider_secrets (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  secret      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
comment on table public.provider_secrets is
  'Secretos del proveedor. Acceso SOLO service-role. RLS deniega todo por defecto.';
