import { describe, it, expect, beforeEach } from "vitest";
import { consumeAttempt, resetRateLimits } from "./rate-limit";

describe("consumeAttempt", () => {
  beforeEach(resetRateLimits);

  it("permite hasta el límite y bloquea el siguiente", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(consumeAttempt("ip", 3, 60_000, now).allowed).toBe(true);
    }
    const blocked = consumeAttempt("ip", 3, 60_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("cada clave lleva su propia cuenta", () => {
    const now = 1_000_000;
    consumeAttempt("a", 1, 60_000, now);
    expect(consumeAttempt("a", 1, 60_000, now).allowed).toBe(false);
    expect(consumeAttempt("b", 1, 60_000, now).allowed).toBe(true);
  });

  it("la ventana se reinicia al expirar", () => {
    const now = 1_000_000;
    consumeAttempt("ip", 1, 60_000, now);
    expect(consumeAttempt("ip", 1, 60_000, now).allowed).toBe(false);
    expect(consumeAttempt("ip", 1, 60_000, now + 60_001).allowed).toBe(true);
  });

  it("retryAfterSeconds refleja lo que queda de ventana, no la ventana entera", () => {
    const now = 1_000_000;
    consumeAttempt("ip", 1, 60_000, now);
    const blocked = consumeAttempt("ip", 1, 60_000, now + 45_000);
    expect(blocked.retryAfterSeconds).toBe(15);
  });

  it("nunca devuelve un retryAfter de 0 cuando bloquea", () => {
    const now = 1_000_000;
    consumeAttempt("ip", 1, 60_000, now);
    // Justo antes del reinicio: redondear hacia abajo daría 0 y el cliente
    // reintentaría en bucle.
    const blocked = consumeAttempt("ip", 1, 60_000, now + 59_999);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
