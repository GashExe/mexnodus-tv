/**
 * Fusión de canales duplicados entre fuentes.
 * ===========================================
 * El mismo canal llega con identificadores distintos según la fuente
 * (iptv-org: "ADN40.mx"; m3u.cl: id numérico; FAST: hash propio) → slugs
 * distintos → filas duplicadas, y el failover solo agrupa dentro de una fila.
 *
 * Este módulo PLANIFICA fusiones de forma conservadora:
 *  - Clave de emparejamiento compacta por nombre ("8 NTV" ≡ "8NTV"), quitando
 *    solo marcadores de calidad que nunca distinguen canales. NO quita palabras
 *    como "TV"/"Canal" ("Canal 5" ≠ "TV 5").
 *  - Solo fusiona dentro del MISMO país. Un canal sin país se adopta únicamente
 *    si el grupo tiene un solo país candidato (sin ambigüedad); si el grupo
 *    entero carece de país, se fusionan entre sí (típico de listas FAST).
 *  - El canónico es el mejor documentado: id estilo iptv-org (con EPG cruzable)
 *    > con logo > con categorías; desempata el más antiguo.
 *
 * La EJECUCIÓN (mover señales como respaldos, desactivar duplicados) vive en el
 * script/route que consuma este plan. Los duplicados se DESACTIVAN, no se
 * borran: así una reimportación no los resucita como filas visibles.
 */

export interface MergeableChannel {
  id: string;
  name: string;
  country: string | null;
  logo_path: string | null;
  categories: string[] | null;
  epg_id: string | null;
  created_at: string;
}

export interface MergeGroup {
  canonicalId: string;
  duplicateIds: string[];
  /** Logo que aporta un duplicado si el canónico no tiene. */
  fillLogo?: string;
  /** País que aporta un duplicado si el canónico no tiene. */
  fillCountry?: string;
  /** Unión de categorías si los duplicados aportan nuevas. */
  mergedCategories?: string[];
}

// Tokens de calidad/ruido que jamás distinguen un canal de otro.
const QUALITY_TOKENS = new Set([
  "hd", "sd", "fhd", "uhd", "4k", "8k",
  "1080p", "720p", "576p", "480p", "360p", "240p",
  "geo",
]);

/**
 * Clave compacta de emparejamiento: minúsculas, sin acentos, sin (…)/[…], sin
 * tokens de calidad, y SIN espacios (para que "8 NTV" y "8NTV" coincidan).
 */
export function channelMatchKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !QUALITY_TOKENS.has(w))
    .join("");
}

const IPTV_ORG_ID = /\.[a-z]{2}$/i; // p.ej. "ADN40.mx"

function score(c: MergeableChannel): number {
  let s = 0;
  if (c.epg_id && IPTV_ORG_ID.test(c.epg_id)) s += 1000; // metadatos+EPG cruzable
  if (c.logo_path) s += 100;
  if (c.categories?.length) s += 10;
  return s;
}

function pickCanonical(cluster: MergeableChannel[]): MergeableChannel {
  return [...cluster].sort(
    (a, b) =>
      score(b) - score(a) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  )[0];
}

function buildGroup(cluster: MergeableChannel[]): MergeGroup {
  const canonical = pickCanonical(cluster);
  const dups = cluster.filter((c) => c.id !== canonical.id);
  const group: MergeGroup = { canonicalId: canonical.id, duplicateIds: dups.map((d) => d.id) };

  if (!canonical.logo_path) {
    const donor = dups.find((d) => d.logo_path);
    if (donor) group.fillLogo = donor.logo_path!;
  }
  if (!canonical.country) {
    const donor = dups.find((d) => d.country);
    if (donor) group.fillCountry = donor.country!;
  }
  const seen = new Set((canonical.categories ?? []).map((c) => c.toLowerCase()));
  const merged = [...(canonical.categories ?? [])];
  for (const d of dups) {
    for (const cat of d.categories ?? []) {
      if (!seen.has(cat.toLowerCase())) {
        seen.add(cat.toLowerCase());
        merged.push(cat);
      }
    }
  }
  if (merged.length > (canonical.categories?.length ?? 0)) group.mergedCategories = merged;
  return group;
}

export function planChannelMerges(rows: MergeableChannel[]): MergeGroup[] {
  const byKey = new Map<string, MergeableChannel[]>();
  for (const r of rows) {
    const key = channelMatchKey(r.name);
    if (key.length < 3) continue; // demasiado genérico para fusionar con confianza
    const arr = byKey.get(key);
    if (arr) arr.push(r);
    else byKey.set(key, [r]);
  }

  const groups: MergeGroup[] = [];
  for (const members of byKey.values()) {
    if (members.length < 2) continue;

    const byCountry = new Map<string, MergeableChannel[]>();
    const nulls: MergeableChannel[] = [];
    for (const m of members) {
      if (m.country) {
        const arr = byCountry.get(m.country);
        if (arr) arr.push(m);
        else byCountry.set(m.country, [m]);
      } else nulls.push(m);
    }

    const clusters: MergeableChannel[][] = [];
    if (byCountry.size === 1) {
      // un solo país → los sin-país se adoptan sin ambigüedad
      clusters.push([...byCountry.values().next().value!, ...nulls]);
    } else {
      // varios países: cada uno por separado; los sin-país quedan fuera (ambiguo)
      for (const arr of byCountry.values()) clusters.push(arr);
      if (byCountry.size === 0 && nulls.length > 1) clusters.push(nulls);
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      groups.push(buildGroup(cluster));
    }
  }
  return groups;
}
