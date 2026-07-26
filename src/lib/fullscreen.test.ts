import { describe, it, expect, vi } from "vitest";
import {
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  toggleFullscreen,
  type FullscreenContainer,
  type FullscreenDocument,
  type FullscreenVideo,
} from "./fullscreen";

/** Contenedor falso: se declara solo la API que ese navegador ofrecería. */
const container = (api: { standard?: boolean; webkit?: boolean }) =>
  ({
    ...(api.standard ? { requestFullscreen: vi.fn(() => Promise.resolve()) } : {}),
    ...(api.webkit ? { webkitRequestFullscreen: vi.fn() } : {}),
  }) as unknown as FullscreenContainer;

/** `<video>` falso: `webkitEnterFullscreen` solo existe en iPhone. */
const video = (api: { webkitVideo?: boolean }) =>
  ({
    ...(api.webkitVideo ? { webkitEnterFullscreen: vi.fn() } : {}),
  }) as unknown as FullscreenVideo;

const doc = (over: Partial<FullscreenDocument> = {}) => ({ ...over }) as FullscreenDocument;

describe("enterFullscreen: cascada de compatibilidad", () => {
  it("escritorio/Android: usa el estándar sobre el contenedor", () => {
    const c = container({ standard: true, webkit: true });
    const v = video({ webkitVideo: true });
    expect(enterFullscreen(c, v)).toBe("standard");
    expect(c.requestFullscreen).toHaveBeenCalledOnce();
    expect(v.webkitEnterFullscreen).not.toHaveBeenCalled();
  });

  it("iPad/Safari antiguo: cae a webkitRequestFullscreen del contenedor", () => {
    const c = container({ webkit: true });
    const v = video({ webkitVideo: true });
    expect(enterFullscreen(c, v)).toBe("webkit-element");
    expect(c.webkitRequestFullscreen).toHaveBeenCalledOnce();
    expect(v.webkitEnterFullscreen).not.toHaveBeenCalled();
  });

  it("iPhone (el caso que fallaba): sin API en el contenedor, usa el <video>", () => {
    const c = container({}); // Safari de iPhone no expone nada en un <div>
    const v = video({ webkitVideo: true });
    expect(enterFullscreen(c, v)).toBe("webkit-video");
    expect(v.webkitEnterFullscreen).toHaveBeenCalledOnce();
  });

  it("sin ninguna vía disponible devuelve null (botón muerto detectable)", () => {
    expect(enterFullscreen(container({}), video({}))).toBeNull();
  });

  it("tolera refs nulas sin lanzar", () => {
    expect(() => enterFullscreen(null, null)).not.toThrow();
    expect(enterFullscreen(null, null)).toBeNull();
  });

  it("una promesa rechazada (sin gesto de usuario) no propaga el error", () => {
    const c = {
      requestFullscreen: vi.fn(() => Promise.reject(new Error("gesture required"))),
    } as unknown as FullscreenContainer;
    expect(() => enterFullscreen(c, video({}))).not.toThrow();
  });
});

describe("isFullscreen / exitFullscreen: ambos alias", () => {
  it("detecta el elemento por la propiedad estándar y por la de WebKit", () => {
    const el = {} as Element;
    expect(isFullscreen(doc({ fullscreenElement: el }))).toBe(true);
    expect(isFullscreen(doc({ webkitFullscreenElement: el }))).toBe(true);
    expect(isFullscreen(doc({ fullscreenElement: null }))).toBe(false);
    expect(isFullscreen(doc())).toBe(false);
  });

  it("sale por la vía estándar cuando existe", () => {
    const d = doc({ exitFullscreen: vi.fn(() => Promise.resolve()), webkitExitFullscreen: vi.fn() });
    exitFullscreen(d);
    expect(d.exitFullscreen).toHaveBeenCalledOnce();
    expect(d.webkitExitFullscreen).not.toHaveBeenCalled();
  });

  it("sale por webkitExitFullscreen si no hay estándar", () => {
    const d = doc({ webkitExitFullscreen: vi.fn() });
    exitFullscreen(d);
    expect(d.webkitExitFullscreen).toHaveBeenCalledOnce();
  });
});

describe("toggleFullscreen: alterna según el estado", () => {
  it("si NO está en pantalla completa, entra", () => {
    const c = container({ standard: true });
    expect(toggleFullscreen(c, video({}), doc())).toBe("standard");
    expect(c.requestFullscreen).toHaveBeenCalledOnce();
  });

  it("si YA está en pantalla completa, sale y no intenta entrar", () => {
    const c = container({ standard: true });
    const d = doc({ fullscreenElement: {} as Element, exitFullscreen: vi.fn(() => Promise.resolve()) });
    expect(toggleFullscreen(c, video({}), d)).toBeNull();
    expect(d.exitFullscreen).toHaveBeenCalledOnce();
    expect(c.requestFullscreen).not.toHaveBeenCalled();
  });
});
