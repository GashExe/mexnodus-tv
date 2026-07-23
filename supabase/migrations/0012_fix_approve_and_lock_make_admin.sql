-- ════════════════════════════════════════════════════════════════════════════
-- 0012 · fix de aprobación + endurecimiento de make_admin
--
-- (1) BUG: approve_availability/reject_availability insertaban en
--     review_decisions.authorize (enum publish_authorization) una expresión CASE
--     de tipo text → "column authorize is of type publish_authorization but
--     expression is of type text". Se castea explícitamente al enum.
--
-- (2) SEGURIDAD: make_admin quedaba ejecutable por cualquiera con la llave
--     pública (rol anon) — escalada de privilegios trivial. Se revoca a anon y
--     authenticated; queda solo para el propietario (SQL editor / service-role).
-- ════════════════════════════════════════════════════════════════════════════

-- ── (1) Funciones corregidas ────────────────────────────────────────────────
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
          (case when p_authorize then 'authorized' else 'unauthorized' end)::publish_authorization, p_notes);

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
  values (p_availability, v_actor, 'rejected', 'unauthorized'::publish_authorization, p_notes);
  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (v_actor, 'availability.reject', 'media_availabilities', p_availability);
end $$;

-- ── (2) make_admin: solo servidor/SQL, nunca desde el cliente ───────────────
revoke execute on function public.make_admin(text) from public;
revoke execute on function public.make_admin(text) from anon;
revoke execute on function public.make_admin(text) from authenticated;
-- El propietario (postgres) y service_role conservan EXECUTE para el bootstrap
-- del primer admin desde el SQL Editor o el worker.
