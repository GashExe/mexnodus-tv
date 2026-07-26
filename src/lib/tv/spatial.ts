/**
 * Navegación espacial para D-pad (Fire TV)
 * =======================================
 * El WebView de Chromium NO mueve el foco con las flechas: `Tab` sigue el orden
 * del documento y las flechas no hacen nada (salvo dentro de un `<select>` o un
 * `<input type=range>`). En una tele eso es inservible — el usuario solo tiene
 * arriba/abajo/izquierda/derecha, así que hay que decidir a mano qué elemento
 * está "a la derecha" de otro.
 *
 * Este módulo hace SOLO la geometría: recibe rectángulos y devuelve el índice
 * del vecino elegido. No toca el DOM, no busca elementos, no llama a `focus()`.
 * Igual que `src/lib/fullscreen.ts`, así se testea con vitest en node sin
 * navegador. La cáscara que lee el DOM es `src/components/tv/SpatialNav.tsx`.
 */

export type Direction = "up" | "down" | "left" | "right";

/** Subconjunto de `DOMRect` que necesitamos. Un `DOMRect` real encaja tal cual. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Cuánto pesa la desalineación en el eje perpendicular frente a la distancia en
 * el eje del movimiento. Con 3, irse 10px de fila cuesta lo mismo que estar
 * 30px más lejos — así en una cuadrícula bajar desde la columna 0 cae en la
 * columna 0 de la fila siguiente, no en la 1, aunque ambas estén a la misma
 * distancia vertical.
 */
const CROSS_AXIS_PENALTY = 3;

/**
 * Tolerancia al solape en el eje del movimiento. Sin ella, dos elementos que se
 * solapan 1px por redondeo de subpíxel dejan de ser vecinos.
 */
const LEAD_TOLERANCE = 2;

/** Solape de dos segmentos. Negativo = hay hueco, y su valor es el tamaño del hueco. */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/**
 * ¿`candidate` está en la dirección pedida respecto a `active`?
 *
 * El criterio es el borde de ataque: para ir a la derecha, el borde izquierdo
 * del candidato tiene que empezar donde acaba el derecho del activo. Comparar
 * centros en su lugar elegiría elementos que se solapan a medias, y en una
 * cuadrícula eso hace que "derecha" salte de fila.
 */
function isAhead(active: Rect, candidate: Rect, direction: Direction): boolean {
  switch (direction) {
    case "right":
      return candidate.left >= active.right - LEAD_TOLERANCE;
    case "left":
      return candidate.right <= active.left + LEAD_TOLERANCE;
    case "down":
      return candidate.top >= active.bottom - LEAD_TOLERANCE;
    case "up":
      return candidate.bottom <= active.top + LEAD_TOLERANCE;
  }
}

/** Distancia en el eje del movimiento entre los bordes que se miran. */
function axisGap(active: Rect, candidate: Rect, direction: Direction): number {
  switch (direction) {
    case "right":
      return candidate.left - active.right;
    case "left":
      return active.left - candidate.right;
    case "down":
      return candidate.top - active.bottom;
    case "up":
      return active.top - candidate.bottom;
  }
}

/**
 * Hueco en el eje perpendicular. 0 si las proyecciones se solapan — es decir, si
 * están en la misma fila (movimiento horizontal) o en la misma columna (vertical).
 */
function crossGap(active: Rect, candidate: Rect, direction: Direction): number {
  const horizontal = direction === "left" || direction === "right";
  const o = horizontal
    ? overlap(active.top, active.bottom, candidate.top, candidate.bottom)
    : overlap(active.left, active.right, candidate.left, candidate.right);
  return Math.max(0, -o);
}

/**
 * Elige el vecino de `rects[activeIndex]` en la dirección dada, o `null` si no
 * hay nada en esa dirección (el borde de la pantalla: la tecla no hace nada, que
 * es lo correcto — envolver el foco de la última columna a la primera fila
 * desorienta).
 *
 * Los rectángulos fuera del viewport son candidatos válidos a propósito: en un
 * carrusel con `overflow-x` las tarjetas que aún no se ven tienen rectángulo
 * real a la derecha, así que "derecha" las encuentra y quien llama las trae con
 * `scrollIntoView`. Eso es lo que hace scrollear el carrusel.
 */
export function pickNeighbor(
  rects: Rect[],
  activeIndex: number,
  direction: Direction,
): number | null {
  const active = rects[activeIndex];
  if (!active) return null;

  let best: number | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < rects.length; i++) {
    if (i === activeIndex) continue;
    const candidate = rects[i];
    if (!isAhead(active, candidate, direction)) continue;

    // Un candidato solapado da hueco negativo; cuenta como 0 para no premiarlo
    // por estar "más cerca que pegado".
    const primary = Math.max(0, axisGap(active, candidate, direction));
    const score = primary + CROSS_AXIS_PENALTY * crossGap(active, candidate, direction);

    // Empate → gana el primero en orden de documento, para que el recorrido sea
    // reproducible.
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

/** Traduce un `KeyboardEvent.key` a dirección, o `null` si no es una flecha. */
export function directionFromKey(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}
