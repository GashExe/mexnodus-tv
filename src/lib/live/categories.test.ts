import { describe, it, expect } from "vitest";
import { normalizeCategory, normalizeCategories } from "./categories";

describe("normalizeCategory", () => {
  it("unifica duplicados por mayúsculas (Movies/MOVIES → Cine)", () => {
    expect(normalizeCategory("Movies")).toBe("Cine");
    expect(normalizeCategory("MOVIES")).toBe("Cine");
    expect(normalizeCategory("movies")).toBe("Cine");
  });

  it("quita prefijos de proveedor y emojis (XUMO🇺🇸: Comedy → Comedia)", () => {
    expect(normalizeCategory("XUMO🇺🇸: Comedy")).toBe("Comedia");
    expect(normalizeCategory("XUMO🇺🇸: Westerns & Country")).toBe("Clásicos");
  });

  it("unifica sinónimos (Game Show/Game Shows/GAME SHOWS → Concursos)", () => {
    expect(normalizeCategory("Game Show")).toBe("Concursos");
    expect(normalizeCategory("Game Shows")).toBe("Concursos");
    expect(normalizeCategory("GAME SHOWS")).toBe("Concursos");
  });

  it("traduce al español", () => {
    expect(normalizeCategory("News")).toBe("Noticias");
    expect(normalizeCategory("Sports")).toBe("Deportes");
    expect(normalizeCategory("Kids")).toBe("Infantil");
    expect(normalizeCategory("Cooking")).toBe("Cocina");
  });

  it("descarta lo desconocido y el relleno", () => {
    expect(normalizeCategory("FEATURED")).toBe("General");
    expect(normalizeCategory("Undefined")).toBe("General");
    expect(normalizeCategory("Cosa Rarísima Inventada")).toBeNull();
  });
});

describe("normalizeCategories", () => {
  it("mapea, deduplica y omite General si hay otras", () => {
    expect(normalizeCategories(["Movies", "MOVIES", "XUMO🇺🇸: Movies", "News"]))
      .toEqual(["Cine", "Noticias"]);
  });

  it("garantiza al menos General", () => {
    expect(normalizeCategories([])).toEqual(["General"]);
    expect(normalizeCategories(["tv", "Uncategorized"])).toEqual(["General"]);
    expect(normalizeCategories(null)).toEqual(["General"]);
  });

  it("no mete ruido desconocido", () => {
    expect(normalizeCategories(["Ruido Raro", "Sports"])).toEqual(["Deportes"]);
  });
});
