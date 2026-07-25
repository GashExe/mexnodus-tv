import { describe, it, expect } from "vitest";
import {
  deriveOrigin,
  collectOrigins,
  readExtraFrameOrigins,
  type ProviderOriginRow,
} from "./frame-origins";

describe("deriveOrigin: origen EXACTO", () => {
  it("deriva el origen de un patrón movie_pattern completo", () => {
    expect(deriveOrigin("https://player.videasy.net/movie/{tmdb}")).toBe("https://player.videasy.net");
  });

  it("añade https:// a un dominio sin esquema", () => {
    expect(deriveOrigin("mexnodus.com")).toBe("https://mexnodus.com");
  });

  it("respeta puerto y subdominio, descarta path/query", () => {
    expect(deriveOrigin("https://cdn.ej.com:8443/tv/{tmdb}/{season}/{episode}?x=1")).toBe(
      "https://cdn.ej.com:8443",
    );
  });

  it("no cambia el esquema http explícito", () => {
    expect(deriveOrigin("http://local.test/movie/{tmdb}")).toBe("http://local.test");
  });

  it("valores vacíos o inválidos → null", () => {
    expect(deriveOrigin(null)).toBeNull();
    expect(deriveOrigin(undefined)).toBeNull();
    expect(deriveOrigin("")).toBeNull();
    expect(deriveOrigin("::not a url::")).toBeNull();
  });
});

describe("collectOrigins: reúne y deduplica", () => {
  const rows: ProviderOriginRow[] = [
    {
      domain: "player.videasy.net",
      public_config: {
        movie_pattern: "https://player.videasy.net/movie/{tmdb}",
        series_pattern: "https://player.videasy.net/tv/{tmdb}/{season}/{episode}",
      },
    },
    { domain: null, public_config: { movie_pattern: "https://vixsrc.to/movie/{tmdb}" } },
    { domain: "mexnodus.com", public_config: null },
  ];

  it("incluye el origen exacto de cada proveedor y deduplica el repetido", () => {
    const origins = collectOrigins(rows);
    expect(origins).toContain("https://player.videasy.net");
    expect(origins).toContain("https://vixsrc.to");
    expect(origins).toContain("https://mexnodus.com");
    // videasy aparece en domain + 2 patrones → un solo origen.
    expect(origins.filter((o) => o === "https://player.videasy.net")).toHaveLength(1);
  });

  it("un proveedor con solo movie_pattern SÍ aporta su origen (aparece en frame-src)", () => {
    const origins = collectOrigins([{ domain: null, public_config: { movie_pattern: "https://nuevo.example/movie/{tmdb}" } }]);
    expect(origins).toEqual(["https://nuevo.example"]);
  });

  it("proveedores sin datos válidos → sin orígenes", () => {
    expect(collectOrigins([{ domain: null, public_config: null }])).toEqual([]);
  });
});

describe("extra_frame_origins: destinos de redirección del proveedor", () => {
  it("normaliza array, cadena con comas y cadena con espacios", () => {
    expect(readExtraFrameOrigins({ extra_frame_origins: ["a.com", " b.com "] })).toEqual(["a.com", "b.com"]);
    expect(readExtraFrameOrigins({ extra_frame_origins: "a.com, b.com" })).toEqual(["a.com", "b.com"]);
    expect(readExtraFrameOrigins({ extra_frame_origins: "a.com\nb.com" })).toEqual(["a.com", "b.com"]);
  });

  it("ausente, vacío o de tipo inesperado → lista vacía", () => {
    expect(readExtraFrameOrigins(null)).toEqual([]);
    expect(readExtraFrameOrigins({})).toEqual([]);
    expect(readExtraFrameOrigins({ extra_frame_origins: "" })).toEqual([]);
    expect(readExtraFrameOrigins({ extra_frame_origins: 42 })).toEqual([]);
  });

  it("el destino del 302 entra en frame-src junto al origen del patrón", () => {
    // Caso real: embedmaster.link responde 302 → embdmstrplayer.com.
    const origins = collectOrigins([
      {
        domain: "embedmaster.link",
        public_config: {
          movie_pattern: "https://embedmaster.link/KEY/movie/{tmdb}",
          extra_frame_origins: ["embdmstrplayer.com"],
        },
      },
    ]);
    expect(origins).toContain("https://embedmaster.link");
    expect(origins).toContain("https://embdmstrplayer.com");
  });
});
