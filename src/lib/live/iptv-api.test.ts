import { describe, it, expect } from "vitest";
import { apiToChannels, buildLogoMap, buildCategoryMap } from "./iptv-api";
import type { ApiChannel, ApiStream, ApiLogo, ApiCategory } from "./iptv-api";

const channels: ApiChannel[] = [
  { id: "ADN40.mx", name: "ADN 40", country: "MX", categories: ["news"], is_nsfw: false },
  { id: "CCTV1.cn", name: "CCTV 1", country: "CN", categories: ["general"], is_nsfw: false },
  { id: "Porno.xx", name: "XXX", country: "US", categories: ["general"], is_nsfw: true },
  { id: "Old.us", name: "Old", country: "US", categories: ["movies"], closed: "2020-01-01" },
  { id: "Multi.us", name: "Multi", country: "US", categories: ["movies", "series"], is_nsfw: false },
];

const streams: ApiStream[] = [
  { channel: "ADN40.mx", url: "https://cdn/adn40.m3u8", quality: "1080p" },
  { channel: "CCTV1.cn", url: "https://cdn/cctv1.m3u8" },
  { channel: "Porno.xx", url: "https://cdn/xxx.m3u8" },
  { channel: "Old.us", url: "https://cdn/old.m3u8" },
  { channel: "Multi.us", url: "https://cdn/multi-a.m3u8" },
  { channel: "Multi.us", url: "https://cdn/multi-b.m3u8" }, // 2ª señal → respaldo
  { channel: "Multi.us", url: "https://cdn/multi-hdr.m3u8", user_agent: "X" }, // exige cabecera
  { channel: null, url: "https://cdn/orphan.m3u8" }, // sin canal
];

const logos: ApiLogo[] = [
  { channel: "ADN40.mx", url: "https://l/adn40-lowq.jpg", in_use: false, format: "JPEG", width: 100 },
  { channel: "ADN40.mx", url: "https://l/adn40.png", in_use: true, format: "PNG", width: 500 },
];

const categories: ApiCategory[] = [
  { id: "news", name: "News" },
  { id: "movies", name: "Movies" },
  { id: "series", name: "Series" },
  { id: "general", name: "General" },
];

describe("apiToChannels", () => {
  it("emite una entrada por señal enlazada (base de failover)", () => {
    const out = apiToChannels(channels, streams, logos, categories);
    // ADN40 (1) + CCTV1 (1) + Multi (2, la de cabecera se salta) = 4;
    // nsfw/closed/huérfana fuera. CN NO se filtra si no se pide excludeCountries.
    expect(out).toHaveLength(4);
    const multi = out.filter((c) => c.tvgId === "Multi.us");
    expect(multi).toHaveLength(2); // dos señales → mismo tvgId → se agruparán
    expect(multi.map((m) => m.url)).toEqual([
      "https://cdn/multi-a.m3u8",
      "https://cdn/multi-b.m3u8",
    ]);
  });

  it("excluye China por país limpio", () => {
    const out = apiToChannels(channels, streams, logos, categories, { excludeCountries: ["CN"] });
    expect(out.some((c) => c.country === "CN")).toBe(false);
  });

  it("filtra nsfw y cerrados; salta señales con cabeceras", () => {
    const out = apiToChannels(channels, streams, logos, categories);
    expect(out.some((c) => c.name === "XXX")).toBe(false); // nsfw
    expect(out.some((c) => c.name === "Old")).toBe(false); // closed
    expect(out.some((c) => c.url.includes("hdr"))).toBe(false); // user_agent
  });

  it("mapea categorías a nombres legibles y elige el mejor logo", () => {
    const out = apiToChannels(channels, streams, logos, categories);
    const adn = out.find((c) => c.tvgId === "ADN40.mx")!;
    expect(adn.categories).toEqual(["News"]);
    expect(adn.logo).toBe("https://l/adn40.png"); // in_use + PNG gana
    const multi = out.find((c) => c.tvgId === "Multi.us")!;
    expect(multi.categories).toEqual(["Movies", "Series"]);
  });
});

describe("buildLogoMap / buildCategoryMap", () => {
  it("prioriza el logo en uso", () => {
    expect(buildLogoMap(logos).get("ADN40.mx")).toBe("https://l/adn40.png");
  });
  it("mapea id→nombre", () => {
    expect(buildCategoryMap(categories).get("news")).toBe("News");
  });
});
