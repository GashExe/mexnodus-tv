/**
 * Job nocturno: salud de señales IPTV
 * ===================================
 * Sondea las señales reproducibles, reordena para que la que funciona quede
 * primera, retira los canales sin ninguna señal viva y poda las muertas rancias.
 *
 * ALCANCE: solo canales en vivo (`channels` / `channel_streams`). NO toca nada de
 * películas y series (`providers`, `media_availabilities`, `media_titles`,
 * `episodes`) — son sistemas separados sin tablas en común.
 *
 * Corre en GitHub Actions, NO en Vercel: `vercel.json` capa las rutas API a 30s
 * y esto son decenas de minutos.
 *
 * Uso:
 *   npm run nightly -- --dry-run --limit 200   # muestra, no escribe nada
 *   npm run nightly -- --dry-run               # censo completo, sin escribir
 *   npm run nightly                            # ejecución real (siempre completa)
 *   npm run nightly -- --prune                 # además borra las muertas rancias
 *
 * `--limit` SOLO se admite con `--dry-run`: al escribir, un corte parcial puede
 * dejar fuera señales del mismo canal y promocionar una muerta. Ver `parseArgs`.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { assertSafeUrl } from "@/lib/ssrf";
import {
  evaluateProbe,
  nextTechStatus,
  planChannelActivation,
  planDedup,
  planPruning,
  planStreamRanking,
  shouldAbortMutations,
  type HealthStream,
  type ProbeReason,
  type ProbeVerdict,
} from "@/lib/live/health";
import type { TechStatus } from "@/lib/types/db";

// ── Parámetros ───────────────────────────────────────────────────────────────
const CONCURRENCY = 40;
/** Tope por host: evita provocar el 429 que luego malinterpretaríamos. */
const PER_HOST = 3;
const PROBE_TIMEOUT_MS = 12_000;
/** Solo hace falta la cabecera del manifiesto para validarlo. */
const MAX_BYTES = 64 * 1024;
const PAGE = 1000;
const WRITE_CHUNK = 300;

interface Args {
  dryRun: boolean;
  limit: number | null;
  origin: string;
  prune: boolean;
}

function flagValue(argv: string[], name: string): string | undefined {
  const withEq = argv.find((a) => a.startsWith(`${name}=`));
  if (withEq) return withEq.split("=").slice(1).join("=");
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/**
 * El `Origin` con el que se sondea decide el veredicto de CORS, así que NO puede
 * salir de `.env.local` (allí `NEXT_PUBLIC_SITE_URL` es localhost, y validar
 * contra localhost daría un resultado que no se parece al del usuario real).
 * Se toma de `--origin` o de `PROBE_ORIGIN`, y si falta se aborta.
 */
function parseArgs(argv: string[]): Args {
  const rawLimit = flagValue(argv, "--limit");
  const limit = rawLimit === undefined ? NaN : Number(rawLimit);
  const origin = flagValue(argv, "--origin") ?? process.env.PROBE_ORIGIN ?? "";
  if (!origin || !/^https?:\/\//.test(origin)) {
    throw new Error(
      "Falta el origen de sondeo. Usa --origin https://tu-dominio o la variable PROBE_ORIGIN. " +
        "Debe ser el dominio REAL desde el que reproduce la app: de él depende el veredicto de CORS.",
    );
  }

  const dryRun = argv.includes("--dry-run");
  const limited = Number.isFinite(limit) && limit > 0;
  // `--limit` corta por `id`, y las señales de un canal NO son contiguas: puede
  // entrar solo una parte. El reordenamiento se calcula por canal sobre lo
  // cargado, así que si de un canal solo entra su señal MUERTA, esa queda sola en
  // su grupo y se lleva la prioridad más alta — por encima de una sana que no se
  // cargó. Inofensivo midiendo; destructivo escribiendo.
  if (limited && !dryRun) {
    throw new Error(
      "--limit solo se admite junto a --dry-run. Escribiendo, un límite parcial puede " +
        "promocionar una señal muerta por encima de una sana del mismo canal que no entró " +
        "en el corte. Para una ejecución real, lánzala completa (sin --limit).",
    );
  }
  return {
    dryRun,
    limit: limited ? limit : null,
    origin: origin.replace(/\/$/, ""),
    // Borrar es lo ÚNICO irreversible de todo el job, y hay un motivo concreto
    // para no hacerlo por defecto: el mayor grupo de fallo medido es
    // `cors_blocked` (~17%) — manifiestos válidos sin cabecera CORS. No sirven en
    // NAVEGADOR, pero sí funcionarían en las apps nativas previstas
    // (Electron/Android/iOS), donde el CORS no aplica. Borrarlos ahora tiraría
    // datos que valen para eso. Se activa a mano y con conocimiento de causa.
    prune: argv.includes("--prune"),
  };
}

// ── Sonda ────────────────────────────────────────────────────────────────────

interface ProbeResult {
  verdict: ProbeVerdict;
  reason: ProbeReason;
  status: number | null;
  responseMs: number;
  error: string | null;
}

/**
 * Pide el manifiesto con el `Origin` real de la app para poder juzgar el CORS:
 * un stream vivo por curl puede ser inservible en el navegador si no devuelve
 * `Access-Control-Allow-Origin`, y hls.js no podría leerlo.
 *
 * No se usa `safeFetch` porque necesitamos las CABECERAS de la respuesta (que no
 * devuelve) y distinguir el código de error de red. Sí se reutiliza su guardia
 * `assertSafeUrl` para no perder la protección SSRF.
 */
async function probe(url: string, origin: string): Promise<ProbeResult> {
  const started = Date.now();
  const safe = assertSafeUrl(url);
  if (!safe.ok) {
    return {
      verdict: "dead",
      reason: "network_hard",
      status: null,
      responseMs: 0,
      error: `SSRF: ${safe.reason}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "MexNodusTV/0.1 (+probe)", Origin: origin },
    });

    let body = "";
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        body += decoder.decode(value, { stream: true });
        if (received > MAX_BYTES) {
          void reader.cancel();
          break;
        }
      }
    }

    const { verdict, reason } = evaluateProbe({
      status: res.status,
      body,
      accessControlAllowOrigin: res.headers.get("access-control-allow-origin"),
      origin,
    });
    return { verdict, reason, status: res.status, responseMs: Date.now() - started, error: null };
  } catch (e) {
    const err = e as { name?: string; message?: string; cause?: { code?: string } };
    const code = err.cause?.code ?? err.name ?? "UnknownError";
    const { verdict, reason } = evaluateProbe({ networkError: code });
    return {
      verdict,
      reason,
      status: null,
      responseMs: Date.now() - started,
      error: `${code}${err.message ? `: ${err.message.slice(0, 120)}` : ""}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Ejecuta con concurrencia global y tope por host. */
async function runPool<T, R>(
  items: T[],
  keyOf: (t: T) => string,
  worker: (t: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const inFlightByHost = new Map<string, number>();
  let cursor = 0;

  async function lane(): Promise<void> {
    for (;;) {
      let picked = -1;
      // busca el siguiente cuyo host no esté saturado
      for (let i = cursor; i < items.length; i++) {
        const host = keyOf(items[i]);
        if ((inFlightByHost.get(host) ?? 0) < PER_HOST) {
          picked = i;
          break;
        }
      }
      if (picked === -1) {
        if (cursor >= items.length) return;
        await new Promise((r) => setTimeout(r, 50)); // hosts saturados: espera corta
        continue;
      }
      const item = items[picked];
      items[picked] = items[cursor];
      items[cursor] = item;
      const index = cursor++;
      const host = keyOf(item);

      inFlightByHost.set(host, (inFlightByHost.get(host) ?? 0) + 1);
      try {
        results[index] = await worker(item);
      } finally {
        inFlightByHost.set(host, (inFlightByHost.get(host) ?? 1) - 1);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, lane));
  return results;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalido";
  }
}

// ── Carga de señales ─────────────────────────────────────────────────────────

type Row = HealthStream & { review_status: string; publish_authorization: string };

async function loadPlayableStreams(
  sb: ReturnType<typeof createServiceClient>,
  limit: number | null,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = limit ? Math.min(from + PAGE - 1, limit - 1) : from + PAGE - 1;
    if (limit && from >= limit) break;
    const { data, error } = await sb
      .from("channel_streams")
      .select("id, channel_id, play_url, priority, is_primary, tech_status, last_checked_at")
      .eq("is_active", true)
      .eq("review_status", "approved")
      .eq("publish_authorization", "authorized")
      .order("id")
      .range(from, to);
    if (error) throw new Error(`leyendo channel_streams: ${error.message}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

// ── Principal ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  console.log(
    `[nightly] inicio · ${args.dryRun ? "DRY-RUN (no escribe)" : "ESCRITURA"}` +
      `${args.limit ? ` · limit=${args.limit}` : ""} · origen=${args.origin}`,
  );

  const sb = createServiceClient();

  const streams = await loadPlayableStreams(sb, args.limit);
  console.log(`[nightly] señales reproducibles a sondear: ${streams.length}`);
  if (streams.length === 0) {
    console.log("[nightly] nada que hacer");
    return;
  }

  // 1. Sondeo
  const probes = await runPool(streams, (s) => hostOf(s.play_url), (s) => probe(s.play_url, args.origin));
  const byId = new Map<string, ProbeResult>();
  streams.forEach((s, i) => byId.set(s.id, probes[i]));

  const tally: Record<ProbeVerdict, number> = { ok: 0, dead: 0, suspect: 0 };
  probes.forEach((p) => (tally[p.verdict] += 1));
  const failures = tally.dead + tally.suspect; // solo para el informe
  const pct = (n: number) => `${Math.round((n / streams.length) * 100)}%`;
  console.log(
    `[nightly] resultado · ok=${tally.ok} (${pct(tally.ok)}) ` +
      `dead=${tally.dead} (${pct(tally.dead)}) suspect=${tally.suspect} (${pct(tally.suspect)})`,
  );

  // Desglose por MOTIVO: separa «sin CORS» de «manifiesto inválido» y de los
  // fallos de red. Es lo que permite ver si el runner tiene sesgo de geobloqueo
  // (mucho http_soft) antes de dejarlo actuar.
  const reasons = new Map<string, number>();
  streams.forEach((s) => {
    const p = byId.get(s.id)!;
    if (p.verdict === "ok") return;
    const detail = p.error?.split(":")[0] ?? `http_${p.status}`;
    const key = `${p.reason.padEnd(14)} ${detail}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  });
  if (reasons.size > 0) console.log("[nightly] motivos de fallo:");
  [...reasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([k, v]) => console.log(`           ${String(v).padStart(5)}  ${k}`));

  // 2. Cortacircuitos — solo sobre muertes CONFIRMADAS (ver shouldAbortMutations)
  if (shouldAbortMutations(streams.length, tally.dead)) {
    console.log(
      `[nightly] CORTACIRCUITOS: ${pct(tally.dead)} de muerte confirmada supera el umbral. ` +
        `Se asume problema del runner (sin DNS, red caída) y NO se muta nada.`,
    );
    return;
  }

  // 3. Nuevo tech_status por señal
  const nextStatus = new Map<string, TechStatus>();
  const updated: HealthStream[] = streams.map((s) => {
    const next = nextTechStatus(s.tech_status, byId.get(s.id)!.verdict);
    nextStatus.set(s.id, next);
    return { ...s, tech_status: next, last_checked_at: new Date().toISOString() };
  });

  // 4. Planes por canal
  const byChannel = new Map<string, HealthStream[]>();
  updated.forEach((s) => {
    const list = byChannel.get(s.channel_id) ?? [];
    list.push(s);
    byChannel.set(s.channel_id, list);
  });

  const rankingChanges: { id: string; priority: number; is_primary: boolean }[] = [];
  const dedupIds: string[] = [];
  const pruneIds: string[] = [];
  const deactivate: string[] = [];
  const now = new Date();

  for (const [channelId, list] of byChannel) {
    const dupes = new Set(planDedup(list));
    dedupIds.push(...dupes);
    const kept = list.filter((s) => !dupes.has(s.id));
    const stale = args.prune ? new Set(planPruning(kept, now)) : new Set<string>();
    pruneIds.push(...stale);
    const alive = kept.filter((s) => !stale.has(s.id));
    rankingChanges.push(...planStreamRanking(alive));
    if (!planChannelActivation(alive).is_active) deactivate.push(channelId);
  }

  console.log(
    `[nightly] plan · reordenar=${rankingChanges.length} duplicadas=${dedupIds.length} ` +
      `podar=${pruneIds.length}${args.prune ? "" : " (poda desactivada; usa --prune)"} ` +
      `desactivar canales=${deactivate.length}`,
  );

  if (args.dryRun) {
    console.log("[nightly] DRY-RUN: no se escribe nada. Fin.");
    return;
  }

  // 5. Escritura
  await writeStatuses(sb, updated, nextStatus, byId);
  await writeChecks(sb, streams, byId);
  await applyRanking(sb, rankingChanges);
  await deleteStreams(sb, [...dedupIds, ...pruneIds]);
  await deactivateChannels(sb, deactivate);
  await reactivateRecovered(sb, byChannel, nextStatus);

  console.log(`[nightly] fin · ${Math.round((Date.now() - started) / 1000)}s`);
}

// ── Escrituras ───────────────────────────────────────────────────────────────

async function writeStatuses(
  sb: ReturnType<typeof createServiceClient>,
  updated: HealthStream[],
  nextStatus: Map<string, TechStatus>,
  byId: Map<string, ProbeResult>,
): Promise<void> {
  let n = 0;
  for (const s of updated) {
    const { error } = await sb
      .from("channel_streams")
      .update({
        tech_status: nextStatus.get(s.id),
        last_checked_at: s.last_checked_at,
        response_ms: byId.get(s.id)?.responseMs ?? null,
      })
      .eq("id", s.id);
    if (!error) n++;
  }
  console.log(`[nightly] tech_status actualizado en ${n} señales`);
}

async function writeChecks(
  sb: ReturnType<typeof createServiceClient>,
  streams: Row[],
  byId: Map<string, ProbeResult>,
): Promise<void> {
  const rows = streams.map((s) => {
    const p = byId.get(s.id)!;
    return {
      channel_stream_id: s.id,
      ok: p.verdict === "ok",
      http_status: p.status,
      response_ms: p.responseMs,
      error: p.error,
      source: "worker",
    };
  });
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await sb.from("stream_checks").insert(rows.slice(i, i + WRITE_CHUNK));
  }
  console.log(`[nightly] ${rows.length} filas en stream_checks`);
}

async function applyRanking(
  sb: ReturnType<typeof createServiceClient>,
  changes: { id: string; priority: number; is_primary: boolean }[],
): Promise<void> {
  for (const c of changes) {
    await sb
      .from("channel_streams")
      .update({ priority: c.priority, is_primary: c.is_primary })
      .eq("id", c.id);
  }
  console.log(`[nightly] prioridad reordenada en ${changes.length} señales`);
}

async function deleteStreams(
  sb: ReturnType<typeof createServiceClient>,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
    await sb.from("channel_streams").delete().in("id", ids.slice(i, i + WRITE_CHUNK));
  }
  console.log(`[nightly] ${ids.length} señales borradas (duplicadas o muertas rancias)`);
}

/** Marca `health.channel_deactivated` en `audit_logs`: es lo que hace reversible el paso. */
async function deactivateChannels(
  sb: ReturnType<typeof createServiceClient>,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
    const slice = ids.slice(i, i + WRITE_CHUNK);
    await sb.from("channels").update({ is_active: false }).in("id", slice);
    await sb.from("audit_logs").insert(
      slice.map((id) => ({
        action: "health.channel_deactivated",
        entity: "channels",
        entity_id: id,
        metadata: { channel_id: id, via: "nightly" },
      })),
    );
  }
  console.log(`[nightly] ${ids.length} canales desactivados (auditados para poder revertir)`);
}

/**
 * Reactiva SOLO los canales que este job desactivó.
 *
 * Reactivar cualquier canal con una señal viva desharía la fusión de duplicados:
 * hay ~2.536 canales con `is_active=false` puestos a propósito por
 * `planChannelMerges`, muchos con señales perfectamente vivas. Por eso se
 * consulta `audit_logs` y se limita a ese conjunto.
 */
async function reactivateRecovered(
  sb: ReturnType<typeof createServiceClient>,
  byChannel: Map<string, HealthStream[]>,
  nextStatus: Map<string, TechStatus>,
): Promise<void> {
  const recovered = [...byChannel.entries()]
    .filter(([, list]) => list.some((s) => nextStatus.get(s.id) === "online"))
    .map(([id]) => id);
  if (recovered.length === 0) return;

  const owned = new Set<string>();
  for (let i = 0; i < recovered.length; i += WRITE_CHUNK) {
    const { data } = await sb
      .from("audit_logs")
      .select("entity_id")
      .eq("action", "health.channel_deactivated")
      .in("entity_id", recovered.slice(i, i + WRITE_CHUNK));
    (data as { entity_id: string }[] | null)?.forEach((r) => owned.add(r.entity_id));
  }
  if (owned.size === 0) return;

  const ids = [...owned];
  for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
    await sb
      .from("channels")
      .update({ is_active: true })
      .in("id", ids.slice(i, i + WRITE_CHUNK))
      .eq("is_active", false);
  }
  console.log(`[nightly] ${ids.length} canales reactivados (solo los que este job apagó)`);
}

main().catch((e) => {
  console.error("[nightly] error fatal:", e);
  process.exit(1);
});
