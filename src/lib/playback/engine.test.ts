import { describe, it, expect } from "vitest";
import { selectPlayback, isPlayable, type Candidate } from "./engine";
import { DEFAULT_AUDIO_PRIORITY, DEFAULT_SUBTITLE_PRIORITY } from "@/lib/language";
import type { SelectionPreferences } from "./weights";

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
