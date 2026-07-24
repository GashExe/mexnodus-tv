/**
 * Secure Embed Shield
 * ===================
 * Capa de seguridad para reproductores EXTERNOS embebidos por iframe.
 *
 * NO es un adblock: no intercepta ni modifica el contenido interno del tercero.
 * Lo que hace es ACOTAR desde el navegador los comportamientos abusivos que un
 * embed ajeno podría intentar:
 *   · abrir popups / pestañas nuevas
 *   · navegar la ventana principal (top navigation)
 *   · escapar del iframe
 *   · disparar descargas automáticas
 *   · pedir cámara, micrófono, geolocalización, portapapeles o APIs de pago
 *
 * Se apoya en dos mecanismos del estándar, complementarios:
 *   1. atributo `sandbox` del <iframe> (este módulo genera el valor por perfil);
 *   2. `Permissions-Policy` a nivel de documento (cabecera en el middleware) que
 *      DENIEGA globalmente cámara/micrófono/geolocalización/pago/portapapeles.
 *
 * Regla de oro: la seguridad global NUNCA se relaja por un proveedor. Si un
 * proveedor exige popups o navegación superior, se marca INCOMPATIBLE y se
 * ofrece solo como apertura externa (nunca dentro del iframe). El motor de
 * resolución probará entonces la siguiente fuente.
 *
 * Módulo PURO (sin I/O, sin React, sin `server-only`): se usa igual en el
 * servidor (resolución, panel admin) que en el cliente (Player) y en el edge
 * (middleware).
 */

// ── Perfiles ─────────────────────────────────────────────────────────────────
export type EmbedSecurityLevel = "strict" | "compatible" | "external-only";
export type RiskLevel = "low" | "medium" | "high";

/**
 * Tokens `sandbox` concedidos por perfil. `external-only` no aparece aquí porque
 * su política es NO cargar dentro de un iframe.
 *
 * NO se usa `allow-presentation`: Safari lo reporta como flag inválido y no
 * aporta al caso de uso. `compatible` añade `allow-same-origin` para CONSERVAR
 * el origen del embed — sin él, el frame recibe un origen opaco/`null` y sus
 * propios recursos fallan con «Origin null is not allowed by
 * Access-Control-Allow-Origin». Como el embed es de OTRO dominio, mantener su
 * origen no le da acceso al nuestro (sigue siendo cross-origin).
 *
 * Deliberadamente ausentes (ver {@link FORBIDDEN_SANDBOX_TOKENS}): allow-forms,
 * allow-modals, allow-pointer-lock, allow-popups, allow-top-navigation,
 * allow-downloads… Todo lo que no se concede queda bloqueado por defecto.
 */
export const SANDBOX_PROFILES = {
  strict: ["allow-scripts"],
  compatible: ["allow-scripts", "allow-same-origin"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Tokens que JAMÁS deben concederse: son la puerta a los abusos que este escudo
 * previene. `enforceSandboxTokens` los elimina aunque alguien intente colarlos
 * por configuración.
 */
export const FORBIDDEN_SANDBOX_TOKENS = [
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-downloads",
] as const;

/** Sandbox del perfil `strict`, precomputado. */
export const STRICT_SANDBOX = SANDBOX_PROFILES.strict.join(" ");
/**
 * Sandbox por defecto para un embed sin config explícita: `compatible`, que
 * CONSERVA el origen (evita el error «Origin null» de CORS). Fallback del cliente.
 */
export const DEFAULT_EMBED_SANDBOX = SANDBOX_PROFILES.compatible.join(" ");

/**
 * Atributo `allow` del iframe. Concede capacidades benignas de reproducción.
 * Todo lo demás (cámara, micrófono, geolocalización, portapapeles, pago…) queda
 * denegado por omisión dentro del frame y, además, por la `Permissions-Policy`
 * del documento (defensa en profundidad).
 */
export const EMBED_ALLOW = "autoplay; fullscreen; picture-in-picture; encrypted-media";

export const EMBED_REFERRER_POLICY = "no-referrer" as const;

// ── Timeouts de carga / fallback ─────────────────────────────────────────────
/** Sonda de alcanzabilidad del servidor del embed (no-cors) antes de framar. */
export const EMBED_PROBE_TIMEOUT_MS = 7_000;
/** Vigía: si el iframe no dispara `onLoad`, se salta a la siguiente fuente. */
export const EMBED_LOAD_TIMEOUT_MS = 12_000;

/**
 * `Permissions-Policy` a nivel de documento. Deniega (`=()`) las capacidades
 * sensibles para TODOS (documento e iframes por igual) — así ningún embed puede
 * pedirlas aunque su propio `allow` lo intente. Concede (`=*`) solo autoplay,
 * pantalla completa y picture-in-picture (los tres que sí queremos), más
 * `encrypted-media` para no romper reproductores con DRM legítimos.
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

// ── Configuración de seguridad por proveedor ─────────────────────────────────
/**
 * Campos de seguridad que acompañan a cada proveedor de embed. Se persisten en
 * `providers.public_config.security` (JSONB) — sin migración, coherente con cómo
 * el proyecto ya guarda la config de `pattern-embed`.
 */
export interface ProviderSecurity {
  embed_security_level: EmbedSecurityLevel;
  /** El proveedor necesita `allow-same-origin` (cookies/almacenamiento propio). */
  requires_same_origin: boolean;
  popup_risk: RiskLevel;
  redirect_risk: RiskLevel;
  /** ¿Puede correr bajo nuestras reglas de sandbox sin exigir popups/top-nav? */
  sandbox_compatible: boolean;
  last_security_test_at: string | null;
}

const RISKS: readonly RiskLevel[] = ["low", "medium", "high"];
const LEVELS: readonly EmbedSecurityLevel[] = ["strict", "compatible", "external-only"];

function asLevel(v: unknown, fallback: EmbedSecurityLevel): EmbedSecurityLevel {
  return LEVELS.includes(v as EmbedSecurityLevel) ? (v as EmbedSecurityLevel) : fallback;
}
function asRisk(v: unknown, fallback: RiskLevel): RiskLevel {
  return RISKS.includes(v as RiskLevel) ? (v as RiskLevel) : fallback;
}

/**
 * Lee la config de seguridad desde `public_config`. Default = `compatible`:
 * conserva el origen del embed (necesario para que sus recursos no fallen con
 * «Origin null» de CORS). Sigue sin conceder popups/top-nav/downloads. El admin
 * baja a `strict` para casos que no necesiten same-origin, o `external-only`.
 */
export function readProviderSecurity(
  publicConfig: Record<string, unknown> | null | undefined,
): ProviderSecurity {
  const raw = (publicConfig?.security ?? {}) as Record<string, unknown>;
  return {
    embed_security_level: asLevel(raw.embed_security_level, "compatible"),
    requires_same_origin: raw.requires_same_origin === true,
    popup_risk: asRisk(raw.popup_risk, "medium"),
    redirect_risk: asRisk(raw.redirect_risk, "medium"),
    sandbox_compatible: raw.sandbox_compatible !== false, // default true
    last_security_test_at:
      typeof raw.last_security_test_at === "string" ? raw.last_security_test_at : null,
  };
}

// ── Generación del sandbox final ─────────────────────────────────────────────
/**
 * Filtra cualquier token prohibido. Es una barrera defensiva: aunque un perfil
 * o una config manipulada intente incluir `allow-popups` u otro, aquí se cae.
 */
export function enforceSandboxTokens(tokens: readonly string[]): {
  tokens: string[];
  rejected: string[];
} {
  const forbidden = new Set<string>(FORBIDDEN_SANDBOX_TOKENS);
  const kept: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const tok = t.trim();
    if (!tok || seen.has(tok)) continue;
    seen.add(tok);
    if (forbidden.has(tok)) rejected.push(tok);
    else kept.push(tok);
  }
  return { tokens: kept, rejected };
}

export interface SandboxPlan {
  /** Perfil EFECTIVO tras aplicar reglas (puede diferir del solicitado). */
  level: EmbedSecurityLevel;
  /** `iframe` = se enmarca con sandbox; `external` = solo apertura externa. */
  renderMode: "iframe" | "external";
  /** Valor final del atributo `sandbox`; `null` cuando es apertura externa. */
  sandbox: string | null;
  allow: string;
  referrerPolicy: typeof EMBED_REFERRER_POLICY;
  tokens: string[];
  /** Tokens prohibidos que se intentaron y se descartaron (auditoría). */
  rejected: string[];
  /** true si el proveedor no puede ir dentro de un iframe con estas reglas. */
  incompatible: boolean;
  reason?: string;
}

/**
 * Construye el `sandbox`/`allow` finales para un proveedor. Es la única fuente
 * de verdad de cómo se enmarca un embed.
 *
 * Reglas:
 *  · `requires_same_origin` sube `strict` → `compatible` (sin same-origin fallaría).
 *  · `sandbox_compatible === false` o nivel `external-only` ⇒ NO iframe: se marca
 *    incompatible y se ofrece como apertura externa. La seguridad global no se
 *    toca; el resolver probará la siguiente fuente.
 */
export function buildSandbox(security: ProviderSecurity): SandboxPlan {
  let level = security.embed_security_level;

  // El perfil `strict` no concede same-origin; si el proveedor lo necesita,
  // subimos al mínimo viable (`compatible`) en lugar de romperlo.
  if (level === "strict" && security.requires_same_origin) level = "compatible";

  const incompatible = !security.sandbox_compatible || level === "external-only";
  if (incompatible) {
    return {
      level: "external-only",
      renderMode: "external",
      sandbox: null,
      allow: EMBED_ALLOW,
      referrerPolicy: EMBED_REFERRER_POLICY,
      tokens: [],
      rejected: [],
      incompatible: true,
      reason: !security.sandbox_compatible
        ? "Proveedor incompatible con el sandbox (exige popups o navegación superior)."
        : "Proveedor configurado como solo-externo.",
    };
  }

  const base = SANDBOX_PROFILES[level as "strict" | "compatible"];
  const { tokens, rejected } = enforceSandboxTokens(base);
  return {
    level,
    renderMode: "iframe",
    sandbox: tokens.join(" "),
    allow: EMBED_ALLOW,
    referrerPolicy: EMBED_REFERRER_POLICY,
    tokens,
    rejected,
    incompatible: false,
  };
}

/** Atajo: plan a partir del `public_config` de un proveedor. */
export function planFromConfig(
  publicConfig: Record<string, unknown> | null | undefined,
): SandboxPlan {
  return buildSandbox(readProviderSecurity(publicConfig));
}

// ── Evaluación de seguridad (prueba estática, sin red) ───────────────────────
export interface SecurityAssessment {
  sandboxCompatible: boolean;
  recommendedLevel: EmbedSecurityLevel;
  warnings: string[];
}

/**
 * Evalúa la config declarada y recomienda un nivel. Un riesgo ALTO de popup o de
 * redirección implica que el proveedor depende de capacidades que NUNCA
 * concedemos (popups / top-navigation) → se declara incompatible (solo-externo).
 * No hace red: es una comprobación determinista sobre la config.
 */
export function assessProvider(security: ProviderSecurity): SecurityAssessment {
  const warnings: string[] = [];
  let sandboxCompatible = security.sandbox_compatible;

  if (security.popup_risk === "high") {
    warnings.push("Riesgo de popup alto: podría depender de allow-popups (no se concede).");
    sandboxCompatible = false;
  }
  if (security.redirect_risk === "high") {
    warnings.push(
      "Riesgo de redirección alto: podría intentar navegar la ventana principal (no se concede).",
    );
    sandboxCompatible = false;
  }

  let recommendedLevel: EmbedSecurityLevel;
  if (!sandboxCompatible) recommendedLevel = "external-only";
  else if (security.requires_same_origin) recommendedLevel = "compatible";
  else recommendedLevel = security.embed_security_level === "external-only"
    ? "strict"
    : security.embed_security_level;

  return { sandboxCompatible, recommendedLevel, warnings };
}
