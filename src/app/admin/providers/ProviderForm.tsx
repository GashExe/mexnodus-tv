"use client";

import { useActionState } from "react";
import { createProvider } from "../actions";

const ADAPTERS = ["direct-hls", "direct-file", "m3u-iptv", "jellyfin", "archive-org", "fast-pattern"];
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
