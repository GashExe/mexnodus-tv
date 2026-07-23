import { describe, it, expect } from "vitest";
import { channelMatchKey, planChannelMerges, type MergeableChannel } from "./merge";

const ch = (over: Partial<MergeableChannel> & { id: string; name: string }): MergeableChannel => ({
  country: null,
  logo_path: null,
  categories: null,
  epg_id: null,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("channelMatchKey", () => {
  it("colapsa espacios y variantes ('8 NTV' ≡ '8NTV')", () => {
    expect(channelMatchKey("8 NTV")).toBe(channelMatchKey("8NTV"));
  });
  it("quita calidad pero NO palabras distintivas", () => {
    expect(channelMatchKey("ADN 40 (1080p)")).toBe("adn40");
    expect(channelMatchKey("Canal 5")).not.toBe(channelMatchKey("TV 5")); // canal5 ≠ tv5
  });
  it("sin acentos y case-insensitive", () => {
    expect(channelMatchKey("Canal Cátedra")).toBe(channelMatchKey("canal catedra"));
  });
});

describe("planChannelMerges", () => {
  it("fusiona mismo nombre + mismo país; canónico = id iptv-org", () => {
    const groups = planChannelMerges([
      ch({ id: "a", name: "ADN 40", country: "MX", epg_id: "ADN40.mx", logo_path: "x.png", categories: ["News"] }),
      ch({ id: "b", name: "ADN 40", country: "MX", epg_id: "1755", categories: ["tv"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalId).toBe("a");
    expect(groups[0].duplicateIds).toEqual(["b"]);
    // categorías: unión (News + tv)
    expect(groups[0].mergedCategories).toEqual(["News", "tv"]);
  });

  it("NO fusiona mismo nombre en países distintos", () => {
    const groups = planChannelMerges([
      ch({ id: "a", name: "Canal 10", country: "MX" }),
      ch({ id: "b", name: "Canal 10", country: "AR" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("adopta sin-país solo cuando hay un único país candidato", () => {
    const adopted = planChannelMerges([
      ch({ id: "a", name: "CBS News", country: "US", epg_id: "CBSNews.us" }),
      ch({ id: "b", name: "CBS News" }), // FAST sin país
    ]);
    expect(adopted).toHaveLength(1);
    expect(adopted[0].canonicalId).toBe("a");

    const ambiguous = planChannelMerges([
      ch({ id: "a", name: "Cinema TV", country: "RO" }),
      ch({ id: "b", name: "Cinema TV", country: "BR" }),
      ch({ id: "c", name: "Cinema TV" }), // ambiguo → fuera
    ]);
    expect(ambiguous).toHaveLength(0); // cada país quedó con 1 miembro
  });

  it("fusiona grupos enteramente sin país (listas FAST)", () => {
    const groups = planChannelMerges([
      ch({ id: "a", name: "NBC News NOW", logo_path: "l.png" }),
      ch({ id: "b", name: "NBC News NOW" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonicalId).toBe("a"); // el del logo gana
  });

  it("rellena logo/país faltantes en el canónico desde un duplicado", () => {
    const groups = planChannelMerges([
      // canónico por epg_id iptv-org pero sin logo
      ch({ id: "a", name: "Foo TV", country: "MX", epg_id: "FooTV.mx" }),
      ch({ id: "b", name: "Foo TV", country: "MX", logo_path: "logo.png" }),
    ]);
    expect(groups[0].canonicalId).toBe("a");
    expect(groups[0].fillLogo).toBe("logo.png");
  });

  it("ignora claves demasiado cortas", () => {
    const groups = planChannelMerges([
      ch({ id: "a", name: "A+", country: "MX" }),
      ch({ id: "b", name: "A+", country: "MX" }),
    ]);
    expect(groups).toHaveLength(0);
  });
});
