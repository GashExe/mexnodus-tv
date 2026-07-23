-- ════════════════════════════════════════════════════════════════════════════
-- 0011 · datos de ejemplo (AUTORIZADOS y de dominio público / test)
-- Streams de prueba públicos (Mux/Apple/Blender). Ninguna fuente pirata.
-- Incluye deliberadamente una disponibilidad NO autorizada para demostrar el
-- gate del engine y el fallback automático.
-- ════════════════════════════════════════════════════════════════════════════

-- ── helper: promover un usuario a admin por email (para pruebas) ──
create or replace function public.make_admin(p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = p_email);
end $$;

-- ── géneros base (subconjunto TMDB) ──
insert into public.genres (id, name, kind) values
  (28,'Acción',null),(16,'Animación',null),(35,'Comedia',null),
  (18,'Drama',null),(878,'Ciencia ficción',null),(99,'Documental',null),
  (10751,'Familia',null)
on conflict (id) do nothing;

-- ── proveedores (registro declarativo) ──
insert into public.providers (id, slug, name, type, domain, status, country, languages, priority, trust_level, risk_level, adapter, public_config, last_reviewed_at)
values
  ('a0000000-0000-0000-0000-000000000001','mexnodus-test','MexNodus Test (HLS)','official','test-streams.mux.dev','online','MX',
    array['es-419','es']::lang_code[], 100, 'verified', 0, 'direct-hls', '{}'::jsonb, now()),
  ('a0000000-0000-0000-0000-000000000002','blender-open','Blender Open Movies','public_domain','mux.dev','online','MX',
    array['es-419','en']::lang_code[], 80, 'verified', 0, 'direct-hls', '{}'::jsonb, now()),
  ('a0000000-0000-0000-0000-000000000003','demo-iptv','Demo IPTV (M3U)','m3u','apple.com','online','US',
    array['es','en']::lang_code[], 60, 'high', 10, 'm3u-iptv', '{}'::jsonb, now())
on conflict (id) do nothing;

insert into public.provider_capabilities (provider_id, movies, series, iptv, hls, subtitles, multi_audio) values
  ('a0000000-0000-0000-0000-000000000001', true, true, true, true, true, true),
  ('a0000000-0000-0000-0000-000000000002', true, false, false, true, true, false),
  ('a0000000-0000-0000-0000-000000000003', false, false, true, true, false, false)
on conflict (provider_id) do nothing;

insert into public.provider_evidence (provider_id, kind, description, url) values
  ('a0000000-0000-0000-0000-000000000002','public_domain','Películas abiertas de Blender bajo Creative Commons.','https://studio.blender.org/films/'),
  ('a0000000-0000-0000-0000-000000000001','license','Streams públicos de prueba de Mux para desarrollo.','https://test-streams.mux.dev/')
on conflict do nothing;

-- ── películas (identidad canónica + metadatos) ──
insert into public.media_titles
  (id, kind, tmdb_id, title, original_title, overview, year, release_date, poster_path, backdrop_path, genres, runtime_minutes, original_language, origin_country, status, popularity, is_active)
values
  ('b0000000-0000-0000-0000-000000000001','movie', 10378, 'Big Buck Bunny', 'Big Buck Bunny',
    'Un conejo gigante y bonachón se venga de tres roedores abusivos. Cortometraje abierto de Blender.',
    2008, '2008-05-20', null, null, array[16,35,10751], 10, 'en', array['NL'], 'Released', 92.5, true),
  ('b0000000-0000-0000-0000-000000000002','movie', 45745, 'Sintel', 'Sintel',
    'Una joven busca a su dragón perdido en un mundo hostil. Cortometraje abierto de Blender.',
    2010, '2010-09-27', null, null, array[16,18,878], 15, 'en', array['NL'], 'Released', 78.0, true),
  ('b0000000-0000-0000-0000-000000000003','movie', 84508, 'Tears of Steel', 'Tears of Steel',
    'Un grupo de guerreros y científicos intenta salvar el mundo de robots. Proyecto abierto de Blender.',
    2012, '2012-09-26', null, null, array[878,28], 12, 'en', array['NL'], 'Released', 70.0, true)
on conflict (kind, tmdb_id) do nothing;

-- ── serie de demostración + temporada + episodios ──
insert into public.media_titles
  (id, kind, tmdb_id, title, original_title, overview, year, genres, original_language, status, popularity, is_active)
values
  ('b0000000-0000-0000-0000-000000000010','series', 999001, 'Serie Demo MexNodus', 'MexNodus Demo Series',
    'Serie de demostración para validar temporadas, episodios y progreso.', 2024,
    array[18,35], 'es', 'Returning Series', 60.0, true)
on conflict (kind, tmdb_id) do nothing;

insert into public.seasons (id, series_id, season_number, title, overview, air_date, episode_count) values
  ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000010', 1, 'Temporada 1',
   'Primera temporada de demostración.', '2024-01-01', 2)
on conflict (series_id, season_number) do nothing;

insert into public.episodes (id, series_id, season_id, season_number, episode_number, title, overview, air_date, runtime_minutes) values
  ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000001',1,1,
   'Episodio piloto','Arranque de la serie de demostración.', '2024-01-01', 24),
  ('d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000010','c0000000-0000-0000-0000-000000000001',1,2,
   'Segundo episodio','Continúa la demostración con audio en español.', '2024-01-08', 24)
on conflict (series_id, season_number, episode_number) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- DISPONIBILIDADES
--   Big Buck Bunny tiene 3 fuentes para probar la selección/fallback:
--     1) latino 1080p  · APROBADA + AUTORIZADA  ← el engine elige esta
--     2) castellano 720p · APROBADA + AUTORIZADA (fallback)
--     3) inglés 4K · NO autorizada (demuestra el gate: nunca se elige)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.media_availabilities
  (id, provider_id, media_title_id, playback_type, play_url, official_page, country,
   resolution_height, bitrate_kbps, fps, video_codec, audio_codec, audio_languages, subtitle_languages,
   startup_ms, stability, uptime_pct, last_checked_at, tech_status, review_status, publish_authorization, priority)
values
  -- 1) latino 1080p autorizada
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',
   'hls','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','https://test-streams.mux.dev/','MX',
   1080, 5200, 24, 'h264','aac', array['es-419']::lang_code[], array['es-419']::lang_code[],
   900, 96, 99.5, now(), 'online','approved','authorized', 10),
  -- 2) castellano 720p autorizada (fallback)
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',
   'hls','https://test-streams.mux.dev/pts_shift/master.m3u8','https://mux.dev/','ES',
   720, 3000, 24, 'h264','aac', array['es-ES']::lang_code[], array['es-ES']::lang_code[],
   1300, 88, 97.0, now(), 'online','approved','authorized', 5),
  -- 3) inglés 4K NO autorizada (gate)
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',
   'hls','https://test-streams.mux.dev/tos_ismc/main.m3u8','https://mux.dev/','US',
   2160, 14000, 24, 'h264','aac', array['en']::lang_code[], array['es-419']::lang_code[],
   1500, 70, 90.0, now(), 'online','pending','unauthorized', 0),
  -- Sintel · una fuente latino autorizada
  ('e0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002',
   'hls','https://test-streams.mux.dev/tos_ismc/main.m3u8','https://mux.dev/','MX',
   1080, 4800, 24, 'h264','aac', array['es-419']::lang_code[], array['es-419']::lang_code[],
   1000, 90, 98.0, now(), 'online','approved','authorized', 8),
  -- Tears of Steel · inglés con subs español, autorizada
  ('e0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000003',
   'hls','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','https://mux.dev/','MX',
   1080, 4600, 24, 'h264','aac', array['en']::lang_code[], array['es-419','es']::lang_code[],
   1100, 85, 96.0, now(), 'online','approved','authorized', 4)
on conflict (id) do nothing;

-- episodios de la serie
insert into public.media_availabilities
  (id, provider_id, episode_id, playback_type, play_url, country, resolution_height, bitrate_kbps, fps,
   video_codec, audio_codec, audio_languages, subtitle_languages, startup_ms, stability, uptime_pct,
   last_checked_at, tech_status, review_status, publish_authorization, priority)
values
  ('e0000000-0000-0000-0000-000000000101','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',
   'hls','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','MX',1080,5000,24,'h264','aac',
   array['es-419']::lang_code[], array['es-419']::lang_code[], 950,94,99.0, now(),'online','approved','authorized',10),
  ('e0000000-0000-0000-0000-000000000102','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',
   'hls','https://test-streams.mux.dev/pts_shift/master.m3u8','MX',1080,5000,24,'h264','aac',
   array['es-419']::lang_code[], array['es-419']::lang_code[], 950,93,99.0, now(),'online','approved','authorized',10)
on conflict (id) do nothing;

-- ── pistas de audio/subtítulos (modeladas por separado) ──
insert into public.audio_tracks (availability_id, language, label, codec, channels, is_default, origin, verification_status) values
  ('e0000000-0000-0000-0000-000000000001','es-419','Español latino','aac',2,true,'declared','verified'),
  ('e0000000-0000-0000-0000-000000000002','es-ES','Español (España)','aac',2,true,'declared','verified'),
  ('e0000000-0000-0000-0000-000000000003','en','Inglés','aac',6,true,'declared','unverified'),
  ('e0000000-0000-0000-0000-000000000004','es-419','Español latino','aac',2,true,'declared','verified'),
  ('e0000000-0000-0000-0000-000000000005','en','Inglés','aac',2,true,'declared','verified')
on conflict do nothing;

insert into public.subtitle_tracks (availability_id, language, label, codec, is_default, origin, verification_status) values
  ('e0000000-0000-0000-0000-000000000001','es-419','Español latino','vtt',true,'declared','verified'),
  ('e0000000-0000-0000-0000-000000000005','es-419','Español latino','vtt',true,'declared','verified'),
  ('e0000000-0000-0000-0000-000000000005','es','Español','vtt',false,'declared','verified')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- CANALES EN VIVO (entidad canónica + señales principal/respaldo)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.channel_categories (id, slug, name, ord) values
  ('f0000000-0000-0000-0000-000000000001','general','General',0),
  ('f0000000-0000-0000-0000-000000000002','noticias','Noticias',1),
  ('f0000000-0000-0000-0000-000000000003','infantil','Infantil',2)
on conflict (id) do nothing;

insert into public.channels (id, slug, name, kind, country, language, categories, logical_number, is_live, is_active) values
  ('f1000000-0000-0000-0000-000000000001','demo-uno','Canal Demo 1','tv','MX','es-419',array['general'],1,true,true),
  ('f1000000-0000-0000-0000-000000000002','demo-noticias','Demo Noticias','tv','MX','es-419',array['noticias'],2,true,true),
  ('f1000000-0000-0000-0000-000000000003','demo-radio','Radio Demo','radio','MX','es-419',array['general'],901,true,true)
on conflict (id) do nothing;

insert into public.channel_category_links (channel_id, category_id) values
  ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000002')
on conflict do nothing;

-- señales: principal + respaldo. La principal del Canal 1 es autorizada; su
-- respaldo también, para probar el fallback en vivo.
insert into public.channel_streams
  (id, channel_id, provider_id, label, play_url, playback_type, is_primary, priority,
   resolution_height, fps, bitrate_kbps, tech_status, review_status, publish_authorization, stability, uptime_pct, last_checked_at)
values
  ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
   'Principal 1080p','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','hls',true,10,1080,24,5000,'online','approved','authorized',95,99.0,now()),
  ('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
   'Respaldo 720p','https://test-streams.mux.dev/pts_shift/master.m3u8','hls',false,5,720,24,3000,'online','approved','authorized',85,96.0,now()),
  ('f2000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003',
   'Principal','https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8','hls',true,10,720,30,2500,'online','approved','authorized',90,98.0,now())
on conflict (id) do nothing;

-- programa EPG mínimo para "programa actual / siguiente"
insert into public.programs (channel_id, title, description, starts_at, ends_at, category) values
  ('f1000000-0000-0000-0000-000000000001','Programa actual','En emisión ahora mismo.', now() - interval '20 min', now() + interval '40 min','general'),
  ('f1000000-0000-0000-0000-000000000001','Programa siguiente','Comienza en breve.', now() + interval '40 min', now() + interval '100 min','general'),
  ('f1000000-0000-0000-0000-000000000002','Noticias de la hora','Resumen informativo.', now() - interval '10 min', now() + interval '50 min','noticias')
on conflict do nothing;
