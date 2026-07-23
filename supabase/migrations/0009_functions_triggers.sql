-- ════════════════════════════════════════════════════════════════════════════
-- 0009 · funciones, triggers y helpers de rol
-- ════════════════════════════════════════════════════════════════════════════

-- ── updated_at automático ──
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','media_titles','providers',
    'media_availabilities','watch_progress','provider_secrets'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on public.%1$s;
       create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── Helpers de rol (SECURITY DEFINER: leen profiles sin recursión de RLS) ──
create or replace function public.current_app_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_reviewer_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('reviewer','admin') from public.profiles where id = auth.uid()), false);
$$;

-- ── Alta de usuario: crea profile + preferences al registrarse ──
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Aprobar una disponibilidad de forma atómica (revisión + autorización + audit) ──
create or replace function public.approve_availability(
  p_availability uuid,
  p_authorize boolean default true,
  p_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_reviewer_or_admin() then
    raise exception 'No autorizado: se requiere reviewer o admin';
  end if;

  update public.media_availabilities
     set review_status = 'approved',
         publish_authorization = case when p_authorize then 'authorized'::publish_authorization
                                      else publish_authorization end
   where id = p_availability;

  insert into public.review_decisions (availability_id, decided_by, decision, authorize, notes)
  values (p_availability, v_actor, 'approved',
          case when p_authorize then 'authorized' else 'unauthorized' end, p_notes);

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (v_actor, 'availability.approve', 'media_availabilities', p_availability,
          jsonb_build_object('authorize', p_authorize));
end $$;

create or replace function public.reject_availability(
  p_availability uuid, p_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_reviewer_or_admin() then
    raise exception 'No autorizado';
  end if;
  update public.media_availabilities
     set review_status = 'rejected', publish_authorization = 'unauthorized'
   where id = p_availability;
  insert into public.review_decisions (availability_id, decided_by, decision, authorize, notes)
  values (p_availability, v_actor, 'rejected', 'unauthorized', p_notes);
  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (v_actor, 'availability.reject', 'media_availabilities', p_availability);
end $$;

-- ── Vista de disponibilidades REPRODUCIBLES (gate central del producto) ──
create or replace view public.v_playable_availabilities as
  select a.*, p.slug as provider_slug, p.name as provider_name,
         p.trust_level as provider_trust_level
    from public.media_availabilities a
    join public.providers p on p.id = a.provider_id
   where a.is_active
     and a.review_status = 'approved'
     and a.publish_authorization = 'authorized';

comment on view public.v_playable_availabilities is
  'Solo disponibilidades aprobadas Y autorizadas. Es la única fuente para reproducir.';
