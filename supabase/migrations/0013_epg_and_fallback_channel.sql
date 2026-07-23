-- ════════════════════════════════════════════════════════════════════════════
-- 0013 · EPG (epg_id en canales) + canal de demostración de failover en vivo
-- ════════════════════════════════════════════════════════════════════════════

-- ── epg_id: identifica el canal en fuentes XMLTV (tvg-id) para cruzar programas
alter table public.channels add column if not exists epg_id text;
create index if not exists idx_channels_epg on public.channels(epg_id);

-- backfill de los canales sembrados (para que el EPG de ejemplo los encuentre)
update public.channels set epg_id = 'demo.uno'      where slug = 'demo-uno'      and epg_id is null;
update public.channels set epg_id = 'demo.noticias' where slug = 'demo-noticias' and epg_id is null;
update public.channels set epg_id = 'demo.radio'    where slug = 'demo-radio'    and epg_id is null;

-- ── Canal para demostrar el FAILOVER de señal en vivo ───────────────────────
-- Señal principal con URL MUERTA (autorizada) → el reproductor recibe error
-- fatal y salta solo a la señal de respaldo (buena, autorizada).
insert into public.channels (id, slug, name, kind, country, language, categories, logical_number, epg_id, is_live, is_active)
values ('f1000000-0000-0000-0000-000000000004','fallback-demo','Fallback Demo','tv','MX','es-419',
        array['general'], 4, 'fallback.demo', true, true)
on conflict (id) do nothing;

insert into public.channel_streams
  (id, channel_id, provider_id, label, play_url, playback_type, is_primary, priority,
   resolution_height, fps, bitrate_kbps, tech_status, review_status, publish_authorization, stability, uptime_pct, last_checked_at)
values
  -- principal: URL inexistente a propósito
  ('f2000000-0000-0000-0000-000000000010','f1000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',
   'Principal 1080p (caída)','https://test-streams.mux.dev/NO-EXISTE/master.m3u8','hls',true,10,1080,30,5000,
   'offline','approved','authorized',30,55.0, now()),
  -- respaldo: stream de prueba real que sí funciona
  ('f2000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',
   'Respaldo 720p','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','hls',false,5,720,30,3000,
   'online','approved','authorized',92,98.0, now())
on conflict (id) do nothing;
