import { describe, it, expect } from "vitest";
import { selectPlayback, isPlayable, type Candidate } from "./engine";
import { DEFAULT_AUDIO_PRIORITY, DEFAULT_SUBTITLE_PRIORITY } from "@/lib/language";
import { DEFAULT_WEIGHTS, TV_WEIGHTS, type SelectionPreferences } from "./weights";

const prefs: SelectionPreferences = {
  audioPriority: DEFAULT_AUDIO_PRIORITY,
  subtitlePriority: DEFAULT_SUBTITLE_PRIORITY,
  maxResolution: 2160,
  preferHdr: false,
  country: "MX",
};

function base(overrides: Partial<Candidate>): Candidate {
  return {
    id: "a",
    provider_id: "p",
    playback_type: "hls",
    play_url: "https://example.com/x.m3u8",
    resolution_height: 1080,
    bitrate_kbps: 5000,
    fps: 30,
    video_codec: "h264",
    hdr: false,
    dolby_vision: false,
    audio_51: false,
    startup_ms: 1200,
    stability: 90,
    uptime_pct: 99,
    last_checked_at: new Date().toISOString(),
    review_status: "approved",
    publish_authorization: "authorized",
    region_restrictions: null,
    priority: 0,
    audio_languages: ["es-419"],
    subtitle_languages: ["es-419"],
    provider_trust: 80,
    ...overrides,
  };
}

describe("gate de autorización", () => {
  it("isPlayable exige approved + authorized", () => {
    expect(isPlayable({ review_status: "approved", publish_authorization: "authorized" })).toBe(true);
    expect(isPlayable({ review_status: "pending", publish_authorization: "authorized" })).toBe(false);
    expect(isPlayable({ review_status: "approved", publish_authorization: "unauthorized" })).toBe(false);
  });

  it("descarta no autorizadas aunque sean técnicamente superiores", () => {
    const cands = [
      base({ id: "unauth-4k", resolution_height: 2160, publish_authorization: "unauthorized" }),
      base({ id: "auth-720", resolution_height: 720 }),
    ];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary?.candidate.id).toBe("auth-720");
    expect(r.rejected.some((x) => x.candidate.id === "unauth-4k")).toBe(true);
  });
});

describe("preferencia de idioma sobre resolución", () => {
  it("NO elige 4K inestable en inglés sobre 1080p estable en español latino", () => {
    const cands = [
      base({ id: "en-4k", audio_languages: ["en"], subtitle_languages: ["en"], resolution_height: 2160, stability: 40, bitrate_kbps: 12000 }),
      base({ id: "lat-1080", audio_languages: ["es-MX"], resolution_height: 1080, stability: 95 }),
    ];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary?.candidate.id).toBe("lat-1080");
  });

  it("prefiere audio latino sobre castellano", () => {
    const cands = [
      base({ id: "cast", audio_languages: ["es-ES"] }),
      base({ id: "lat", audio_languages: ["es-419"] }),
    ];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary?.candidate.id).toBe("lat");
  });

  it("usa subtítulos en español cuando no hay audio en español", () => {
    const cands = [
      base({ id: "en-nosub", audio_languages: ["en"], subtitle_languages: ["en"] }),
      base({ id: "en-essub", audio_languages: ["en"], subtitle_languages: ["es-419"] }),
    ];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary?.candidate.id).toBe("en-essub");
  });
});

describe("fallbacks y alternativas", () => {
  it("devuelve fallbacks ordenados por puntuación descendente", () => {
    const cands = [
      base({ id: "best", audio_languages: ["es-MX"], resolution_height: 1080, stability: 98 }),
      base({ id: "mid", audio_languages: ["es-ES"], resolution_height: 1080, stability: 80 }),
      base({ id: "low", audio_languages: ["en"], subtitle_languages: ["es"], resolution_height: 720, stability: 60 }),
    ];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary?.candidate.id).toBe("best");
    expect(r.fallbacks.map((f) => f.candidate.id)).toEqual(["mid", "low"]);
  });

  it("sin candidatos aprobados, primary es null", () => {
    const cands = [base({ id: "x", review_status: "pending" })];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary).toBeNull();
    expect(r.rejected).toHaveLength(1);
  });
});

describe("gates de dispositivo y geo", () => {
  it("descarta HEVC si el dispositivo no lo soporta", () => {
    const cands = [
      base({ id: "hevc", video_codec: "hevc" }),
      base({ id: "h264", video_codec: "h264", audio_languages: ["es-ES"] }),
    ];
    const r = selectPlayback(cands, {
      preferences: prefs,
      device: { maxResolution: 1080, hevc: false, hdr: false, dolbyVision: false, surround: false, supportsHls: true, supportsDash: true },
    });
    expect(r.primary?.candidate.id).toBe("h264");
  });

  it("respeta restricciones regionales (lista blanca)", () => {
    const cands = [
      base({ id: "geo-us", region_restrictions: ["US"] }),
      base({ id: "geo-mx", region_restrictions: ["MX"], audio_languages: ["es-ES"] }),
    ];
    const r = selectPlayback(cands, { preferences: prefs });
    expect(r.primary?.candidate.id).toBe("geo-mx");
  });
});

describe("las razones explican la elección", () => {
  it("incluye motivos legibles", () => {
    const r = selectPlayback([base({ audio_languages: ["es-MX"], stability: 95 })], { preferences: prefs });
    expect(r.primary?.reasons).toContain("Audio en español latino");
    expect(r.primary?.reasons).toContain("Fuente estable");
  });
});

describe("directPlayback: preferir fuentes directas en TV", () => {
  it("con DEFAULT_WEIGHTS el orden NO cambia: la web sigue igual que siempre", () => {
    // Mismo audio y misma calidad; solo cambia el tipo. Sin el peso activo, el
    // embed va primero por orden de llegada, que es el comportamiento actual.
    const cands = [
      base({ id: "embed", playback_type: "embed", play_url: "https://prov.example/e/1" }),
      base({ id: "hls", playback_type: "hls" }),
    ];
    const r = selectPlayback(cands, { preferences: prefs, weights: DEFAULT_WEIGHTS });
    expect(r.primary?.candidate.id).toBe("embed");
    expect(r.primary?.breakdown.directPlayback).toBe(0);
  });

  it("con TV_WEIGHTS una fuente directa gana al embed en igualdad de condiciones", () => {
    const cands = [
      base({ id: "embed", playback_type: "embed", play_url: "https://prov.example/e/1" }),
      base({ id: "hls", playback_type: "hls" }),
    ];
    const r = selectPlayback(cands, { preferences: prefs, weights: TV_WEIGHTS });
    expect(r.primary?.candidate.id).toBe("hls");
    expect(r.primary?.reasons).toContain("Reproducción directa (control total con mando)");
  });

  it("con TV_WEIGHTS un hls de 720p gana a un embed de 1080p", () => {
    const cands = [
      base({ id: "embed-1080", playback_type: "embed", resolution_height: 1080, play_url: "https://prov.example/e/1" }),
      base({ id: "hls-720", playback_type: "hls", resolution_height: 720 }),
    ];
    const r = selectPlayback(cands, { preferences: prefs, weights: TV_WEIGHTS });
    expect(r.primary?.candidate.id).toBe("hls-720");
  });

  it("es un desempate, no un filtro: el embed sigue ganando si el directo no tiene audio latino", () => {
    // audioLatam (30) pesa más que directPlayback (25): la regla de negocio
    // principal del motor no se subordina a la comodidad del mando.
    const cands = [
      base({ id: "embed-latam", playback_type: "embed", audio_languages: ["es-419"], play_url: "https://prov.example/e/1" }),
      base({ id: "hls-en", playback_type: "hls", audio_languages: ["en"], subtitle_languages: [] }),
    ];
    const r = selectPlayback(cands, { preferences: prefs, weights: TV_WEIGHTS });
    expect(r.primary?.candidate.id).toBe("embed-latam");
  });

  it("si el embed es la única fuente, en TV sigue siendo la elegida", () => {
    const cands = [base({ id: "solo-embed", playback_type: "embed", play_url: "https://prov.example/e/1" })];
    const r = selectPlayback(cands, { preferences: prefs, weights: TV_WEIGHTS });
    expect(r.primary?.candidate.id).toBe("solo-embed");
    expect(r.primary?.eligible).toBe(true);
  });

  it("un embed no autorizado sigue rechazado en TV: el gate manda sobre el peso", () => {
    const cands = [
      base({ id: "embed-unauth", playback_type: "embed", publish_authorization: "unauthorized" }),
      base({ id: "hls-ok", playback_type: "hls" }),
    ];
    const r = selectPlayback(cands, { preferences: prefs, weights: TV_WEIGHTS });
    expect(r.primary?.candidate.id).toBe("hls-ok");
    expect(r.rejected.some((x) => x.candidate.id === "embed-unauth")).toBe(true);
  });
});
