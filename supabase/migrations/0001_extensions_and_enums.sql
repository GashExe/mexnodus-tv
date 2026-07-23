-- ════════════════════════════════════════════════════════════════════════════
-- MexNodus TV · 0001 · extensiones y tipos enumerados
-- El modelo separa: Identidad ≠ Metadatos ≠ Proveedor ≠ Disponibilidad ≠ URL
--                  ≠ Calidad técnica ≠ Estado de revisión.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- búsqueda por similitud
create extension if not exists "unaccent";       -- búsqueda sin acentos

-- ── Roles de aplicación ──
do $$ begin
  create type app_role as enum ('user', 'reviewer', 'admin');
exception when duplicate_object then null; end $$;

-- ── Tipos de contenido ──
do $$ begin
  create type media_kind as enum ('movie', 'series', 'documentary', 'kids', 'anime');
exception when duplicate_object then null; end $$;

do $$ begin
  create type channel_kind as enum ('tv', 'radio', 'fast', 'event');
exception when duplicate_object then null; end $$;

-- ── Reproducción ──
do $$ begin
  create type playback_type as enum ('hls', 'dash', 'file', 'embed', 'jellyfin', 'iptv');
exception when duplicate_object then null; end $$;

-- ── Estados que NO deben mezclarse (principio central del modelo) ──
do $$ begin
  create type tech_status as enum ('unknown', 'online', 'degraded', 'offline');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('pending', 'in_review', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  -- autorización de publicación: separada del estado técnico y del de revisión.
  -- por defecto NADA está autorizado (una URL accesible NO implica autorización).
  create type publish_authorization as enum ('unauthorized', 'authorized', 'revoked');
exception when duplicate_object then null; end $$;

-- ── Proveedores ──
do $$ begin
  create type provider_type as enum
    ('official', 'public_domain', 'government', 'university', 'fast', 'user', 'jellyfin', 'm3u', 'aggregate');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trust_level as enum ('untrusted', 'low', 'medium', 'high', 'verified');
exception when duplicate_object then null; end $$;

-- ── Idioma (modelado explícito; no se infiere del título) ──
do $$ begin
  create type lang_code as enum ('es-MX', 'es-419', 'es-ES', 'es', 'en', 'pt-BR', 'mul', 'und');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('unverified', 'verified', 'failed');
exception when duplicate_object then null; end $$;
