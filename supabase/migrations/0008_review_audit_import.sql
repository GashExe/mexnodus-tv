-- ════════════════════════════════════════════════════════════════════════════
-- 0008 · revisión, auditoría, dominios bloqueados e importación
-- ════════════════════════════════════════════════════════════════════════════

-- ── Cola de revisión (fuentes pendientes de aprobar/rechazar) ──
create table if not exists public.review_queue (
  id              uuid primary key default gen_random_uuid(),
  availability_id uuid references public.media_availabilities(id) on delete cascade,
  channel_stream_id uuid references public.channel_streams(id) on delete cascade,
  reason          text,             -- 'new_source','reverify','reported'...
  priority        int not null default 0,
  status          review_status not null default 'pending',
  assigned_to     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint review_one_target check (
    (availability_id is not null)::int + (channel_stream_id is not null)::int = 1
  )
);
create index if not exists idx_review_status on public.review_queue(status, priority desc);

-- ── Decisiones de revisión (auditoría de aprobaciones/rechazos) ──
create table if not exists public.review_decisions (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid references public.review_queue(id) on delete set null,
  availability_id uuid references public.media_availabilities(id) on delete cascade,
  channel_stream_id uuid references public.channel_streams(id) on delete cascade,
  decided_by      uuid references public.profiles(id) on delete set null,
  decision        review_status not null,   -- approved | rejected
  authorize       publish_authorization,    -- autorización aplicada
  notes           text,
  decided_at      timestamptz not null default now()
);

-- ── Cola de validación técnica (la consume un worker externo) ──
create table if not exists public.validation_jobs (
  id              uuid primary key default gen_random_uuid(),
  availability_id uuid references public.media_availabilities(id) on delete cascade,
  channel_stream_id uuid references public.channel_streams(id) on delete cascade,
  kind            text not null default 'probe',   -- 'probe'|'ffprobe'|'uptime'
  status          text not null default 'queued',  -- queued|claimed|done|error
  claimed_by      text,
  claimed_at      timestamptz,
  result          jsonb,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_validation_status on public.validation_jobs(status, created_at);
comment on table public.validation_jobs is
  'Cola desacoplada. Vercel encola; un worker externo (fuera de Vercel) valida con ffprobe.';

-- ── Dominios bloqueados (lista negra global) ──
create table if not exists public.blocked_domains (
  id         uuid primary key default gen_random_uuid(),
  domain     text not null unique,
  reason     text,
  blocked_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ── Auditoría administrativa ──
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,        -- 'provider.create','availability.approve'...
  entity      text,                 -- tabla afectada
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ── Trabajos de importación (M3U, TMDB sync, EPG…) ──
create table if not exists public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,       -- 'm3u'|'tmdb'|'epg'
  source_url    text,
  status        text not null default 'queued',  -- queued|running|done|error
  created_by    uuid references public.profiles(id) on delete set null,
  total         int default 0,
  processed     int default 0,
  succeeded     int default 0,
  failed        int default 0,
  summary       jsonb,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table if not exists public.import_errors (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.import_jobs(id) on delete cascade,
  line       int,
  raw        text,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_import_errors_job on public.import_errors(job_id);

-- ── Campañas de descubrimiento (planificadas; ejecución futura por worker) ──
-- Bounded por diseño: se descubren fuentes desde ORÍGENES declarados, no un
-- rastreo abierto de internet. Ver README (limitaciones y seguridad).
create table if not exists public.discovery_campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  seed_sources jsonb not null default '[]'::jsonb,  -- lista de orígenes autorizados
  scope        jsonb not null default '{}'::jsonb,  -- filtros/límites
  status       text not null default 'draft',       -- draft|scheduled|running|done
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
