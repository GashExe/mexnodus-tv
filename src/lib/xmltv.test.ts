import { describe, it, expect } from "vitest";
import { parseXMLTV, parseXmltvDate } from "./xmltv";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="canal5.mx"><display-name>Canal 5</display-name></channel>
  <programme start="20240722180000 +0000" stop="20240722190000 +0000" channel="canal5.mx">
    <title lang="es">Noticiero de la tarde</title>
    <desc lang="es">Resumen informativo &amp; deportes.</desc>
    <category>Noticias</category>
  </programme>
  <programme start="20240722190000 +0000" channel="canal5.mx">
    <title>Película de la noche</title>
  </programme>
</tv>`;

describe("parseXmltvDate", () => {
  it("convierte formato XMLTV a ISO", () => {
    expect(parseXmltvDate("20240722180000 +0000")).toBe("2024-07-22T18:00:00.000Z");
  });
  it("acepta offset distinto de UTC", () => {
    expect(parseXmltvDate("20240722180000 -0600")).toBe("2024-07-23T00:00:00.000Z");
  });
  it("rechaza basura", () => {
    expect(parseXmltvDate("no-fecha")).toBeNull();
  });
});

describe("parseXMLTV", () => {
  it("extrae programas con canal, tiempos, título y desc", () => {
    const progs = parseXMLTV(SAMPLE);
    expect(progs).toHaveLength(2);
    expect(progs[0].channelId).toBe("canal5.mx");
    expect(progs[0].title).toBe("Noticiero de la tarde");
    expect(progs[0].desc).toBe("Resumen informativo & deportes.");
    expect(progs[0].category).toBe("Noticias");
    expect(progs[0].stop).toBe("2024-07-22T19:00:00.000Z");
  });

  it("asume 30 min cuando falta stop", () => {
    const progs = parseXMLTV(SAMPLE);
    expect(progs[1].stop).toBe("2024-07-22T19:30:00.000Z");
  });
});
