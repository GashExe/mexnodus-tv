import { describe, it, expect } from "vitest";
import {
  EMBED_ALLOW,
  EMBED_REFERRER_POLICY,
  readReferrerPolicy,
  readProviderSecurity,
  assessProvider,
  isCriticalEmbedEvent,
  NON_CRITICAL_EMBED_EVENTS,
  SHIELD_EVENT_SOURCE,
  type EmbedEventKind,
  type ProviderSecurity,
} from "./embed-shield";

function sec(over: Partial<ProviderSecurity> = {}): ProviderSecurity {
  return { popup_risk: "low", redirect_risk: "low", last_security_test_at: null, ...over };
}

describe("atributos del iframe embed (web, sin sandbox)", () => {
  it("allow concede solo capacidades benignas de reproducción", () => {
    expect(EMBED_ALLOW).toBe("autoplay; fullscreen; picture-in-picture; encrypted-media");
    for (const f of ["camera", "microphone", "geolocation", "payment", "clipboard"]) {
      expect(EMBED_ALLOW).not.toContain(f);
    }
  });

  it("referrerPolicy por defecto es strict-origin-when-cross-origin", () => {
    expect(EMBED_REFERRER_POLICY).toBe("strict-origin-when-cross-origin");
  });

  it("el módulo ya no expone maquinaria de sandbox", async () => {
    const mod = (await import("./embed-shield")) as Record<string, unknown>;
    for (const gone of [
      "SANDBOX_PROFILES",
      "FORBIDDEN_SANDBOX_TOKENS",
      "buildSandbox",
      "planFromConfig",
      "enforceSandboxTokens",
      "STRICT_SANDBOX",
      "DEFAULT_EMBED_SANDBOX",
    ]) {
      expect(mod[gone]).toBeUndefined();
    }
  });
});

describe("readReferrerPolicy (configurable por proveedor)", () => {
  it("sin config → default strict-origin-when-cross-origin", () => {
    expect(readReferrerPolicy(null)).toBe("strict-origin-when-cross-origin");
    expect(readReferrerPolicy({})).toBe("strict-origin-when-cross-origin");
  });

  it("VidSrc: referrer_policy = origin se respeta", () => {
    expect(readReferrerPolicy({ referrer_policy: "origin" })).toBe("origin");
  });

  it("acepta todos los valores válidos", () => {
    for (const v of ["origin", "strict-origin-when-cross-origin", "no-referrer", "unsafe-url"]) {
      expect(readReferrerPolicy({ referrer_policy: v })).toBe(v);
    }
  });

  it("valor inválido → cae al default", () => {
    expect(readReferrerPolicy({ referrer_policy: "same-origin" })).toBe("strict-origin-when-cross-origin");
    expect(readReferrerPolicy({ referrer_policy: 123 })).toBe("strict-origin-when-cross-origin");
  });
});

describe("modelo de riesgo (solo analítica)", () => {
  it("readProviderSecurity conserva solo popup_risk, redirect_risk y last_security_test_at", () => {
    const s = readProviderSecurity({
      security: {
        popup_risk: "high",
        redirect_risk: "low",
        last_security_test_at: "2026-07-24T00:00:00Z",
        // campos viejos del sandbox: ya no se leen
        embed_security_level: "strict",
        sandbox_compatible: false,
      },
    });
    expect(s).toEqual({
      popup_risk: "high",
      redirect_risk: "low",
      last_security_test_at: "2026-07-24T00:00:00Z",
    });
    expect((s as unknown as Record<string, unknown>).embed_security_level).toBeUndefined();
    expect((s as unknown as Record<string, unknown>).sandbox_compatible).toBeUndefined();
  });

  it("defaults conservadores sin config", () => {
    expect(readProviderSecurity(null)).toEqual({
      popup_risk: "medium",
      redirect_risk: "medium",
      last_security_test_at: null,
    });
  });

  it("valores de riesgo inválidos caen al fallback", () => {
    const s = readProviderSecurity({ security: { popup_risk: 9, redirect_risk: "nope" } });
    expect(s.popup_risk).toBe("medium");
    expect(s.redirect_risk).toBe("medium");
  });
});

describe("assessProvider (analítica, sin efecto en el render)", () => {
  it("riesgo de popup alto → sugiere mitigación nativa, con aviso", () => {
    const a = assessProvider(sec({ popup_risk: "high" }));
    expect(a.needsNativeMitigation).toBe(true);
    expect(a.warnings.join(" ")).toMatch(/nativa/i);
  });

  it("riesgo de redirección alto → mitigación nativa", () => {
    expect(assessProvider(sec({ redirect_risk: "high" })).needsNativeMitigation).toBe(true);
  });

  it("riesgos bajos → sin mitigación pendiente ni avisos", () => {
    const a = assessProvider(sec());
    expect(a.needsNativeMitigation).toBe(false);
    expect(a.warnings).toHaveLength(0);
  });
});

describe("clasificación de eventos del embed", () => {
  it("popup bloqueado / iconos / telemetría / arranque son no críticos", () => {
    for (const k of ["popup_blocked", "icon_load_failed", "telemetry_failed", "playback_started", "iframe_loaded"] as const) {
      expect(isCriticalEmbedEvent(k)).toBe(false);
    }
  });

  it("solo playback_error es crítico", () => {
    expect(isCriticalEmbedEvent("playback_error")).toBe(true);
  });

  it("todos los NON_CRITICAL_EMBED_EVENTS son no críticos", () => {
    for (const kind of NON_CRITICAL_EMBED_EVENTS) {
      expect(isCriticalEmbedEvent(kind as EmbedEventKind)).toBe(false);
    }
  });

  it("la firma de los mensajes del escudo es estable", () => {
    expect(SHIELD_EVENT_SOURCE).toBe("secure-embed-shield");
  });
});
