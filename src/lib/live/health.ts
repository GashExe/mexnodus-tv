/**
 * Salud de señales IPTV — decisiones PURAS
 * ========================================
 * Este módulo NO hace red ni toca Supabase: recibe el resultado de una sonda y
 * devuelve qué habría que cambiar. El runner (`scripts/nightly.ts`) es quien
 * sondea y escribe. Mismo patrón que `planChannelMerges` en `merge.ts`, y por
 * eso todo esto se puede testear sin navegador ni base de datos.
 *
 * ALCANCE: solo canales en vivo (`channels` / `channel_streams`). NADA de este
 * módulo toca películas y series (`providers`, `media_availabilities`,
 * `media_titles`, `episodes`) — son sistemas separados sin tablas en común.
 *
 * ── Por qué tres cubos y no dos ──────────────────────────────────────────────
 * Un stream que funciona desde México puede devolver 403 desde una IP de
 * datacenter (el runner de GitHub) por geobloqueo, y `channel_streams` ni
 * siquiera guarda `user_agent`/`referrer` para imitar al navegador. Degradar por
 * un 403 borraría canales sanos. Por eso `suspect` existe y NUNCA degrada solo.
 */
import type { TechStatus } from "@/lib/types/db";

// ── Resultado de una sonda ───────────────────────────────────────────────────

/** Veredicto de una señal sondeada. */
export type ProbeVerdict = "ok" | "dead" | "suspect";

/**
 * Lo que el runner observó al pedir la URL. `networkError` es el código de Node
 * (`ENOTFOUND`, `ECONNREFUSED`, `CERT_HAS_EXPIRED`…) o el nombre del error.
 */
export interface ProbeObservation {
  status?: number;
  /** Cuerpo (truncado) de la respuesta; se usa para validar el manifiesto. */
  body?: string;
  /** Código/nombre del fallo de red, si no hubo respuesta HTTP. */
  networkError?: string;
  /** `Access-Control-Allow-Origin` devuelto, si lo hubo. */
  accessControlAllowOrigin?: string | null;
  /** Origen desde el que reproduce la app (para validar el CORS). */
  origin?: string;
}

/** Un manifiesto HLS válido empieza por `#EXTM3U` y declara variantes o segmentos. */
export function isValidHlsManifest(body: string | undefined): boolean {
  if (!body) return false;
  const text = body.trimStart();
  if (!text.startsWith("#EXTM3U")) return false;
  return text.includes("#EXT-X-STREAM-INF") || text.includes("#EXTINF");
}

/**
 * ¿El navegador podría leer esto? hls.js hace peticiones XHR cross-origin, así
 * que sin `Access-Control-Allow-Origin` compatible la señal es INSERVIBLE aunque
 * el servidor responda 200. Lo aprendimos con "Las Estrellas": viva por curl y
 * potencialmente inútil en el navegador si no manda la cabecera.
 */
export function corsAllows(acao: string | null | undefined, origin: string | undefined): boolean {
  if (!acao) return false;
  if (acao === "*") return true;
  if (!origin) return true; // sin origen declarado no podemos afirmar que bloquea
  return acao.trim().toLowerCase() === origin.trim().toLowerCase();
}

/** Fallos de red que significan muerte real, no un bache pasajero. */
const HARD_NETWORK_ERRORS = [
  "ENOTFOUND", // el dominio ya no existe
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
];

/** Códigos HTTP que confirman que el recurso ya no está. */
const DEAD_STATUS = [400, 404, 410];

/**
 * Motivo legible del veredicto. Sirve para que el informe del job distinga, por
 * ejemplo, «muerta porque el manifiesto no es válido» de «muerta porque no manda
 * CORS» — decisiones muy distintas que si no se separan quedan enterradas.
 */
export type ProbeReason =
  | "ok"
  | "network_hard"
  | "network_soft"
  | "http_dead"
  | "http_soft"
  | "no_manifest"
  | "cors_blocked";

export interface ProbeEvaluation {
  verdict: ProbeVerdict;
  reason: ProbeReason;
}

/**
 * Evalúa una observación. Los errores de TLS cuentan como `dead` a propósito:
 * el navegador rechaza esos certificados igual que nosotros, así que la señal
 * está rota para el usuario real. Nunca se desactiva la verificación TLS.
 */
export function evaluateProbe(obs: ProbeObservation): ProbeEvaluation {
  if (obs.networkError) {
    const code = obs.networkError.toUpperCase();
    return HARD_NETWORK_ERRORS.some((e) => code.includes(e))
      ? { verdict: "dead", reason: "network_hard" }
      : { verdict: "suspect", reason: "network_soft" }; // timeouts, resets…
  }

  const status = obs.status ?? 0;
  if (DEAD_STATUS.includes(status)) return { verdict: "dead", reason: "http_dead" };
  // 403/429/451/5xx: puede ser geobloqueo o límite desde la IP del runner.
  if (status === 403 || status === 429 || status === 451 || status >= 500) {
    return { verdict: "suspect", reason: "http_soft" };
  }
  if (status < 200 || status >= 400) return { verdict: "suspect", reason: "http_soft" };

  // 200 pero el cuerpo no es un manifiesto → la URL ya no sirve vídeo.
  if (!isValidHlsManifest(obs.body)) return { verdict: "dead", reason: "no_manifest" };
  // 200 con manifiesto válido pero sin CORS → hls.js no puede leerlo.
  if (!corsAllows(obs.accessControlAllowOrigin, obs.origin)) {
    return { verdict: "dead", reason: "cors_blocked" };
  }
  return { verdict: "ok", reason: "ok" };
}

/** Solo el veredicto, para quien no necesite el motivo. */
export function classifyProbe(obs: ProbeObservation): ProbeVerdict {
  return evaluateProbe(obs).verdict;
}

// ── Racha de fallos reusando `tech_status` (sin columna nueva) ────────────────

/**
 * El enum `tech_status` hace de contador: hace falta un SEGUNDO fallo duro
 * consecutivo para dar una señal por muerta. Una sola muestra no es evidencia,
 * y así el job puede actuar solo desde la primera noche sin ser destructivo.
 *
 * `suspect` deja la señal en `degraded` pero JAMÁS la lleva a `offline`.
 */
export function nextTechStatus(current: TechStatus, verdict: ProbeVerdict): TechStatus {
  if (verdict === "ok") return "online";
  // `suspect` significa NO SABEMOS, y eso es exactamente `unknown`.
  //
  // Antes devolvía `degraded`, y con datos reales resultó ser dañino: los canales
  // mexicanos están geobloqueados (p.ej. `channel01-onlymex.akamaized.net`
  // responde 200 desde México y 403 desde el runner de GitHub en EE.UU.). Esas
  // señales quedaban `degraded` y el reordenamiento las hundía POR DEBAJO de otra
  // peor que sí se ve desde fuera — justo al revés de lo que le conviene al
  // usuario mexicano. Como `unknown` va por encima de `degraded` en el ranking,
  // devolver `unknown` evita ese castigo y además se autocorrige: si mañana la
  // sonda sí la alcanza, sube a `online`.
  if (verdict === "suspect") return "unknown";
  // verdict === "dead": segundo golpe consecutivo → confirmada
  return current === "degraded" || current === "offline" ? "offline" : "degraded";
}

// ── Planes de cambio (puros) ─────────────────────────────────────────────────

/** Lo mínimo que necesitan los planes de una señal. */
export interface HealthStream {
  id: string;
  channel_id: string;
  play_url: string;
  priority: number;
  is_primary: boolean;
  tech_status: TechStatus;
  last_checked_at: string | null;
}

/** Orden de preferencia: una señal sin comprobar vale más que una degradada. */
const HEALTH_RANK: Record<TechStatus, number> = {
  online: 3,
  unknown: 2,
  degraded: 1,
  offline: 0,
};

export interface RankingChange {
  id: string;
  priority: number;
  is_primary: boolean;
}

/**
 * Reordena las señales de UN canal por salud y devuelve solo las que cambian.
 *
 * Arregla dos defectos de la importación (`ingest.ts`): la prioridad colapsaba a
 * 0 a partir del índice 9 sin desempate, y podían quedar VARIAS señales con
 * `is_primary=true` a la vez (le pasa a "Las Estrellas"). Aquí sale exactamente
 * una primaria, siempre.
 */
export function planStreamRanking(streams: HealthStream[]): RankingChange[] {
  const ordered = [...streams].sort((a, b) => {
    const health = HEALTH_RANK[b.tech_status] - HEALTH_RANK[a.tech_status];
    if (health !== 0) return health;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id); // desempate estable
  });

  const changes: RankingChange[] = [];
  ordered.forEach((s, i) => {
    const priority = Math.max(0, 100 - i);
    const is_primary = i === 0;
    if (s.priority !== priority || s.is_primary !== is_primary) {
      changes.push({ id: s.id, priority, is_primary });
    }
  });
  return changes;
}

/**
 * Un canal se retira del catálogo solo si TODAS sus señales están confirmadas
 * muertas. Con una viva —o simplemente sin confirmar— sigue publicado.
 */
export function planChannelActivation(streams: HealthStream[]): { is_active: boolean } {
  if (streams.length === 0) return { is_active: false };
  return { is_active: !streams.every((s) => s.tech_status === "offline") };
}

/**
 * Colapsa señales repetidas dentro de un canal (mismo `play_url`). No hay UNIQUE
 * en `(channel_id, play_url)` y la deduplicación de la importación solo compara
 * contra lo ya guardado, no contra el propio lote — de ahí las filas gemelas.
 * Conserva la primera (la más antigua por orden de entrada) y devuelve los ids
 * sobrantes.
 */
export function planDedup(streams: HealthStream[]): string[] {
  const seen = new Set<string>();
  const remove: string[] = [];
  for (const s of streams) {
    const key = s.play_url.trim();
    if (seen.has(key)) remove.push(s.id);
    else seen.add(key);
  }
  return remove;
}

/** Días que una señal debe llevar muerta antes de borrarse. */
export const PRUNE_AFTER_DAYS = 14;

/**
 * Sin poda, el re-sync nocturno haría crecer `channel_streams` sin techo: la
 * deduplicación es por `play_url`, así que cada URL nueva se acumula para
 * siempre. Se borran las confirmadas muertas y rancias, pero NUNCA la última
 * señal de un canal: mejor un canal con una señal muerta que un canal huérfano.
 */
export function planPruning(streams: HealthStream[], now: Date): string[] {
  const cutoff = now.getTime() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const stale = streams.filter(
    (s) =>
      s.tech_status === "offline" &&
      s.last_checked_at !== null &&
      new Date(s.last_checked_at).getTime() < cutoff,
  );
  if (stale.length >= streams.length) return stale.slice(1).map((s) => s.id);
  return stale.map((s) => s.id);
}

// ── Cortacircuitos ───────────────────────────────────────────────────────────

/** Si se confirma muerta más de esta fracción, el problema probablemente es el runner. */
export const CIRCUIT_BREAKER_FAILURE_RATIO = 0.4;

/**
 * Ante una tasa de MUERTE CONFIRMADA desmedida (sin DNS, runner bloqueado,
 * proveedor rechazando en bloque) se informa pero NO se muta nada. Sin esto, una
 * mala noche apaga medio catálogo mientras el usuario duerme.
 *
 * Mira solo los `dead`, NO los `suspect`. Medido contra el catálogo real, más de
 * la mitad de las sondas dan timeout de conexión — normal en listas IPTV
 * públicas llenas de IPs caídas. Como un `suspect` nunca degrada nada por sí
 * solo, contarlo aquí solo conseguiría abortar siempre y no promocionar jamás la
 * señal que sí funciona. Un runner realmente roto se delata igual: sin DNS todo
 * sale `ENOTFOUND`, que SÍ cuenta como `dead`.
 */
export function shouldAbortMutations(total: number, dead: number): boolean {
  if (total === 0) return true;
  return dead / total > CIRCUIT_BREAKER_FAILURE_RATIO;
}
