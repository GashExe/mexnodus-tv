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

      {/* Secure Embed Shield: perfil de seguridad del embed. */}
      <fieldset className="grid gap-3 rounded-[10px] border border-line/60 bg-bg/40 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-xs text-ink-3">Secure Embed Shield (seguridad del iframe)</legend>
        <label className="text-sm">Nivel de seguridad
          <select name="embed_security_level" className={field} defaultValue="strict">
            <option value="strict">strict · allow-scripts allow-presentation</option>
            <option value="compatible">compatible · + allow-same-origin</option>
            <option value="external-only">external-only · no se enmarca</option>
          </select>
        </label>
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
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="requires_same_origin" className="accent-accent" /> Requiere same-origin
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="sandbox_compatible" defaultChecked className="accent-accent" /> Compatible con sandbox
          </label>
        </div>
        <p className="text-xs text-ink-3 sm:col-span-2">
          Nunca se conceden <code>allow-popups</code>, <code>allow-top-navigation</code> ni{" "}
          <code>allow-downloads</code>. Un proveedor con riesgo alto de popup/redirección se marca
          incompatible y se ofrece solo como apertura externa.
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
