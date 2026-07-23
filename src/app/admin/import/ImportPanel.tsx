"use client";

import { useState } from "react";
import { DownloadCloud, Clapperboard } from "lucide-react";

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="demo.mx" tvg-name="Canal Importado" tvg-logo="" tvg-language="lat" group-title="Importados",Canal Importado Demo
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;

export function ImportPanel() {
  const [m3u, setM3u] = useState(SAMPLE_M3U);
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(path: string, body?: unknown) {
    setBusy(path);
    setOut(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      setOut(res.ok ? `OK · ${JSON.stringify(json)}` : `Error · ${json.error ?? res.status}`);
    } catch (e) {
      setOut(`Error · ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 flex items-center gap-2">
          <Clapperboard size={18} className="text-accent" />
          <h2 className="font-semibold">Sincronizar TMDB</h2>
        </div>
        <p className="mb-3 text-sm text-ink-3">
          Trae metadatos de películas y series populares. Requiere <code className="text-ink-2">TMDB_ACCESS_TOKEN</code>.
          Sin token, usa los seeds mock.
        </p>
        <button
          onClick={() => post("/api/admin/tmdb/sync")}
          disabled={busy === "/api/admin/tmdb/sync"}
          className="rounded-pill bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {busy === "/api/admin/tmdb/sync" ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 flex items-center gap-2">
          <DownloadCloud size={18} className="text-accent" />
          <h2 className="font-semibold">Importar playlist M3U</h2>
        </div>
        <p className="mb-3 text-sm text-ink-3">
          Pega una playlist o una URL. Los canales se crean como <b>pendientes y no autorizados</b>.
        </p>
        <textarea
          value={m3u}
          onChange={(e) => setM3u(e.target.value)}
          rows={6}
          className="mb-2 w-full rounded-[10px] border border-line bg-bg px-3 py-2 font-mono text-[12px] outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => post("/api/admin/import/m3u", { content: m3u })}
            disabled={busy === "/api/admin/import/m3u"}
            className="rounded-pill bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            Importar contenido
          </button>
          <button
            onClick={() => {
              const url = prompt("URL de la playlist M3U (https):");
              if (url) post("/api/admin/import/m3u", { url });
            }}
            className="rounded-pill border border-line px-5 py-2.5 font-semibold text-ink-2 hover:text-ink"
          >
            Importar desde URL
          </button>
        </div>
      </section>

      {out && (
        <pre className="lg:col-span-2 overflow-x-auto rounded-card border border-line bg-bg p-4 font-mono text-[12px] text-ink-2">
          {out}
        </pre>
      )}
    </div>
  );
}
