"use client";

import { useActionState } from "react";
import { createProvider } from "../actions";

const ADAPTERS = ["direct-hls", "direct-file", "m3u-iptv", "jellyfin", "archive-org", "fast-pattern", "pattern-embed"];
const TYPES = ["official", "public_domain", "government", "university", "fast", "user", "jellyfin", "m3u", "aggregate"];
const TRUST = ["untrusted", "low", "medium", "high", "verified"];

export function ProviderForm() {
  const [state, action, pending] = useActionState(createProvider, null as { ok?: boolean; error?: string } | null);
  const field = "w-full rounded-[10px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-surface p-5 sm:grid-cols-2">
      <label className="text-sm">Slug<input name="slug" required placeholder="mi-proveedor" className={field} /></label>
      <label className="text-sm">Nombre<input name="name" required placeholder="Mi Proveedor" className={field} /></label>
      <label className="text-sm">Tipo
        <select name="type" className={field} defaultValue="official">{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="text-sm">Adaptador
        <select name="adapter" className={field} defaultValue="direct-hls">{ADAPTERS.map((a) => <option key={a}>{a}</option>)}</select>
      </label>
      <label className="text-sm">Dominio<input name="domain" placeholder="ejemplo.com" className={field} /></label>
      <label className="text-sm">Confianza
        <select name="trust_level" className={field} defaultValue="medium">{TRUST.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="text-sm">Prioridad<input name="priority" type="number" defaultValue={0} className={field} /></label>

      {/* Solo para el adaptador `pattern-embed` (contenido propio por TMDB). */}
      <fieldset className="grid gap-3 rounded-[10px] border border-line/60 bg-bg/40 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-xs text-ink-3">Patrón por TMDB (solo adaptador <code>pattern-embed</code>)</legend>
        <label className="text-sm sm:col-span-2">Patrón película
          <input name="movie_pattern" placeholder="https://www.mexnodus.com/movie/{tmdb}" className={field} />
        </label>
        <label className="text-sm sm:col-span-2">Patrón serie
          <input name="series_pattern" placeholder="https://www.mexnodus.com/tv/{tmdb}/{season}/{episode}" className={field} />
        </label>
        <label className="text-sm">Tipo de reproducción
          <select name="playback_type" className={field} defaultValue="embed">
            {["embed", "hls", "dash", "file"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </fieldset>

      {/* Riesgo del proveedor: SOLO analítica (no afecta el render del iframe). */}
      <fieldset className="grid gap-3 rounded-[10px] border border-line/60 bg-bg/40 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-xs text-ink-3">Riesgo del embed (analítica)</legend>
        <label className="text-sm">Riesgo de popup
          <select name="popup_risk" className={field} defaultValue="medium">
            {["low", "medium", "high"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-sm">Riesgo de redirección
          <select name="redirect_risk" className={field} defaultValue="medium">
            {["low", "medium", "high"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <p className="text-xs text-ink-3 sm:col-span-2">
          En la <strong>versión web</strong> los embeds se renderizan <strong>sin <code>sandbox</code></strong>{" "}
          (varios proveedores lo detectan y bloquean la reproducción). Estos riesgos son solo
          informativos: alimentan el panel y la futura política de bloqueo de popups en las apps
          nativas (Electron/Android/iOS).
        </p>
      </fieldset>

      <div className="flex items-end gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-pill bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-60">
          {pending ? "Creando…" : "Crear proveedor"}
        </button>
        {state?.ok && <span className="text-sm text-good">Creado ✓</span>}
        {state?.error && <span className="text-sm text-crit">{state.error}</span>}
      </div>
    </form>
  );
}
