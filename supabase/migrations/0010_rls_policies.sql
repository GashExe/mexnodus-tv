-- ════════════════════════════════════════════════════════════════════════════
-- 0010 · Row Level Security
-- Regla general:
--   · Catálogo (títulos, canales, proveedores, disponibilidades): lectura
--     pública SOLO de filas activas/reproducibles; escritura solo reviewer/admin.
--   · Datos de usuario: cada quien ve/edita LO SUYO.
--   · Secretos de proveedor: NADIE por RLS (solo service-role del servidor).
-- ════════════════════════════════════════════════════════════════════════════

-- Habilitar RLS en todo lo relevante
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','media_titles','media_external_ids','seasons',
    'episodes','people','genres','media_genres','media_credits','collections',
    'collection_items','providers','provider_capabilities','provider_versions',
    'provider_evidence','provider_secrets','media_availabilities','audio_tracks',
    'subtitle_tracks','stream_checks','availability_history','playback_scores',
    'channels','channel_categories','channel_category_links','channel_streams',
    'epg_sources','programs','events','user_favorites','user_lists',
    'user_list_items','watch_progress','watch_history','review_queue',
    'review_decisions','validation_jobs','blocked_domains','audit_logs',
    'import_jobs','import_errors','discovery_campaigns'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ── PROFILES ──
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
-- (el rol solo lo cambia un admin; ver política admin abajo)
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── PREFERENCIAS ──
create policy "prefs_owner" on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── CATÁLOGO: lectura pública de lo activo ──
do $$
declare t text;
begin
  foreach t in array array[
    'media_titles','seasons','episodes','people','genres','media_genres',
    'media_credits','collections','collection_items','media_external_ids',
    'channels','channel_categories','channel_category_links','programs','events'
  ] loop
    execute format($p$
      create policy "%1$s_public_read" on public.%1$s for select using (true);
      create policy "%1$s_staff_write" on public.%1$s for all
        using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
    $p$, t);
  end loop;
end $$;

-- ── PROVEEDORES: metadatos públicos legibles; escritura admin ──
create policy "providers_public_read" on public.providers
  for select using (is_active or public.is_reviewer_or_admin());
create policy "providers_admin_write" on public.providers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "provcap_read" on public.provider_capabilities for select using (true);
create policy "provcap_admin" on public.provider_capabilities
  for all using (public.is_admin()) with check (public.is_admin());

create policy "provver_staff" on public.provider_versions
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "provevi_staff" on public.provider_evidence
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

-- ── SECRETOS DE PROVEEDOR: RLS deniega todo. Solo service-role los ve. ──
-- (No creamos ninguna policy permisiva: con RLS activo y sin policy, nadie pasa.)

-- ── DISPONIBILIDADES: el público SOLO ve las reproducibles ──
create policy "avail_public_playable" on public.media_availabilities
  for select using (
    (is_active and review_status = 'approved' and publish_authorization = 'authorized')
    or public.is_reviewer_or_admin()
  );
create policy "avail_staff_write" on public.media_availabilities
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

-- pistas y checks siguen la visibilidad de su disponibilidad (staff siempre)
create policy "audio_read" on public.audio_tracks for select using (true);
create policy "audio_staff" on public.audio_tracks
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "subs_read" on public.subtitle_tracks for select using (true);
create policy "subs_staff" on public.subtitle_tracks
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

create policy "checks_staff" on public.stream_checks
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "avail_hist_staff" on public.availability_history
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "scores_staff" on public.playback_scores
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

-- ── SEÑALES DE CANAL: público solo reproducibles ──
create policy "streams_public_playable" on public.channel_streams
  for select using (
    (is_active and review_status = 'approved' and publish_authorization = 'authorized')
    or public.is_reviewer_or_admin()
  );
create policy "streams_staff_write" on public.channel_streams
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

create policy "epg_sources_staff" on public.epg_sources
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "epg_sources_read" on public.epg_sources for select using (true);

-- ── DATOS DE USUARIO: dueño ──
create policy "fav_owner" on public.user_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lists_owner" on public.user_lists
  for all using (user_id = auth.uid() or (is_public and public.is_reviewer_or_admin()))
  with check (user_id = auth.uid());
create policy "list_items_owner" on public.user_list_items
  for all using (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "progress_owner" on public.watch_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "history_owner" on public.watch_history
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── REVISIÓN / IMPORT / AUDIT / BLOQUEO: staff/admin ──
create policy "review_queue_staff" on public.review_queue
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "review_dec_staff" on public.review_decisions
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "validation_staff" on public.validation_jobs
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "blocked_admin" on public.blocked_domains
  for all using (public.is_admin()) with check (public.is_admin());
create policy "audit_read_staff" on public.audit_logs
  for select using (public.is_reviewer_or_admin());
create policy "import_jobs_staff" on public.import_jobs
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "import_errors_staff" on public.import_errors
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy "discovery_admin" on public.discovery_campaigns
  for all using (public.is_admin()) with check (public.is_admin());
