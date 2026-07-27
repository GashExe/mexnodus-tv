import { describe, it, expect } from "vitest";
import {
  EMBED_COMMAND_SOURCE,
  EMBED_EVENT_SOURCE,
  buildEmbedCommand,
  volumeCommand,
  seekCommand,
  parseEmbedPlayerEvent,
  playingStateFromEvent,
} from "./commands";

describe("buildEmbedCommand", () => {
  it("marca el mensaje con el source que espera el proveedor", () => {
    expect(buildEmbedCommand("play")).toEqual({ source: EMBED_COMMAND_SOURCE, command: "play" });
  });

  it("omite `value` cuando no aplica, en vez de mandarlo como undefined", () => {
    const msg = buildEmbedCommand("pause");
    expect("value" in msg).toBe(false);
  });

  it("descarta valores no finitos", () => {
    expect("value" in buildEmbedCommand("seek", NaN)).toBe(false);
    expect("value" in buildEmbedCommand("seek", Infinity)).toBe(false);
  });
});

describe("volumeCommand", () => {
  it("acota a 0..100 y redondea", () => {
    expect(volumeCommand(50.4).value).toBe(50);
    expect(volumeCommand(-20).value).toBe(0);
    expect(volumeCommand(180).value).toBe(100);
  });
});

describe("seekCommand", () => {
  it("no permite segundos negativos", () => {
    expect(seekCommand(-30).value).toBe(0);
  });

  it("redondea a segundos enteros", () => {
    expect(seekCommand(61.7).value).toBe(62);
  });
});

describe("parseEmbedPlayerEvent", () => {
  it("acepta un evento bien formado del proveedor", () => {
    const parsed = parseEmbedPlayerEvent({
      source: EMBED_EVENT_SOURCE,
      event: "play",
      info: { currentTime: 12 },
    });
    expect(parsed).toEqual({ event: "play", info: { currentTime: 12 } });
  });

  it("ignora los mensajes del escudo de embeds", () => {
    // En la misma ventana caen también los de `secure-embed-shield`; confundirlos
    // haría que un popup bloqueado se interpretase como estado de reproducción.
    expect(
      parseEmbedPlayerEvent({ source: "secure-embed-shield", kind: "popup_blocked" }),
    ).toBeNull();
  });

  it("ignora basura de terceros y extensiones", () => {
    expect(parseEmbedPlayerEvent(null)).toBeNull();
    expect(parseEmbedPlayerEvent("hola")).toBeNull();
    expect(parseEmbedPlayerEvent(42)).toBeNull();
    expect(parseEmbedPlayerEvent({})).toBeNull();
    expect(parseEmbedPlayerEvent({ source: EMBED_EVENT_SOURCE })).toBeNull();
    expect(parseEmbedPlayerEvent({ source: EMBED_EVENT_SOURCE, event: "" })).toBeNull();
  });
});

describe("playingStateFromEvent", () => {
  it("reconoce los eventos que sí dicen si está reproduciendo", () => {
    expect(playingStateFromEvent("play")).toBe(true);
    expect(playingStateFromEvent("playing")).toBe(true);
    expect(playingStateFromEvent("pause")).toBe(false);
    expect(playingStateFromEvent("ended")).toBe(false);
  });

  it("devuelve null para los que no hablan de reproducción", () => {
    expect(playingStateFromEvent("timeupdate")).toBeNull();
    expect(playingStateFromEvent("ready")).toBeNull();
  });
});
