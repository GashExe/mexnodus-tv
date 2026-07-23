"use client";

import { useState } from "react";
import { DownloadCloud, Clapperboard, CalendarClock, Tv } from "lucide-react";

// ── Playlist de ejemplo AUTORIZADA (dominio público / streams de prueba) ──────
const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="cine.publico" tvg-name="Cine Público 24/7" tvg-language="lat" group-title="Cine",Cine Público 24/7
https://test-streams.mux.dev/tos_ismc/main.m3u8
#EXTINF:-1 tvg-id="docs.abiertos" tvg-name="Documentales Abiertos" tvg-language="lat" group-title="Documentales",Documentales Abiertos
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-id="animacion.libre" tvg-name="Animación Libre" tvg-language="lat" group-title="Infantil",Animación Libre
https://test-streams.mux.dev/pts_shift/master.m3u8`;

// EPG de ejemplo generado alrededor de AHORA para todos los canales demo
const EPG_CHANNELS: { id: string; titles: string[] }[] = [
  { id: "demo.uno", titles: ["Magazine matutino", "Cine de la tarde", "Noticiero nocturno"] },
  { id: "demo.noticias", titles: ["Noticias de la hora", "Análisis", "Deportes al cierre"] },
  { id: "cine.publico", titles: ["Tears of Steel", "Sintel", "Big Buck Bunny"] },
  { id: "docs.abiertos", titles: ["Naturaleza abierta", "Ciencia hoy", "Historia libre"] },
  { id: "animacion.libre", titles: ["Cortos animados", "Maratón infantil", "Buenas noches"] },
  { id: "fallback.demo", titles: ["Programa de prueba", "Continuidad", "Cierre"] },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toXmltvDate(d: Date) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00 +0000`
  );
}
function buildSampleEpg(): string {
  const now = Date.now();
  const slot = 60 * 60 * 1000; // bloques de 1h
  const base = now - 30 * 60 * 1000; // empieza hace 30 min
  let body = "";
  for (const ch of EPG_CHANNELS) {
    ch.titles.forEach((title, i) => {
      const start = new Date(base + i * slot);
      const stop = new Date(base + (i + 1) * slot);
      body +=
        `  <programme start="${toXmltvDate(start)}" stop="${toXmltvDate(stop)}" channel="${ch.id}">\n` +
        `    <title lang="es">${title}</title>\n` +
        `    <desc lang="es">Programación de ejemplo para ${ch.id}.</desc>\n` +
        `  </programme>\n`;
    });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n${body}</tv>`;
}

export function ImportPanel() {
  const [m3u, setM3u] = useState(SAMPLE_M3U);
  const [epgUrl, setEpgUrl] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(path: string, body?: unknown, tag = path) {
    setBusy(tag);
    setOut(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      setOut(res.ok ? `✓ OK · ${JSON.stringify(json)}` : `✗ Error · ${json.error ?? res.status}`);
    } catch (e) {
      setOut(`✗ Error · ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* atajo de demo: carga todo lo autorizado de ejemplo de una vez */}
      <section className="rounded-card border border-accent/40 bg-accent/5 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Tv size={18} className="text-accent" />
          <h2 className="font-semibold">Cargar demo IPTV (autorizada)</h2>
        </div>
        <p className="mb-3 text-sm text-ink-3">
          Importa canales de dominio público/prueba <b>ya autorizados</b> y su EPG de ejemplo alrededor de la hora actual.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => post("/api/admin/import/m3u", { content: SAMPLE_M3U, authorize: true }, "demo-m3u")}
            disabled={busy === "demo-m3u"}
            className="rounded-pill bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {busy === "demo-m3u" ? "Importando…" : "1 · Importar canales de ejemplo"}
          </button>
          <button
            onClick={() => post("/api/admin/import/epg", { content: buildSampleEpg() }, "demo-epg")}
            disabled={busy === "demo-epg"}
            className="rounded-pill border border-accent px-5 py-2.5 font-semibold text-accent disabled:opacity-60"
          >
            {busy === "demo-epg" ? "Importando…" : "2 · Importar EPG de ejemplo"}
          </button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5">
          <div className="mb-2 flex items-center gap-2">
            <Clapperboard size={18} className="text-accent" />
            <h2 className="font-semibold">Sincronizar TMDB</h2>
          </div>
          <p className="mb-3 text-sm text-ink-3">
            Metadatos de películas y series populares. Requiere <code className="text-ink-2">TMDB_ACCESS_TOKEN</code>.
          </p>
          <button
            onClick={() => post("/api/admin/tmdb/sync")}
            disabled={busy === "/api/admin/tmdb/sync"}
            className="rounded-pill bg-surface-2 px-5 py-2.5 font-semibold text-ink disabled:opacity-60"
          >
            {busy === "/api/admin/tmdb/sync" ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
        </section>

        <section className="rounded-card border border-line bg-surface p-5">
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock size={18} className="text-accent" />
            <h2 className="font-semibold">Importar EPG (XMLTV)</h2>
          </div>
          <p className="mb-3 text-sm text-ink-3">
            Cruza por <code className="text-ink-2">tvg-id</code>. URL de un XMLTV público o pega el contenido.
          </p>
          <input
            value={epgUrl}
            onChange={(e) => setEpgUrl(e.target.value)}
            placeholder="https://ejemplo.com/epg.xml"
            className="mb-2 w-full rounded-[10px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => post("/api/admin/import/epg", { url: epgUrl }, "epg-url")}
            disabled={busy === "epg-url" || !epgUrl}
            className="rounded-pill bg-surface-2 px-5 py-2.5 font-semibold text-ink disabled:opacity-60"
          >
            Importar EPG desde URL
          </button>
        </section>
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 flex items-center gap-2">
          <DownloadCloud size={18} className="text-accent" />
          <h2 className="font-semibold">Importar playlist M3U</h2>
        </div>
        <p className="mb-3 text-sm text-ink-3">
          Pega una playlist o usa una URL. Se crean como <b>pendientes y no autorizados</b> (salvo la demo de arriba).
        </p>
        <textarea
          value={m3u}
          onChange={(e) => setM3u(e.target.value)}
          rows={6}
          className="mb-2 w-full rounded-[10px] border border-line bg-bg px-3 py-2 font-mono text-[12px] outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => post("/api/admin/import/m3u", { content: m3u }, "m3u-content")}
            disabled={busy === "m3u-content"}
            className="rounded-pill bg-surface-2 px-5 py-2.5 font-semibold text-ink disabled:opacity-60"
          >
            Importar contenido
          </button>
          <button
            onClick={() => {
              const url = prompt("URL de la playlist M3U (https):");
              if (url) post("/api/admin/import/m3u", { url }, "m3u-url");
            }}
            className="rounded-pill border border-line px-5 py-2.5 font-semibold text-ink-2 hover:text-ink"
          >
            Importar desde URL
          </button>
        </div>
      </section>

      {out && (
        <pre className="overflow-x-auto rounded-card border border-line bg-bg p-4 font-mono text-[12px] text-ink-2">
          {out}
        </pre>
      )}
    </div>
  );
}
