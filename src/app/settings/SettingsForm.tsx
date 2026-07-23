"use client";

import { useActionState, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { savePreferences } from "./actions";
import { LANG_LABEL } from "@/lib/language";
import type { LangCode, UserPreferences } from "@/lib/types/db";

const AUDIO_OPTS: LangCode[] = ["es-MX", "es-419", "es", "es-ES", "en", "pt-BR"];

function Reorderable({ name, initial }: { name: string; initial: LangCode[] }) {
  const [order, setOrder] = useState<LangCode[]>(initial);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const copy = [...order];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setOrder(copy);
  };
  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(order)} />
      <ul className="space-y-1.5">
        {order.map((code, i) => (
          <li key={code} className="flex items-center gap-2 rounded-[10px] border border-line bg-bg px-3 py-2">
            <span className="w-5 font-mono text-sm text-accent">{i + 1}</span>
            <span className="flex-1 text-sm">{LANG_LABEL[code]}</span>
            <button type="button" onClick={() => move(i, -1)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Subir">
              <ChevronUp size={16} />
            </button>
            <button type="button" onClick={() => move(i, 1)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Bajar">
              <ChevronDown size={16} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between rounded-[10px] border border-line bg-bg px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-[rgb(var(--mx-accent))]" />
    </label>
  );
}

export function SettingsForm({ prefs }: { prefs: UserPreferences }) {
  const [state, action, pending] = useActionState(savePreferences, null as { ok?: boolean; error?: string } | null);
  const audioInit = (prefs.audio_priority?.length ? prefs.audio_priority : AUDIO_OPTS) as LangCode[];
  const subInit = (prefs.subtitle_priority?.length ? prefs.subtitle_priority : ["es-419", "es", "es-ES", "en"]) as LangCode[];

  return (
    <form action={action} className="grid gap-6 md:grid-cols-2">
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Prioridad de audio</h2>
        <p className="mb-3 text-sm text-ink-3">El motor elige la fuente con el audio más alto de esta lista.</p>
        <Reorderable name="audio_priority" initial={audioInit} />
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">Prioridad de subtítulos</h2>
        <p className="mb-3 text-sm text-ink-3">Se usan cuando no hay audio en español.</p>
        <Reorderable name="subtitle_priority" initial={subInit} />
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Calidad y reproducción</h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-ink-2">Resolución máxima</span>
          <select name="max_resolution" defaultValue={prefs.max_resolution} className="w-full rounded-[10px] border border-line bg-bg px-3 py-2.5">
            <option value={480}>480p (ahorro de datos)</option>
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
            <option value={2160}>2160p (4K)</option>
          </select>
        </label>
        <div className="space-y-2">
          <Toggle name="autoplay_next" label="Reproducir siguiente automáticamente" defaultChecked={prefs.autoplay_next} />
          <Toggle name="data_saver" label="Ahorro de datos" defaultChecked={prefs.data_saver} />
          <Toggle name="prefer_hdr" label="Preferir HDR/Dolby Vision" defaultChecked={prefs.prefer_hdr} />
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Región</h2>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">País (ISO-3166)</span>
          <input name="country" defaultValue={prefs.player_prefs ? "MX" : "MX"} maxLength={2} className="w-full rounded-[10px] border border-line bg-bg px-3 py-2.5 uppercase" />
        </label>
        <p className="mt-2 text-xs text-ink-3">Afecta a las restricciones regionales de las fuentes.</p>
      </section>

      <div className="md:col-span-2 flex items-center gap-3">
        <button disabled={pending} className="rounded-pill bg-accent px-6 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar preferencias"}
        </button>
        {state?.ok && <span className="text-sm text-good">Guardado ✓</span>}
        {state?.error && <span className="text-sm text-crit">{state.error}</span>}
      </div>
    </form>
  );
}
