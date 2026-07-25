/**
 * Embed Security — política de reproducción web + modelo analítico de riesgo
 * ==========================================================================
 *
 * ⚠️ DECISIÓN DELIBERADA (versión WEB): los iframes de proveedores `embed` se
 * renderizan SIN el atributo `sandbox`. Se retiró a propósito porque MÚLTIPLES
 * proveedores de embed DETECTAN el atributo `sandbox` y RECHAZAN la reproducción
 * (mensajes tipo «Please disable sandbox»). En la web priorizamos la
 * COMPATIBILIDAD de reproducción sobre el bloqueo de popups. NO se intenta ocultar
 * ni evadir esa detección: simplemente no se usa `sandbox`.
 *
 * El bloqueo de popups / navegación superior / descargas se abordará en las apps
 * NATIVAS (Electron, Android, iOS), donde el host/WebView da control real sobre
 * las ventanas emergentes:
 *   · Electron  → `webContents.setWindowOpenHandler` / `will-navigate`
 *   · Android   → `WebChromeClient.onCreateWindow` / `WebViewClient`
 *   · iOS       → `WKUIDelegate` / `WKNavigationDelegate` (decidePolicyFor)
 * Para ese futuro se CONSERVA el modelo de datos de riesgo por proveedor
 * ({@link ProviderSecurity}: popup_risk, redirect_risk, last_security_test_at)
 * como información ANALÍTICA. Ese modelo YA NO afecta el render del iframe en web
 * (solo alimenta el panel admin y la futura política nativa).
 *
 * Sigue vigente, aparte del sandbox y sin relación con la detección:
 *   · `Permissions-Policy` a nivel de documento (cabecera del middleware) que
 *     deniega cámara/micrófono/geolocalización/pago/portapapeles — no afecta la
 *     reproducción de vídeo ni es detectable como «sandbox».
 *   · CSP `frame-src` dinámico (orígenes de proveedores activos).
 *
 * Módulo PURO (sin I/O, sin React, sin `server-only`): se usa igual en el
 * servidor, el cliente (Player) y el edge (middleware).
 */

export type RiskLevel = "low" | "medium" | "high";

// ── Atributos del iframe embed (web) ─────────────────────────────────────────
/**
 * Atributo `allow` del iframe. Concede capacidades benignas de reproducción; el
 * resto (cámara, micrófono, geolocalización, portapapeles, pago…) queda denegado
 * por la `Permissions-Policy` del documento.
 */
export const EMBED_ALLOW = "autoplay; fullscreen; picture-in-picture; encrypted-media";

/**
 * Valores de `referrerPolicy` soportados para el iframe de un proveedor.
 * Some providers (e.g. VidSrc Ad-Free Plays) require a specific
 * Referrer Policy to identify verified domains.
 * This value is configurable per provider.
 */
export type ReferrerPolicyValue =
  | "origin"
  | "strict-origin-when-cross-origin"
  | "no-referrer"
  | "unsafe-url";

const REFERRER_POLICIES: readonly ReferrerPolicyValue[] = [
  "origin",
  "strict-origin-when-cross-origin",
  "no-referrer",
  "unsafe-url",
];

/**
 * `referrerPolicy` por defecto del iframe cuando el proveedor no define la suya.
 * `strict-origin-when-cross-origin` envía solo el origen a destinos cross-origin
 * (equilibra privacidad y compatibilidad).
 */
export const EMBED_REFERRER_POLICY: ReferrerPolicyValue = "strict-origin-when-cross-origin";

/**
 * Lee la política de referrer del proveedor desde `public_config.referrer_policy`.
 * Some providers (e.g. VidSrc Ad-Free Plays) require a specific Referrer Policy to
 * identify verified domains; por eso es configurable por proveedor. Si no está
 * definida o es inválida, cae al valor por defecto.
 */
export function readReferrerPolicy(
  publicConfig: Record<string, unknown> | null | undefined,
): ReferrerPolicyValue {
  const v = publicConfig?.referrer_policy;
  return REFERRER_POLICIES.includes(v as ReferrerPolicyValue)
    ? (v as ReferrerPolicyValue)
    : EMBED_REFERRER_POLICY;
}

// ── Timeouts de carga / fallback ─────────────────────────────────────────────
/** Sonda de alcanzabilidad del servidor del embed (no-cors) antes de framar. */
export const EMBED_PROBE_TIMEOUT_MS = 7_000;
/** Vigía: si el iframe no dispara `onLoad`, se salta a la siguiente fuente. */
export const EMBED_LOAD_TIMEOUT_MS = 12_000;

// ── Clasificación de eventos del embed (crítico vs no crítico) ───────────────
/**
 * Firma de los mensajes `postMessage` que un embed COOPERANTE (p.ej. el
 * reproductor de primera parte) puede enviar a la ventana anfitriona para
 * informar de su salud. Los embeds opacos de terceros no la envían; su ausencia
 * NO es un fallo (la carga se vigila por timeout aparte).
 */
export const SHIELD_EVENT_SOURCE = "secure-embed-shield" as const;

export type EmbedEventKind =
  | "popup_blocked" // una ventana emergente fue bloqueada (host nativo o el navegador)
  | "icon_load_failed" // iconos internos del reproductor (PiP/AirPlay) no cargaron
  | "telemetry_failed" // un beacon/analítica del embed falló
  | "iframe_loaded" // el documento del iframe cargó
  | "playback_started" // el embed confirma que la reproducción arrancó
  | "playback_error"; // el embed reporta que NO puede reproducir

/**
 * Un popup bloqueado, un icono de control que no carga o un beacon de telemetría
 * caído NO son fallos de reproducción: son ruido benigno. Solo `playback_error`
 * (el embed declara que no puede reproducir) es un fallo REAL reportable; la
 * ausencia de carga del iframe se detecta por separado por timeout.
 */
export function isCriticalEmbedEvent(kind: EmbedEventKind): boolean {
  return kind === "playback_error";
}

/** Eventos benignos que NUNCA deben provocar fallback ni marcar `unavailable`. */
export const NON_CRITICAL_EMBED_EVENTS: readonly EmbedEventKind[] = [
  "popup_blocked",
  "icon_load_failed",
  "telemetry_failed",
  "iframe_loaded",
  "playback_started",
];

/**
 * `Permissions-Policy` a nivel de documento. Deniega (`=()`) las capacidades
 * sensibles para TODOS (documento e iframes por igual). NO es el atributo
 * `sandbox` y no dispara la detección «disable sandbox»; tampoco afecta la
 * reproducción de vídeo (concede autoplay/fullscreen/PiP/encrypted-media).
 */
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=*",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=()",
  "display-capture=()",
  "encrypted-media=*",
  "fullscreen=*",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=*",
  "usb=()",
].join(", ");

// ── Modelo de riesgo por proveedor (SOLO analítica) ──────────────────────────
/**
 * Metadatos de riesgo de un proveedor de embed. Se persisten en
 * `providers.public_config.security` (JSONB). NO afectan el render del iframe en
 * web: son información analítica para el panel admin y para la futura política de
 * bloqueo en apps nativas. Los campos que antes controlaban el sandbox
 * (`embed_security_level`, `sandbox_compatible`, `requires_same_origin`) se
 * eliminaron junto con el atributo `sandbox`.
 */
export interface ProviderSecurity {
  popup_risk: RiskLevel;
  redirect_risk: RiskLevel;
  last_security_test_at: string | null;
}

const RISKS: readonly RiskLevel[] = ["low", "medium", "high"];

function asRisk(v: unknown, fallback: RiskLevel): RiskLevel {
  return RISKS.includes(v as RiskLevel) ? (v as RiskLevel) : fallback;
}

/** Lee los metadatos de riesgo desde `public_config.security` (con defaults). */
export function readProviderSecurity(
  publicConfig: Record<string, unknown> | null | undefined,
): ProviderSecurity {
  const raw = (publicConfig?.security ?? {}) as Record<string, unknown>;
  return {
    popup_risk: asRisk(raw.popup_risk, "medium"),
    redirect_risk: asRisk(raw.redirect_risk, "medium"),
    last_security_test_at:
      typeof raw.last_security_test_at === "string" ? raw.last_security_test_at : null,
  };
}

// ── Evaluación de riesgo (analítica, sin efecto en el render) ────────────────
export interface SecurityAssessment {
  /** Riesgo alto de popup o de redirección: relevante para la app nativa. */
  needsNativeMitigation: boolean;
  warnings: string[];
}

/**
 * Evalúa los metadatos de riesgo y produce avisos. Es SOLO informativo: en web no
 * cambia nada del render (no hay sandbox). Marca `needsNativeMitigation` para que
 * la futura app nativa priorice el bloqueo de popups/redirects en esos proveedores.
 */
export function assessProvider(security: ProviderSecurity): SecurityAssessment {
  const warnings: string[] = [];
  if (security.popup_risk === "high") {
    warnings.push("Riesgo de popup alto: en web abrirá ventanas emergentes; mitigar en app nativa.");
  }
  if (security.redirect_risk === "high") {
    warnings.push("Riesgo de redirección alto: podría navegar fuera; mitigar en app nativa.");
  }
  const needsNativeMitigation = security.popup_risk === "high" || security.redirect_risk === "high";
  return { needsNativeMitigation, warnings };
}
