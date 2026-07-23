# Worker externo de validación — interfaz (contrato)

Vercel **no** puede ejecutar `ffprobe` ni procesos persistentes. Por eso la
validación técnica profunda se hace fuera de Vercel, en un worker independiente
(un contenedor, una VM, un runner de GitHub Actions programado, etc.).

La app de Vercel **solo encola**: inserta filas en `public.validation_jobs`.
El worker las reclama, valida, y escribe el resultado. Este directorio documenta
el contrato; no incluye el binario del worker (es infraestructura futura).

## Contrato de la cola (`validation_jobs`)

| Estado    | Quién lo pone | Significado                         |
|-----------|---------------|-------------------------------------|
| `queued`  | Vercel        | Trabajo pendiente                   |
| `claimed` | Worker        | Reclamado (con `claimed_by`, `claimed_at`) |
| `done`    | Worker        | Validado; `result` contiene métricas |
| `error`   | Worker        | Falló; `result.error` explica       |

### 1. Reclamar trabajos (worker → Supabase, service-role)

```sql
update public.validation_jobs
   set status = 'claimed', claimed_by = $worker_id, claimed_at = now()
 where id in (
   select id from public.validation_jobs
    where status = 'queued'
    order by created_at
    limit 10
    for update skip locked
 )
returning *;
```

### 2. Validar (fuera de Vercel)

Para cada job, el worker:
1. Aplica la **misma guardia SSRF** (bloquea localhost/redes privadas, http(s), timeouts).
2. Descarga el manifiesto HLS/DASH y/o corre `ffprobe` sobre la URL.
3. Mide: resolución, bitrate, codecs, fps, tiempo de respuesta, disponibilidad.

### 3. Escribir resultado

```sql
insert into public.stream_checks
  (availability_id, checked_at, ok, http_status, response_ms, resolution_height, bitrate_kbps, detected_codecs, source)
values ($avail, now(), true, 200, 850, 1080, 5000, '{"video":"h264","audio":"aac"}', 'worker');

update public.media_availabilities
   set tech_status = 'online', last_checked_at = now(),
       resolution_height = 1080, bitrate_kbps = 5000
 where id = $avail;

update public.validation_jobs set status = 'done', result = $metrics, updated_at = now() where id = $job;
```

## Autenticación del worker

El worker usa `SUPABASE_SERVICE_ROLE_KEY` (nunca en el frontend) y comparte
`VALIDATION_WORKER_SECRET` con la app si expone un endpoint de callback.

## En esta primera versión

- Vercel encola en `validation_jobs` (endpoint admin).
- Sin worker conectado, la app usa **datos simulados** (`source = 'mock'`) para
  no bloquear el flujo. Ver `POST /api/admin/validation/mock`.
- El `review_status`/`publish_authorization` NUNCA los cambia la validación
  técnica automáticamente: son decisiones humanas del panel de revisión.
