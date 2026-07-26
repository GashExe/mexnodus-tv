-- ════════════════════════════════════════════════════════════════════════════
-- 0014 · Emparejamiento de dispositivos de TV (Fire TV)
--
-- Iniciar sesión en una tele significa teclear un email y una contraseña de 8+
-- caracteres con un mando de cinco botones. En su lugar: la tele muestra un
-- código corto, el usuario lo escribe desde el móvil (ya autenticado) y la tele
-- recoge la sesión en su siguiente sondeo.
--
-- MODELO DE AMENAZA — el código se ve en una pantalla que puede estar a la vista
-- de otras personas, así que por sí solo NO puede bastar para obtener la sesión:
--   · `code` sirve para RECLAMAR (lo teclea el dueño en su móvil).
--   · `device_secret` sirve para RECOGER (solo lo conoce la tele que lo generó).
-- Quien lea el código de reojo no puede robar nada: sin el secreto, el sondeo no
-- devuelve sesión; y reclamar exige estar autenticado como el propio usuario.
--
-- Además: un solo uso (`consumed_at`), expiración corta (`expires_at`) y sin
-- ninguna política RLS permisiva — la tabla es exclusiva del service-role, igual
-- que `provider_secrets`.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.tv_pairings (
  id            uuid primary key default gen_random_uuid(),
  -- 6 caracteres de un alfabeto sin ambigüedades visuales (sin 0/O ni 1/I/L):
  -- se lee de una pantalla a tres metros y se teclea en un móvil.
  code          text not null unique,
  -- Opaco y largo. Lo genera el servidor y solo lo guarda la tele.
  device_secret text not null,
  device_label  text,
  claimed_by    uuid references public.profiles(id) on delete cascade,
  claimed_at    timestamptz,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

-- El sondeo de la tele busca por (id, device_secret); el reclamo del móvil, por
-- código. Ambos caminos indexados.
create index if not exists idx_tv_pairings_code on public.tv_pairings(code);
create index if not exists idx_tv_pairings_expires on public.tv_pairings(expires_at);

alter table public.tv_pairings enable row level security;

-- SIN POLÍTICAS A PROPÓSITO. Con RLS activo y cero políticas, ningún cliente
-- anónimo ni autenticado puede leer ni escribir: solo el service-role, que la
-- salta. Si alguna vez se añade una política aquí, revisar de nuevo el modelo de
-- amenaza de arriba — bastaría con poder LEER la fila para robar el secreto.

/**
 * Limpieza de emparejamientos caducados o ya usados.
 *
 * Se llama desde el propio endpoint de creación (barrido perezoso) para no
 * depender de un cron: el volumen es mínimo y así la tabla no crece sin control.
 */
create or replace function public.purge_expired_tv_pairings()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tv_pairings
  where expires_at < now() - interval '1 hour'
     or (consumed_at is not null and consumed_at < now() - interval '1 hour');
$$;

-- Por defecto una función se otorga a PUBLIC. Se retira y se concede SOLO al
-- service-role, que es quien la llama desde /tv/link.
revoke all on function public.purge_expired_tv_pairings() from public, anon, authenticated;
grant execute on function public.purge_expired_tv_pairings() to service_role;
