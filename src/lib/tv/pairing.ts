/**
 * Emparejamiento de la tele por código
 * ====================================
 * Lógica pura (alfabeto, generación, normalización, caducidad). El acceso a base
 * de datos vive en los route handlers; aquí no se importa Supabase para poder
 * testear todo esto en node, igual que `engine.ts` o `spatial.ts`.
 *
 * El modelo de amenaza está documentado en `supabase/migrations/0014_tv_pairing.sql`:
 * el CÓDIGO reclama (se ve en pantalla), el SECRETO recoge (solo lo sabe la tele).
 */

/**
 * Sin `I`, `L`, `O`, `0` ni `1`: son los pares que la gente confunde leyendo una
 * pantalla a tres metros y tecleando en un móvil.
 */
export const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 6;

/** Cinco minutos. Suficiente para sacar el móvil, corto para que no se acumule. */
export const PAIRING_TTL_MS = 5 * 60 * 1000;

/** Cada cuánto sondea la tele. 2s da sensación de inmediatez sin castigar al Stick. */
export const POLL_INTERVAL_MS = 2000;

/** Longitud en bytes del secreto del dispositivo (se sirve en hex, así que el doble de caracteres). */
const SECRET_BYTES = 32;

/** Fuente de aleatoriedad: `crypto` global, disponible en Node 20+ y en el Edge runtime. */
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/**
 * Código legible de 6 caracteres.
 *
 * Se descartan los bytes que caen en el resto sobrante de la división en vez de
 * usar `% alfabeto`: el módulo a secas sesga las primeras letras del alfabeto, y
 * aunque aquí el sesgo sería pequeño, un código adivinable es exactamente lo que
 * no queremos.
 */
export function generateCode(): string {
  const n = PAIRING_ALPHABET.length;
  const limit = Math.floor(256 / n) * n;
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      out += PAIRING_ALPHABET[byte % n];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/** Secreto opaco del dispositivo, en hex. */
export function generateDeviceSecret(): string {
  return Array.from(randomBytes(SECRET_BYTES), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normaliza lo que el usuario teclea: mayúsculas y fuera todo lo que no sea
 * alfanumérico, para que "abc-123" y "ABC 123" lleguen igual.
 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** ¿El código tiene la forma correcta? Se comprueba antes de tocar la base de datos. */
export function isValidCodeShape(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((c) => PAIRING_ALPHABET.includes(c));
}

export interface PairingRow {
  expires_at: string;
  consumed_at: string | null;
  claimed_by: string | null;
}

/** Un emparejamiento sirve mientras no haya caducado ni se haya usado ya. */
export function isPairingUsable(row: PairingRow, now: Date = new Date()): boolean {
  if (row.consumed_at) return false;
  return new Date(row.expires_at).getTime() > now.getTime();
}

/** Estado que ve la tele en cada sondeo. */
export type PairingState = "pending" | "claimed" | "expired";

export function pairingState(row: PairingRow, now: Date = new Date()): PairingState {
  if (!isPairingUsable(row, now)) return "expired";
  return row.claimed_by ? "claimed" : "pending";
}
