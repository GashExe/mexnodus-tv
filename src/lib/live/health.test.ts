import { describe, it, expect } from "vitest";
import {
  classifyProbe,
  corsAllows,
  isValidHlsManifest,
  nextTechStatus,
  planChannelActivation,
  planDedup,
  planPruning,
  planStreamRanking,
  shouldAbortMutations,
  PRUNE_AFTER_DAYS,
  type HealthStream,
} from "./health";
import type { TechStatus } from "@/lib/types/db";

const ORIGIN = "https://www.mxndustv.xyz";
const MANIFEST = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=408192\nchunk.m3u8";

const st = (over: Partial<HealthStream> & { id: string }): HealthStream => ({
  channel_id: "c1",
  play_url: `https://ej.com/${over.id}.m3u8`,
  priority: 0,
  is_primary: false,
  tech_status: "unknown" as TechStatus,
  last_checked_at: null,
  ...over,
});

describe("isValidHlsManifest: solo cuenta un manifiesto de verdad", () => {
  it("acepta master playlist (#EXT-X-STREAM-INF) y media playlist (#EXTINF)", () => {
    expect(isValidHlsManifest(MANIFEST)).toBe(true);
    expect(isValidHlsManifest("#EXTM3U\n#EXTINF:10,\nseg1.ts")).toBe(true);
  });

  it("rechaza una página HTML que responde 200 (portal cautivo, error maquillado)", () => {
    expect(isValidHlsManifest("<!doctype html><html>Not found</html>")).toBe(false);
  });

  it("rechaza un #EXTM3U vacío, sin variantes ni segmentos", () => {
    expect(isValidHlsManifest("#EXTM3U\n")).toBe(false);
    expect(isValidHlsManifest(undefined)).toBe(false);
  });
});

describe("corsAllows: hls.js necesita la cabecera para poder leer", () => {
  it("acepta comodín y el origen exacto (caso Las Estrellas)", () => {
    expect(corsAllows("*", ORIGIN)).toBe(true);
    expect(corsAllows(ORIGIN, ORIGIN)).toBe(true);
  });

  it("rechaza otro origen y la ausencia de cabecera", () => {
    expect(corsAllows("https://otro.com", ORIGIN)).toBe(false);
    expect(corsAllows(null, ORIGIN)).toBe(false);
    expect(corsAllows(undefined, ORIGIN)).toBe(false);
  });
});

describe("classifyProbe: tres cubos, no dos", () => {
  it("200 + manifiesto + CORS correcto → ok", () => {
    expect(
      classifyProbe({ status: 200, body: MANIFEST, accessControlAllowOrigin: "*", origin: ORIGIN }),
    ).toBe("ok");
  });

  it("un 403 es SOSPECHOSO, no muerte: puede ser geobloqueo desde el datacenter", () => {
    expect(classifyProbe({ status: 403 })).toBe("suspect");
  });

  it("429, 451 y 5xx también son sospechosos (límite o caída pasajera)", () => {
    expect(classifyProbe({ status: 429 })).toBe("suspect");
    expect(classifyProbe({ status: 451 })).toBe("suspect");
    expect(classifyProbe({ status: 503 })).toBe("suspect");
  });

  it("404/410/400 son muerte confirmada", () => {
    expect(classifyProbe({ status: 404 })).toBe("dead");
    expect(classifyProbe({ status: 410 })).toBe("dead");
    expect(classifyProbe({ status: 400 })).toBe("dead");
  });

  it("errores de TLS son muerte: el navegador rechaza esos certificados igual", () => {
    expect(classifyProbe({ networkError: "ERR_TLS_CERT_ALTNAME_INVALID" })).toBe("dead");
    expect(classifyProbe({ networkError: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" })).toBe("dead");
  });

  it("dominio inexistente o conexión rechazada → muerte", () => {
    expect(classifyProbe({ networkError: "ENOTFOUND" })).toBe("dead");
    expect(classifyProbe({ networkError: "ECONNREFUSED" })).toBe("dead");
  });

  it("un timeout es sospechoso, no muerte", () => {
    expect(classifyProbe({ networkError: "AbortError" })).toBe("suspect");
  });

  it("200 con HTML en vez de manifiesto → muerte", () => {
    expect(
      classifyProbe({ status: 200, body: "<html>404</html>", accessControlAllowOrigin: "*", origin: ORIGIN }),
    ).toBe("dead");
  });

  it("200 con manifiesto válido pero SIN CORS → muerte (inservible en navegador)", () => {
    expect(classifyProbe({ status: 200, body: MANIFEST, accessControlAllowOrigin: null, origin: ORIGIN })).toBe(
      "dead",
    );
  });
});

describe("nextTechStatus: hacen falta dos golpes para dar por muerta", () => {
  it("el primer fallo duro solo degrada; el segundo confirma", () => {
    expect(nextTechStatus("online", "dead")).toBe("degraded");
    expect(nextTechStatus("unknown", "dead")).toBe("degraded");
    expect(nextTechStatus("degraded", "dead")).toBe("offline");
    expect(nextTechStatus("offline", "dead")).toBe("offline");
  });

  it("un sospechoso NUNCA llega a offline, por muchas veces que se repita", () => {
    expect(nextTechStatus("degraded", "suspect")).toBe("degraded");
    expect(nextTechStatus("offline", "suspect")).toBe("degraded");
  });

  it("una sonda correcta rehabilita la señal de inmediato", () => {
    expect(nextTechStatus("offline", "ok")).toBe("online");
  });
});

describe("planStreamRanking: la señal viva pasa a primaria", () => {
  it("promueve la viva y hunde la muerta aunque la muerta fuese la primaria", () => {
    const changes = planStreamRanking([
      st({ id: "a", tech_status: "offline", priority: 10, is_primary: true }),
      st({ id: "b", tech_status: "online", priority: 0 }),
    ]);
    const b = changes.find((c) => c.id === "b");
    const a = changes.find((c) => c.id === "a");
    expect(b?.is_primary).toBe(true);
    expect(a?.is_primary).toBe(false);
    expect(b!.priority).toBeGreaterThan(a!.priority);
  });

  it("deja EXACTAMENTE una primaria cuando había dos (bug real de Las Estrellas)", () => {
    const streams = [
      st({ id: "a", priority: 10, is_primary: true }),
      st({ id: "b", priority: 10, is_primary: true }),
    ];
    const changes = planStreamRanking(streams);
    const finales = streams.map((s) => changes.find((c) => c.id === s.id) ?? s);
    expect(finales.filter((s) => s.is_primary)).toHaveLength(1);
  });

  it("una señal sin comprobar se prefiere a una degradada", () => {
    const changes = planStreamRanking([
      st({ id: "a", tech_status: "degraded", priority: 10, is_primary: true }),
      st({ id: "b", tech_status: "unknown", priority: 0 }),
    ]);
    expect(changes.find((c) => c.id === "b")?.is_primary).toBe(true);
  });

  it("si ya está bien ordenado no propone ningún cambio", () => {
    const ya = planStreamRanking([st({ id: "a", tech_status: "online", priority: 100, is_primary: true })]);
    expect(ya).toEqual([]);
  });
});

describe("planChannelActivation: solo se retira lo que está del todo muerto", () => {
  it("con una sola señal viva el canal sigue publicado", () => {
    expect(
      planChannelActivation([
        st({ id: "a", tech_status: "offline" }),
        st({ id: "b", tech_status: "online" }),
      ]),
    ).toEqual({ is_active: true });
  });

  it("una señal solo degradada NO basta para retirar el canal", () => {
    expect(planChannelActivation([st({ id: "a", tech_status: "degraded" })])).toEqual({ is_active: true });
  });

  it("todas offline → se retira", () => {
    expect(
      planChannelActivation([
        st({ id: "a", tech_status: "offline" }),
        st({ id: "b", tech_status: "offline" }),
      ]),
    ).toEqual({ is_active: false });
  });
});

describe("planDedup: filas gemelas del mismo canal", () => {
  it("colapsa el duplicado exacto y conserva el primero (caso Las Estrellas)", () => {
    const url = "https://channel01-onlymex.akamaized.net/hls/live/2022749/event01/index.m3u8";
    expect(planDedup([st({ id: "a", play_url: url }), st({ id: "b", play_url: url })])).toEqual(["b"]);
  });

  it("no toca señales con URLs distintas", () => {
    expect(planDedup([st({ id: "a" }), st({ id: "b" })])).toEqual([]);
  });
});

describe("planPruning: limpiar sin dejar canales huérfanos", () => {
  const now = new Date("2026-07-25T00:00:00Z");
  const hace = (dias: number) => new Date(now.getTime() - dias * 86400000).toISOString();

  it("borra las muertas y rancias, no las muertas recientes", () => {
    const ids = planPruning(
      [
        st({ id: "viva", tech_status: "online" }),
        st({ id: "rancia", tech_status: "offline", last_checked_at: hace(PRUNE_AFTER_DAYS + 1) }),
        st({ id: "reciente", tech_status: "offline", last_checked_at: hace(1) }),
      ],
      now,
    );
    expect(ids).toEqual(["rancia"]);
  });

  it("NUNCA borra la última señal, aunque lleve muerta una eternidad", () => {
    expect(
      planPruning([st({ id: "sola", tech_status: "offline", last_checked_at: hace(400) })], now),
    ).toEqual([]);
  });

  it("si todas están muertas y rancias, conserva una", () => {
    const ids = planPruning(
      [
        st({ id: "a", tech_status: "offline", last_checked_at: hace(100) }),
        st({ id: "b", tech_status: "offline", last_checked_at: hace(100) }),
        st({ id: "c", tech_status: "offline", last_checked_at: hace(100) }),
      ],
      now,
    );
    expect(ids).toHaveLength(2);
  });
});

describe("shouldAbortMutations: cortacircuitos sobre muertes CONFIRMADAS", () => {
  it("una tasa de muerte normal deja actuar", () => {
    expect(shouldAbortMutations(1000, 220)).toBe(false); // 22%, como la muestra real
  });

  it("por encima del 40% se asume que el problema es el runner", () => {
    expect(shouldAbortMutations(1000, 401)).toBe(true);
  });

  it("muchos timeouts NO abortan: son suspect y no degradan nada", () => {
    // Caso medido en el catálogo real: 150 sondas → 22 dead, 81 suspect.
    // Contar los suspect abortaría siempre y no se promocionaría nunca la buena.
    expect(shouldAbortMutations(150, 22)).toBe(false);
  });

  it("sin nada sondeado no se muta nada", () => {
    expect(shouldAbortMutations(0, 0)).toBe(true);
  });
});
