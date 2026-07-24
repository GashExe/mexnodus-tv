import { describe, it, expect } from "vitest";
import {
  SANDBOX_PROFILES,
  FORBIDDEN_SANDBOX_TOKENS,
  EMBED_ALLOW,
  DEFAULT_EMBED_SANDBOX,
  buildSandbox,
  enforceSandboxTokens,
  readProviderSecurity,
  planFromConfig,
  assessProvider,
  type ProviderSecurity,
} from "./embed-shield";

function sec(over: Partial<ProviderSecurity> = {}): ProviderSecurity {
  return {
    embed_security_level: "compatible",
    requires_same_origin: false,
    popup_risk: "low",
    redirect_risk: "low",
    sandbox_compatible: true,
    last_security_test_at: null,
    ...over,
  };
}

describe("perfiles de sandbox", () => {
  it("strict = solo allow-scripts (sin same-origin, sin presentation)", () => {
    const plan = buildSandbox(sec({ embed_security_level: "strict" }));
    expect(plan.renderMode).toBe("iframe");
    expect(plan.sandbox).toBe("allow-scripts");
    expect(plan.tokens).not.toContain("allow-same-origin");
  });

  it("compatible = allow-scripts allow-same-origin (conserva el origen)", () => {
    const plan = buildSandbox(sec({ embed_security_level: "compatible" }));
    expect(plan.sandbox).toBe("allow-scripts allow-same-origin");
    expect(DEFAULT_EMBED_SANDBOX).toBe("allow-scripts allow-same-origin");
  });

  it("external-only no se enmarca (renderMode external, sandbox null)", () => {
    const plan = buildSandbox(sec({ embed_security_level: "external-only" }));
    expect(plan.renderMode).toBe("external");
    expect(plan.sandbox).toBeNull();
    expect(plan.incompatible).toBe(true);
  });

  it("todos usan el mismo allow (con encrypted-media) y referrer no-referrer", () => {
    for (const level of ["strict", "compatible", "external-only"] as const) {
      const plan = buildSandbox(sec({ embed_security_level: level }));
      expect(plan.allow).toBe(EMBED_ALLOW);
      expect(plan.referrerPolicy).toBe("no-referrer");
    }
    expect(EMBED_ALLOW).toBe("autoplay; fullscreen; picture-in-picture; encrypted-media");
  });
});

describe("compatibilidad Safari (allow-presentation es flag inválido)", () => {
  it("ningún perfil emite allow-presentation", () => {
    for (const tokens of Object.values(SANDBOX_PROFILES)) {
      expect(tokens).not.toContain("allow-presentation");
    }
    for (const level of ["strict", "compatible"] as const) {
      expect(buildSandbox(sec({ embed_security_level: level })).sandbox).not.toContain("allow-presentation");
    }
  });

  it("recursos del embed no se rompen: compatible conserva el origen con allow-same-origin", () => {
    // Sin allow-same-origin el frame tiene origen nulo → «Origin null» en CORS.
    const plan = buildSandbox(sec({ embed_security_level: "compatible" }));
    expect(plan.sandbox?.split(" ")).toContain("allow-same-origin");
  });
});

describe("compatibilidad Chromium (tokens válidos)", () => {
  const VALID = new Set(["allow-scripts", "allow-same-origin"]);
  it("solo emite tokens válidos y conocidos", () => {
    for (const level of ["strict", "compatible"] as const) {
      const tokens = buildSandbox(sec({ embed_security_level: level })).sandbox!.split(" ");
      for (const t of tokens) expect(VALID.has(t)).toBe(true);
    }
  });
  it("allow incluye encrypted-media para DRM y no incluye features abusivas", () => {
    expect(EMBED_ALLOW).toContain("encrypted-media");
    for (const f of ["camera", "microphone", "geolocation", "payment", "clipboard"]) {
      expect(EMBED_ALLOW).not.toContain(f);
    }
  });
});

describe("ningún perfil concede tokens prohibidos", () => {
  it("los perfiles integrados están limpios", () => {
    for (const tokens of Object.values(SANDBOX_PROFILES)) {
      for (const forbidden of FORBIDDEN_SANDBOX_TOKENS) {
        expect(tokens).not.toContain(forbidden);
      }
    }
  });

  it("enforceSandboxTokens elimina cualquier token prohibido inyectado", () => {
    const { tokens, rejected } = enforceSandboxTokens([
      "allow-scripts",
      "allow-popups",
      "allow-top-navigation",
      "allow-downloads",
      "allow-presentation",
    ]);
    expect(tokens).toEqual(["allow-scripts", "allow-presentation"]);
    expect(rejected).toEqual(["allow-popups", "allow-top-navigation", "allow-downloads"]);
  });

  it("deduplica tokens repetidos", () => {
    const { tokens } = enforceSandboxTokens(["allow-scripts", "allow-scripts"]);
    expect(tokens).toEqual(["allow-scripts"]);
  });
});

describe("reglas de compatibilidad", () => {
  it("requires_same_origin sube strict → compatible", () => {
    const plan = buildSandbox(sec({ embed_security_level: "strict", requires_same_origin: true }));
    expect(plan.level).toBe("compatible");
    expect(plan.sandbox).toContain("allow-same-origin");
  });

  it("sandbox_compatible=false fuerza apertura externa aunque el nivel sea strict", () => {
    const plan = buildSandbox(sec({ embed_security_level: "strict", sandbox_compatible: false }));
    expect(plan.renderMode).toBe("external");
    expect(plan.incompatible).toBe(true);
    expect(plan.reason).toMatch(/popups|navegación/i);
  });
});

describe("readProviderSecurity: default compatible (conserva origen)", () => {
  it("sin config → compatible, sin same-origin explícito", () => {
    const s = readProviderSecurity(null);
    expect(s.embed_security_level).toBe("compatible");
    expect(s.requires_same_origin).toBe(false);
    expect(s.sandbox_compatible).toBe(true);
    expect(s.last_security_test_at).toBeNull();
  });

  it("valores inválidos caen al fallback", () => {
    const s = readProviderSecurity({ security: { embed_security_level: "wat", popup_risk: 9 } });
    expect(s.embed_security_level).toBe("compatible");
    expect(s.popup_risk).toBe("medium");
  });

  it("planFromConfig lee la config y genera el sandbox", () => {
    const plan = planFromConfig({ security: { embed_security_level: "compatible" } });
    expect(plan.sandbox).toBe("allow-scripts allow-same-origin");
  });
});

describe("assessProvider", () => {
  it("popup_risk alto → incompatible y recomienda external-only", () => {
    const a = assessProvider(sec({ popup_risk: "high" }));
    expect(a.sandboxCompatible).toBe(false);
    expect(a.recommendedLevel).toBe("external-only");
    expect(a.warnings.length).toBeGreaterThan(0);
  });

  it("redirect_risk alto → incompatible", () => {
    const a = assessProvider(sec({ redirect_risk: "high" }));
    expect(a.sandboxCompatible).toBe(false);
  });

  it("riesgos bajos + same-origin → recomienda compatible", () => {
    const a = assessProvider(sec({ requires_same_origin: true }));
    expect(a.sandboxCompatible).toBe(true);
    expect(a.recommendedLevel).toBe("compatible");
  });

  it("riesgos bajos con nivel strict → mantiene strict", () => {
    const a = assessProvider(sec({ embed_security_level: "strict" }));
    expect(a.recommendedLevel).toBe("strict");
  });
});
