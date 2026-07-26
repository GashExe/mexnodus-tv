import { describe, it, expect } from "vitest";
import { pickNeighbor, directionFromKey, type Rect } from "./spatial";

/** Rectángulo por origen + tamaño, que es como se piensa un layout. */
const at = (left: number, top: number, w: number, h: number): Rect => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

/**
 * Cuadrícula de 4 columnas, tarjetas de 300×450 con 20px de separación — la
 * forma real de `TvGrid`. Índices en orden de documento:
 *   0 1 2 3
 *   4 5 6 7
 */
const grid = (): Rect[] => {
  const out: Rect[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      out.push(at(col * 320, row * 470, 300, 450));
    }
  }
  return out;
};

describe("pickNeighbor: cuadrícula", () => {
  it("derecha avanza una columna", () => {
    expect(pickNeighbor(grid(), 0, "right")).toBe(1);
    expect(pickNeighbor(grid(), 1, "right")).toBe(2);
  });

  it("izquierda retrocede una columna", () => {
    expect(pickNeighbor(grid(), 2, "left")).toBe(1);
  });

  it("abajo cae en la MISMA columna, no en la diagonal", () => {
    // 4, 5, 6 y 7 están todos a la misma distancia vertical de 0; solo 4
    // comparte columna. Es el caso que justifica CROSS_AXIS_PENALTY.
    expect(pickNeighbor(grid(), 0, "down")).toBe(4);
    expect(pickNeighbor(grid(), 2, "down")).toBe(6);
  });

  it("arriba vuelve a la misma columna", () => {
    expect(pickNeighbor(grid(), 6, "up")).toBe(2);
  });

  it("no envuelve el foco en los bordes", () => {
    expect(pickNeighbor(grid(), 3, "right")).toBeNull();
    expect(pickNeighbor(grid(), 0, "left")).toBeNull();
    expect(pickNeighbor(grid(), 0, "up")).toBeNull();
    expect(pickNeighbor(grid(), 7, "down")).toBeNull();
  });
});

describe("pickNeighbor: carrusel con tarjetas fuera del viewport", () => {
  // Cinco tarjetas de 300px; a 1920 de ancho solo se ven las tres primeras.
  const row = [at(0, 0, 300, 450), at(320, 0, 300, 450), at(640, 0, 300, 450), at(1960, 0, 300, 450), at(2280, 0, 300, 450)];

  it("encuentra la tarjeta que aún no se ve, para que quien llama la scrollee", () => {
    expect(pickNeighbor(row, 2, "right")).toBe(3);
    expect(pickNeighbor(row, 3, "right")).toBe(4);
  });
});

describe("pickNeighbor: nav lateral hacia la cuadrícula", () => {
  // Barra lateral de 240px con 3 destinos apilados, y la cuadrícula a su derecha.
  const sidebar = [at(0, 100, 240, 56), at(0, 172, 240, 56), at(0, 244, 240, 56)];
  const cards = [at(288, 80, 300, 450), at(608, 80, 300, 450), at(288, 550, 300, 450)];
  const layout = [...sidebar, ...cards];

  it("derecha desde la nav entra por la tarjeta más cercana de la fila alineada", () => {
    // El destino 0 (y 100-156) solapa verticalmente con la primera fila de
    // tarjetas (y 80-530), así que gana la más a la izquierda: índice 3.
    expect(pickNeighbor(layout, 0, "right")).toBe(3);
  });

  it("izquierda desde una tarjeta vuelve a la nav", () => {
    expect(pickNeighbor(layout, 3, "left")).toBe(0);
  });

  it("abajo dentro de la nav recorre los destinos en orden", () => {
    expect(pickNeighbor(layout, 0, "down")).toBe(1);
    expect(pickNeighbor(layout, 1, "down")).toBe(2);
  });
});

describe("pickNeighbor: barra de controles del player", () => {
  // Botones de 40px pegados, como la barra de EN VIVO.
  const bar = [at(16, 900, 40, 40), at(64, 900, 40, 40), at(112, 900, 40, 40)];
  const timeline = [at(16, 860, 1888, 24)];
  const layout = [...timeline, ...bar];

  it("la barra de tiempo está arriba de los botones", () => {
    expect(pickNeighbor(layout, 1, "up")).toBe(0);
  });

  it("desde la barra de tiempo, abajo entra al primer botón", () => {
    // Los tres botones solapan horizontalmente con la barra completa, así que
    // decide la distancia: los tres están a la misma, gana el orden de documento.
    expect(pickNeighbor(layout, 0, "down")).toBe(1);
  });

  it("izquierda y derecha recorren los botones", () => {
    expect(pickNeighbor(layout, 1, "right")).toBe(2);
    expect(pickNeighbor(layout, 3, "left")).toBe(2);
  });
});

describe("pickNeighbor: casos límite", () => {
  it("índice activo inexistente devuelve null", () => {
    expect(pickNeighbor(grid(), 99, "down")).toBeNull();
  });

  it("un único elemento no tiene vecinos", () => {
    expect(pickNeighbor([at(0, 0, 100, 100)], 0, "right")).toBeNull();
  });

  it("tolera el solape de subpíxel entre elementos contiguos", () => {
    // El segundo empieza 1px antes de que acabe el primero (redondeo de layout).
    const pair = [at(0, 0, 100, 40), at(99, 0, 100, 40)];
    expect(pickNeighbor(pair, 0, "right")).toBe(1);
  });
});

describe("directionFromKey", () => {
  it("traduce las cuatro flechas", () => {
    expect(directionFromKey("ArrowUp")).toBe("up");
    expect(directionFromKey("ArrowDown")).toBe("down");
    expect(directionFromKey("ArrowLeft")).toBe("left");
    expect(directionFromKey("ArrowRight")).toBe("right");
  });

  it("ignora cualquier otra tecla", () => {
    expect(directionFromKey("Enter")).toBeNull();
    expect(directionFromKey("a")).toBeNull();
  });
});
