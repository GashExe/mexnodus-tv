import { describe, it, expect } from "vitest";
import {
  parseM3U,
  channelSlug,
  countryFromTvgId,
  feedFromTvgId,
  countryFromName,
  cleanChannelName,
  splitCategories,
  filterChannels,
} from "./m3u";

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-id="canal5.mx" tvg-name="Canal 5" tvg-logo="https://logos/c5.png" tvg-language="lat" group-title="Nacional",Canal 5 México
https://cdn.example.com/canal5/index.m3u8
#EXTINF:-1 tvg-id="bbb" group-title="Demo",Big Buck Bunny
https://test-streams.example/bbb.m3u8`;

// Formato iptv-org: país e idioma codificados en el tvg-id, géneros con `;`.
const IPTV_ORG = `#EXTM3U
#EXTINF:-1 tvg-id="ADN40.mx@SD" group-title="News",ADN 40
https://cdn.mx/adn40.m3u8
#EXTINF:-1 tvg-id="AngelTV.in@Spanish" group-title="Animation;Kids",Angel TV Spanish
https://cdn.in/angel.m3u8
#EXTINF:-1 tvg-id="CCTV1.cn@HD" group-title="General",CCTV 1
https://cdn.cn/cctv1.m3u8`;

describe("parseM3U", () => {
  it("extrae canales con sus atributos", () => {
    const ch = parseM3U(SAMPLE);
    expect(ch).toHaveLength(2);
    expect(ch[0].name).toBe("Canal 5");
    expect(ch[0].url).toBe("https://cdn.example.com/canal5/index.m3u8");
    expect(ch[0].language).toBe("es-419");
    expect(ch[0].group).toBe("Nacional");
    // país deducido del tvg-id cuando no hay tvg-country
    expect(ch[0].country).toBe("MX");
    expect(ch[0].categories).toEqual(["Nacional"]);
    expect(ch[1].country).toBeNull();
  });

  it("deduce país e idioma del tvg-id estilo iptv-org", () => {
    const ch = parseM3U(IPTV_ORG);
    expect(ch[0].country).toBe("MX");
    expect(ch[1].country).toBe("IN");
    expect(ch[1].language).toBe("es"); // del sufijo "@Spanish"
    expect(ch[1].categories).toEqual(["Animation", "Kids"]);
    expect(ch[2].country).toBe("CN");
  });

  it("deduce país del sufijo del nombre estilo m3u.cl", () => {
    // sin tvg-name limpio: el nombre visible lleva "✪ | CC"
    const ch = parseM3U(
      `#EXTM3U\n#EXTINF:-1 tvg-id="156" tvg-logo="x.png", Rewind TV ✪ | CL\nhttps://cdn.cl/rewind.m3u8`,
    );
    expect(ch[0].country).toBe("CL");
    expect(ch[0].name).toBe("Rewind TV"); // limpio, sin ✪ ni sufijo
  });

  it("prefiere tvg-name limpio y aún así deduce país del nombre visible", () => {
    const ch = parseM3U(
      `#EXTM3U\n#EXTINF:-1 tvg-id="1513" tvg-name="Kan 11", Kan 11 ✪ | IL\nhttps://cdn.il/kan.m3u8`,
    );
    expect(ch[0].name).toBe("Kan 11");
    expect(ch[0].country).toBe("IL");
  });

  it("genera slugs estables y sin acentos", () => {
    expect(channelSlug({ name: "Canal 5 México", tvgId: null })).toBe("canal-5-mexico");
    expect(channelSlug({ name: "x", tvgId: "canal5.mx" })).toBe("canal5-mx");
  });
});

describe("channelSlug — deduplicación", () => {
  it("agrupa señales del mismo canal ignorando el sufijo @feed", () => {
    const hd = channelSlug({ name: "BBC One HD", tvgId: "BBCOne.uk@HD" });
    const sd = channelSlug({ name: "BBC One SD", tvgId: "BBCOne.uk@SD" });
    expect(hd).toBe("bbcone-uk");
    expect(hd).toBe(sd); // mismo canal → mismo slug → se fusionan
  });

  it("nombres no latinos obtienen slug único y estable (no colisionan)", () => {
    const a = channelSlug({ name: "Кухня ТВ", tvgId: null });
    const b = channelSlug({ name: "交城电视台", tvgId: null });
    expect(a).toMatch(/^ch-/);
    expect(b).toMatch(/^ch-/);
    expect(a).not.toBe(b); // canales distintos NO se fusionan
    // determinista: el mismo nombre da el mismo slug en otra importación
    expect(channelSlug({ name: "Кухня ТВ", tvgId: null })).toBe(a);
  });

  it("mismo nombre en países distintos NO se fusiona", () => {
    const mx = channelSlug({ name: "点点", tvgId: null, country: "MX" });
    const ar = channelSlug({ name: "点点", tvgId: null, country: "AR" });
    expect(mx).not.toBe(ar);
  });

  it("cleanChannelName quita marcadores de calidad/estado", () => {
    expect(cleanChannelName("Slime (576p) [Not 24/7]")).toBe("Slime");
    expect(cleanChannelName("ADN 40 (1080p)")).toBe("ADN 40");
  });
});

describe("helpers de tvg-id y categorías", () => {
  it("countryFromTvgId extrae el código de país", () => {
    expect(countryFromTvgId("ADN40.mx@SD")).toBe("MX");
    expect(countryFromTvgId("AngelTV.in@Spanish")).toBe("IN");
    expect(countryFromTvgId("bbb")).toBeNull();
    expect(countryFromTvgId(null)).toBeNull();
  });

  it("feedFromTvgId devuelve el sufijo tras @", () => {
    expect(feedFromTvgId("ADN40.mx@SD")).toBe("SD");
    expect(feedFromTvgId("canal5.mx")).toBeNull();
  });

  it("countryFromName exige mayúsculas tras | y limpia el nombre", () => {
    expect(countryFromName("Rewind TV ✪ | CL")).toBe("CL");
    expect(countryFromName("Canal | hd")).toBeNull(); // minúsculas ≠ país
    expect(countryFromName("Sin sufijo")).toBeNull();
    expect(cleanChannelName("Rewind TV ✪ | CL")).toBe("Rewind TV");
  });

  it("splitCategories divide y descarta Undefined", () => {
    expect(splitCategories("Animation;Kids")).toEqual(["Animation", "Kids"]);
    expect(splitCategories("Undefined")).toEqual([]);
    expect(splitCategories(null)).toEqual([]);
    expect(splitCategories("News;news")).toEqual(["News"]); // sin duplicados
  });
});

describe("filterChannels", () => {
  const chans = parseM3U(IPTV_ORG);

  it("excluye países (todo menos China)", () => {
    const out = filterChannels(chans, { excludeCountries: ["CN"] });
    expect(out.map((c) => c.country)).toEqual(["MX", "IN"]);
  });

  it("incluye solo países dados", () => {
    const out = filterChannels(chans, { includeCountries: ["MX"] });
    expect(out).toHaveLength(1);
    expect(out[0].country).toBe("MX");
  });

  it("combina país e idioma por OR", () => {
    const out = filterChannels(chans, { includeCountries: ["MX"], languages: ["es"] });
    // MX (país) + Angel TV (idioma es) = 2
    expect(out).toHaveLength(2);
  });
});

describe("parseM3U: distinguir lista de canales de un stream suelto", () => {
  it("rechaza el playlist de segmentos de un canal (caso Azteca 7)", () => {
    const stream = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:6",
      "#EXT-X-MEDIA-SEQUENCE:7190",
      "#EXTINF:6.0,",
      "https://cdn.ejemplo.com/segmento-1.ts",
      "#EXTINF:6.0,",
      "https://cdn.ejemplo.com/segmento-2.ts",
    ].join("\n");
    // Antes creaba 2 canales "Sin nombre" apuntando a trocitos de vídeo.
    expect(() => parseM3U(stream)).toThrow(/no es una lista de canales|stream de vídeo/i);
  });

  it("rechaza también un master playlist de calidades", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=408192,RESOLUTION=320x180",
      "https://cdn.ejemplo.com/180p.m3u8",
    ].join("\n");
    expect(() => parseM3U(master)).toThrow();
  });

  it("una lista de canales normal sigue funcionando", () => {
    const lista = [
      "#EXTM3U",
      '#EXTINF:-1 tvg-id="Canal5.mx" group-title="General",Canal 5',
      "https://cdn.ejemplo.com/canal5/playlist.m3u8",
    ].join("\n");
    const out = parseM3U(lista);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Canal 5");
  });
});
