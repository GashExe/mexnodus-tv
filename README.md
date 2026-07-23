# MexNodus TV

Plataforma unificada para consultar y reproducir cine, series, anime, documentales,
infantil, TV en vivo, radio, FAST y fuentes propias del usuario. Construida sobre
**Next.js 15 (App Router) + TypeScript**, desplegable en **Vercel** y conectada a
**Supabase** (Postgres, Auth, RLS, Storage, Realtime).

Esta primera versión es un **núcleo funcional** sobre el que luego se conectan apps
de Smart TV y móviles (a través de sus rutas API).

---

## Principio central del modelo

El sistema **separa completamente** conceptos que otros proyectos mezclan:

```
Identidad ≠ Metadatos ≠ Proveedor ≠ Disponibilidad ≠ URL ≠ Calidad técnica ≠ Revisión ≠ Autorización
```

- Una película o episodio existe **una sola vez** en el catálogo (`media_titles`),
  aunque tenga muchas fuentes.
- Cada forma de acceder es una **disponibilidad** (`media_availabilities`) con su
  propia calidad, estado técnico, estado de revisión y **autorización de publicación**.
- El **Playback Selection Engine** elige la mejor disponibilidad según preferencias
  (español latino primero), calidad y estabilidad — pero **solo entre las aprobadas y
  autorizadas**.

> **Decisión de seguridad deliberada:** se rechaza la regla "una URL técnicamente
> accesible se considera autorizada". La autorización (`publish_authorization`) es un
> estado separado, controlado por revisores, y por defecto es `unauthorized`. Ninguna
> fuente se reproduce sin aprobación humana. Esto es coherente con la sección de
> Seguridad del encargo y evita las decisiones inseguras detectadas en la auditoría.

---

## Stack

| Área | Tecnología |
|---|---|
| Framework / API | Next.js 15 (App Router), React 18, TypeScript |
| Backend | Supabase: Postgres + Auth + RLS + Storage + Realtime + Edge Functions |
| Auth en Next | `@supabase/ssr` + `middleware.ts` (sesión por cookies) |
| UI | Tailwind CSS + sistema de tokens propio ("Obsidiana + Rosa Mexicano") |
| Estado cliente | TanStack Query |
| Validación | Zod (servidor y formularios) |
| Reproductor | `hls.js` + wrapper con fallback automático |
| Testing | Vitest (el motor de selección es lógica pura) |

---

## Estructura del proyecto

```
mexnodus-tv/
├─ middleware.ts               # refresco de sesión + rutas protegidas + CSP
├─ next.config.mjs             # cabeceras de seguridad, dominios de imagen
├─ vercel.json                 # límites de función (maxDuration)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/              # 0001..0011: enums, catálogo, proveedores,
│  │                           # disponibilidades, canales/EPG, datos de usuario,
│  │                           # revisión/auditoría/import, funciones, RLS, seed
│  └─ functions/validation-worker/README.md   # contrato del worker externo
├─ scripts/seed-tmdb.ts        # seed opcional desde TMDB (service-role)
└─ src/
   ├─ lib/
   │  ├─ env.ts                # público vs secreto (getters solo-servidor)
   │  ├─ supabase/{client,server,middleware}.ts
   │  ├─ tmdb.ts               # cliente TMDB (solo servidor)
   │  ├─ m3u.ts                # parser M3U
   │  ├─ ssrf.ts               # guardia anti-SSRF + safeFetch
   │  ├─ language.ts           # modelo de preferencia de idioma
   │  ├─ providers/registry.ts # registro declarativo de adaptadores
   │  └─ playback/
   │     ├─ weights.ts         # pesos CONFIGURABLES del motor
   │     ├─ engine.ts          # Playback Selection Engine (puro)
   │     ├─ engine.test.ts     # tests del motor
   │     └─ resolve.ts         # carga candidatos + ejecuta el motor
   ├─ components/              # sistema visual + Player + tarjetas
   └─ app/
      ├─ (auth)/               # login, register
      ├─ page.tsx              # inicio
      ├─ movies, series, live, search, library, settings
      ├─ watch/[type]/[id]     # reproductor (title | episode | channel)
      ├─ admin/                # panel protegido (reviewer/admin)
      └─ api/                  # progress, favorites, playback/select,
                               # admin/tmdb/sync, admin/import/m3u
```

---

## 1) Ejecutar localmente

Requisitos: Node ≥ 20, y la [CLI de Supabase](https://supabase.com/docs/guides/cli)
(para la base local) **o** un proyecto Supabase en la nube.

```bash
cd mexnodus-tv
cp .env.example .env.local          # rellena las variables (ver abajo)
npm install
```

### Opción A — Supabase local (recomendada para desarrollo)

```bash
supabase start                      # levanta Postgres + Auth + Studio
supabase db reset                   # aplica TODAS las migraciones + seed
npm run dev                         # http://localhost:3000
```

`supabase start` imprime la `API URL`, la `anon key` y la `service_role key`;
cópialas a `.env.local`.

### Opción B — Supabase en la nube

1. Crea un proyecto en https://supabase.com.
2. En **SQL Editor**, ejecuta las migraciones de `supabase/migrations/` en orden
   (0001 → 0011), o usa `supabase db push` con el proyecto enlazado.
3. Copia `Project URL`, `anon key` y `service_role key` a `.env.local`.
4. `npm run dev`.

### Variables de entorno

| Variable | Ámbito | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreto** | solo servidor/worker |
| `TMDB_ACCESS_TOKEN` | **secreto** | token v4 de TMDB (opcional; sin él, mocks) |
| `VALIDATION_WORKER_SECRET` | **secreto** | clave compartida del worker futuro |
| `NEXT_PUBLIC_SITE_URL` | público | p.ej. `http://localhost:3000` |

---

## 2) Crear el primer administrador

1. Regístrate en `/register` (con confirmación de email desactivada en local, la
   sesión se crea al instante).
2. Promuévete a admin desde el SQL Editor de Supabase:

```sql
select public.make_admin('tu-correo@ejemplo.com');
```

3. Recarga: verás el botón **Admin** en la barra superior.

---

## 3) Desplegar en Vercel

1. Sube el repo a GitHub e **importa el proyecto** en Vercel (framework detectado:
   Next.js).
2. En **Settings → Environment Variables**, añade las mismas variables de
   `.env.example` (marca como *Production* y *Preview*). Las `NEXT_PUBLIC_*` son
   públicas; el resto son secretas.
3. En Supabase → **Auth → URL Configuration**, añade tu dominio de Vercel a
   *Site URL* y *Redirect URLs* (`https://tu-app.vercel.app/auth/callback`).
4. Deploy. `vercel.json` fija `maxDuration: 30s` para las rutas API.

**Límites de Vercel respetados:** no hay procesos persistentes ni validación
multimedia pesada dentro de funciones. La validación técnica se **encola** en
`validation_jobs` y la ejecuta un worker externo (ver más abajo).

---

## 4) Prueba de extremo a extremo

Con la app corriendo y el seed aplicado:

1. **Cuenta:** regístrate en `/register`, inicia sesión.
2. **Inicio:** entra a `/` — verás hero, canales en vivo y filas de catálogo.
3. **Películas de prueba:** abre *Big Buck Bunny* (`/movies`). El panel lateral
   muestra la decisión del motor: **elige la fuente en español latino 1080p**,
   lista los respaldos y **descarta la 4K en inglés por no estar autorizada**.
4. **Serie:** abre *Serie Demo MexNodus* (`/series`) → Temporada 1 → episodios.
5. **Favoritos y progreso:** marca favorito; reproduce (`/watch/title/...`) — el
   progreso se guarda cada 15 s y aparece en *Biblioteca → Continuar viendo*.
6. **IPTV:** en `/live` reproduce *Canal Demo 1* (HLS de prueba). Cambia de fuente
   manualmente en la barra del reproductor; si la principal falla, salta al
   respaldo automáticamente.
7. **Selección automática en español:** la fuente elegida siempre prioriza audio
   `es-419`/`es-MX` sobre calidad cruda (verificado en `engine.test.ts`).
8. **Admin:** en `/admin` crea un **proveedor**, luego una **disponibilidad**
   (nace *pendiente + no autorizada*), y en **Revisión** pulsa *Aprobar +
   autorizar*. Recárgala en el catálogo: ya es reproducible.

Ejecuta los tests del motor:

```bash
npm test
```

---

## 5) Worker externo de validación (futuro)

`ffprobe` y los procesos persistentes **no** corren en Vercel. El contrato del
worker está en [`supabase/functions/validation-worker/README.md`](supabase/functions/validation-worker/README.md):
Vercel encola en `validation_jobs`; un worker externo (contenedor/VM/cron) reclama,
valida con `ffprobe` y escribe `stream_checks`. Sin worker, el panel de revisión
ofrece **validación simulada** (`source = 'mock'`) para no bloquear el flujo.

La validación técnica **nunca** cambia `review_status`/`publish_authorization`:
autorizar sigue siendo una decisión humana.

---

## Seguridad implementada

- **Supabase Auth + RLS** en todas las tablas. El catálogo público solo expone
  disponibilidades/señales **aprobadas y autorizadas**; los datos de usuario son
  privados por dueño; `provider_secrets` no tiene ninguna política permisiva
  (solo accesible con service-role del servidor).
- **Separación de claves:** `NEXT_PUBLIC_*` vs secretos solo-servidor (`env.ts`).
  El token de TMDB nunca llega al cliente (contraste con uno de los repos auditados).
- **Guardia anti-SSRF** (`ssrf.ts`): bloquea `localhost`, IPs privadas/reservadas,
  metadata de nube, protocolos no http(s); aplica timeouts, límites de tamaño y
  control manual de redirecciones. **Nunca** desactiva TLS.
- **CSP estricta** por respuesta (middleware), `frame-src 'none'`, más
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`.
- **Validación de entrada con Zod** en API y server actions.
- **Auditoría administrativa** (`audit_logs`) de acciones sensibles.
- **Control por roles** (`user` / `reviewer` / `admin`) reforzado por RLS y por
  funciones `SECURITY DEFINER` (`approve_availability`, etc.).

---

## Limitaciones pendientes (esta etapa)

1. **Sin worker de validación real**: la calidad técnica se rellena con datos
   simulados hasta conectar el worker externo (interfaz ya definida).
2. **Rastreador/descubrimiento masivo NO incluido como crawler abierto.** Se
   entrega la infraestructura *acotada*: `discovery_campaigns` (orígenes
   declarados), `import_jobs`/`import_errors` y el importador M3U con guardia SSRF.
   Un rastreo abierto de internet queda deliberadamente fuera por motivos legales
   y de seguridad; se conecta después vía el worker externo sobre orígenes
   autorizados.
3. **EPG básico**: modelo de `programs`/`epg_sources` listo, pero sin importador
   XMLTV todavía (solo datos de ejemplo).
4. **AniList opcional**: `anilist_id` y la bandera `ANILIST_ENABLED` están
   preparados; la integración de enriquecimiento de anime no está cableada aún.
5. **Catch-up / DVR, colecciones y personas**: tablas creadas; UI mínima.
6. **Realtime**: habilitado en Supabase, aún no usado para actualizar la cola de
   revisión en vivo.
7. **Tests**: cubren el motor de selección y el parser M3U; falta cobertura de
   componentes/E2E automatizado.
8. **Rate limiting**: la CSP, RLS y validación están; un rate-limit por IP/usuario
   conviene añadirlo en las rutas API antes de producción.
9. **i18n de la UI**: la interfaz está en español; no hay conmutador de idioma.

---

## Comandos

```bash
npm run dev         # desarrollo
npm run build       # build de producción
npm run typecheck   # tsc --noEmit
npm test            # Vitest (motor + M3U)
npm run seed:tmdb   # seed opcional desde TMDB (service-role)
supabase db reset   # reaplica migraciones + seed
```
