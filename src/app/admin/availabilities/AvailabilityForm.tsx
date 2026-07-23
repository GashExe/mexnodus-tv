"use client";

import { useActionState } from "react";
import { createAvailability } from "../actions";

export function AvailabilityForm({
  providers,
  titles,
}: {
  providers: { id: string; name: string }[];
  titles: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createAvailability, null as { ok?: boolean; error?: string } | null);
  const field = "w-full rounded-[10px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-surface p-5 sm:grid-cols-2">
      <label className="text-sm">Proveedor
        <select name="provider_id" required className={field}>
          <option value="">—</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="text-sm">Título (película/serie)
        <select name="media_title_id" className={field}>
          <option value="">—</option>
          {titles.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      <label className="text-sm">Tipo de reproducción
        <select name="playback_type" className={field} defaultValue="hls">
          {["hls", "dash", "file", "embed", "jellyfin", "iptv"].map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="text-sm">Resolución (px)
        <input name="resolution_height" type="number" placeholder="1080" className={field} />
      </label>
      <label className="text-sm sm:col-span-2">URL de reproducción (https)
        <input name="play_url" required placeholder="https://…/index.m3u8" className={field} />
      </label>
      <label className="text-sm">Audio (LangCode)
        <select name="audio_lang" className={field} defaultValue="es-419">
          {["es-MX", "es-419", "es", "es-ES", "en", "pt-BR"].map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>
      <label className="text-sm">Subtítulos (LangCode)
        <select name="subtitle_lang" className={field} defaultValue="es-419">
          {["", "es-419", "es-MX", "es", "es-ES", "en"].map((l) => <option key={l}>{l || "—"}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-pill bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60">
          {pending ? "Creando…" : "Crear disponibilidad"}
        </button>
        <span className="text-xs text-ink-3">Se crea como pendiente y NO autorizada. Autorízala en Revisión.</span>
        {state?.ok && <span className="text-sm text-good">Creada ✓</span>}
        {state?.error && <span className="text-sm text-crit">{state.error}</span>}
      </div>
    </form>
  );
}
