import { describe, it, expect } from "vitest";
import { parseM3U, channelSlug } from "./m3u";

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-id="canal5.mx" tvg-name="Canal 5" tvg-logo="https://logos/c5.png" tvg-language="lat" group-title="Nacional",Canal 5 México
https://cdn.example.com/canal5/index.m3u8
#EXTINF:-1 tvg-id="bbb" group-title="Demo",Big Buck Bunny
https://test-streams.example/bbb.m3u8`;

describe("parseM3U", () => {
  it("extrae canales con sus atributos", () => {
    const ch = parseM3U(SAMPLE);
    expect(ch).toHaveLength(2);
    expect(ch[0].name).toBe("Canal 5");
    expect(ch[0].url).toBe("https://cdn.example.com/canal5/index.m3u8");
    expect(ch[0].language).toBe("es-419");
    expect(ch[0].group).toBe("Nacional");
  });

  it("genera slugs estables y sin acentos", () => {
    expect(channelSlug({ name: "Canal 5 México", tvgId: null })).toBe("canal-5-mexico");
    expect(channelSlug({ name: "x", tvgId: "canal5.mx" })).toBe("canal5-mx");
  });
});
