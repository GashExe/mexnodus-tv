/**
 * Limitador de intentos en memoria.
 *
 * Protege el reclamo de códigos: 6 caracteres de un alfabeto de 31 son ~887
 * millones de combinaciones, pero sin límite un atacante podría barrer el
 * espacio de códigos VIVOS (los que haya en ese momento) a base de fuerza bruta.
 *
 * LIMITACIÓN CONOCIDA: la memoria es por instancia, así que en un despliegue
 * serverless con varias instancias el límite efectivo se multiplica por el
 * número de instancias. Sirve para frenar el barrido trivial, no para un
 * atacante distribuido; si eso llega a importar, esto se sustituye por un
 * contador en Postgres o Redis sin tocar a quien lo llama.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Se purga al vuelo para que el mapa no crezca sin control. */
function purge(now: number): void {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos hasta que se libere, para responder con `Retry-After`. */
  retryAfterSeconds: number;
}

/**
 * Consume un intento de `key`. Devuelve si se permite y cuánto falta para el
 * reinicio de la ventana.
 */
export function consumeAttempt(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  purge(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Solo para tests: vacía el estado entre casos. */
export function resetRateLimits(): void {
  buckets.clear();
}
