import { describe, it, expect } from "vitest";
import {
  PAIRING_ALPHABET,
  CODE_LENGTH,
  generateCode,
  generateDeviceSecret,
  normalizeCode,
  isValidCodeShape,
  isPairingUsable,
  pairingState,
  type PairingRow,
} from "./pairing";

const row = (over: Partial<PairingRow> = {}): PairingRow => ({
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  consumed_at: null,
  claimed_by: null,
  ...over,
});

describe("alfabeto y generación de códigos", () => {
  it("el alfabeto excluye los caracteres que se confunden al leer una pantalla", () => {
    for (const c of ["I", "L", "O", "0", "1"]) {
      expect(PAIRING_ALPHABET).not.toContain(c);
    }
  });

  it("genera códigos de la longitud correcta y solo con el alfabeto", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isValidCodeShape(code)).toBe(true);
    }
  });

  it("no repite el mismo código una y otra vez", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
    // Con 31^6 combinaciones, 200 tiradas casi idénticas indicarían un generador roto.
    expect(seen.size).toBeGreaterThan(190);
  });

  it("el secreto del dispositivo es largo, hex y distinto en cada llamada", () => {
    const a = generateDeviceSecret();
    const b = generateDeviceSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("normalizeCode", () => {
  it("acepta minúsculas, espacios y guiones", () => {
    expect(normalizeCode("abc-234")).toBe("ABC234");
    expect(normalizeCode(" a b c 2 3 4 ")).toBe("ABC234");
  });

  it("un código válido no cambia al normalizarlo", () => {
    const code = generateCode();
    expect(normalizeCode(code)).toBe(code);
  });
});

describe("isValidCodeShape", () => {
  it("rechaza longitudes incorrectas", () => {
    expect(isValidCodeShape("ABC23")).toBe(false);
    expect(isValidCodeShape("ABC2345")).toBe(false);
  });

  it("rechaza caracteres fuera del alfabeto", () => {
    expect(isValidCodeShape("ABC01I")).toBe(false);
  });

  it("acepta un código bien formado", () => {
    expect(isValidCodeShape("ABC234")).toBe(true);
  });
});

describe("vigencia del emparejamiento", () => {
  it("uno recién creado y sin reclamar está pendiente", () => {
    expect(pairingState(row())).toBe("pending");
    expect(isPairingUsable(row())).toBe(true);
  });

  it("caducado por tiempo deja de servir", () => {
    const old = row({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(isPairingUsable(old)).toBe(false);
    expect(pairingState(old)).toBe("expired");
  });

  it("ya consumido no vuelve a servir aunque no haya caducado", () => {
    const used = row({ consumed_at: new Date().toISOString(), claimed_by: "u1" });
    expect(isPairingUsable(used)).toBe(false);
    expect(pairingState(used)).toBe("expired");
  });

  it("reclamado y vigente pasa a claimed", () => {
    expect(pairingState(row({ claimed_by: "u1" }))).toBe("claimed");
  });

  it("un reclamo tras la caducidad no cuenta", () => {
    const late = row({
      claimed_by: "u1",
      expires_at: new Date(Date.now() - 1).toISOString(),
    });
    expect(pairingState(late)).toBe("expired");
  });
});
