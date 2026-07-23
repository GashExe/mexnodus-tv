/**
 * Guardia anti-SSRF para toda petición a URLs externas (probes, import M3U,
 * validaciones ligeras). Bloquea localhost y redes privadas, exige http(s),
 * limita tamaño/tiempo y controla redirecciones manualmente.
 *
 * Regla de producto explícita: "una URL técnicamente accesible" NO se considera
 * autorizada por sí misma. Esta guardia solo decide si es SEGURO tocarla; la
 * AUTORIZACIÓN es un estado aparte que gestiona el panel de revisión.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254", // metadata de nube
]);

function ipToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

/** ¿La IPv4 pertenece a un rango privado/reservado? */
function isPrivateIPv4(ip: string): boolean {
  const n = ipToLong(ip);
  if (n === null) return true; // ante la duda, bloquear
  const inRange = (a: string, bits: number) => {
    const base = ipToLong(a)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (base & mask);
  };
  return (
    inRange("10.0.0.0", 8) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.168.0.0", 16) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("100.64.0.0", 10) || // CGNAT
    inRange("0.0.0.0", 8)
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") || // ULA
    h.startsWith("fe80") || // link-local
    h.startsWith("::ffff:") // IPv4-mapped
  );
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
  url?: URL;
}

/** Valida una URL externa antes de tocarla. */
export function assertSafeUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Protocolo no permitido: ${url.protocol}` };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "Host bloqueado (localhost/metadata)" };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIPv4(host)) {
    return { ok: false, reason: "IP privada/reservada bloqueada" };
  }
  if (host.includes(":") && isPrivateIPv6(host)) {
    return { ok: false, reason: "IPv6 privada bloqueada" };
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "TLD interno bloqueado" };
  }
  return { ok: true, url };
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

/**
 * fetch endurecido: valida URL, aplica timeout, no sigue redirecciones
 * automáticamente (las revalida una a una), y trunca el cuerpo por tamaño.
 * NUNCA desactiva TLS.
 */
export async function safeFetch(
  raw: string,
  opts: SafeFetchOptions = {},
): Promise<{ status: number; body: string; finalUrl: string; contentType: string }> {
  const { method = "GET", timeoutMs = 8000, maxBytes = 5 * 1024 * 1024, headers = {} } = opts;
  let current = raw;

  for (let redirect = 0; redirect <= 3; redirect++) {
    const check = assertSafeUrl(current);
    if (!check.ok) throw new Error(`SSRF bloqueado: ${check.reason}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "MexNodusTV/0.1 (+probe)", ...headers },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("Redirección sin destino");
        current = new URL(loc, current).toString();
        continue; // se revalida en la siguiente iteración
      }

      const contentType = res.headers.get("content-type") ?? "";
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > maxBytes) throw new Error("Respuesta demasiado grande");

      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      if (reader && method === "GET") {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) {
            controller.abort();
            throw new Error("Respuesta excede el límite de tamaño");
          }
          chunks.push(value);
        }
      }
      const body = new TextDecoder().decode(concat(chunks));
      return { status: res.status, body, finalUrl: current, contentType };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Demasiadas redirecciones");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
