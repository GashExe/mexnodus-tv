-- ════════════════════════════════════════════════════════════════════════════
-- 0014 · orígenes permitidos para `frame-src` (CSP dinámica)
--
-- La CSP del middleware ya no hardcodea los dominios de los reproductores embed.
-- En su lugar, `frame-src` se arma leyendo los orígenes de los proveedores
-- `pattern-embed` ACTIVOS. Así, agregar un servidor nuevo (mexnodus2.com, …) es
-- solo crear el proveedor en el panel — sin tocar código.
--
-- El origen se deriva del host de los patrones (o del campo `domain`). La función
-- es security-definer y de solo lectura de un dato NO sensible (los dominios son
-- públicos: viajan en el `src` del iframe), por eso se concede a anon.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.embed_frame_origins()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with urls as (
    select public_config->>'movie_pattern' as u
      from public.providers where is_active and adapter = 'pattern-embed'
    union all
    select public_config->>'series_pattern'
      from public.providers where is_active and adapter = 'pattern-embed'
    union all
    select case when coalesce(domain, '') <> '' then 'https://' || domain end
      from public.providers where is_active and adapter = 'pattern-embed'
  )
  select coalesce(array_agg(distinct origin), '{}'::text[])
  from (
    -- quita el esquema y toma el host (con puerto) hasta la primera '/'
    select 'https://' || substring(regexp_replace(u, '^https?://', '') from '^[^/]+') as origin
    from urls
    where u is not null and u <> ''
  ) s
  where origin is not null and origin <> 'https://';
$$;

grant execute on function public.embed_frame_origins() to anon, authenticated;
