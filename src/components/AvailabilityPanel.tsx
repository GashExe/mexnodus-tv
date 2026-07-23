import type { SelectionResult } from "@/lib/playback/engine";
import { Chip } from "./ui";
import { CheckCircle2, XCircle, Zap } from "lucide-react";

/** Muestra la decisión del Playback Selection Engine: elegida, alternativas, descartadas. */
export function AvailabilityPanel({ result }: { result: SelectionResult }) {
  const { primary, alternatives, rejected } = result;
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap size={16} className="text-accent" />
        <h3 className="text-sm font-semibold">Motor de selección</h3>
      </div>

      {primary ? (
        <div className="rounded-[10px] border border-accent/40 bg-accent/10 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <CheckCircle2 size={16} /> Fuente elegida
            </span>
            <span className="font-mono text-[11px] text-ink-2">score {primary.score}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {primary.candidate.resolution_height && <Chip tone="gold">{primary.candidate.resolution_height}p</Chip>}
            {(primary.candidate.audio_languages ?? []).map((l) => (
              <Chip key={l} tone="accent">{l}</Chip>
            ))}
            {primary.reasons.slice(0, 4).map((r) => (
              <Chip key={r}>{r}</Chip>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-[10px] border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          No hay ninguna fuente aprobada y autorizada. Revisa el panel de aprobación.
        </p>
      )}

      {alternatives.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">Respaldos ({alternatives.length})</p>
          <ul className="space-y-1.5">
            {alternatives.map((a) => (
              <li key={a.candidate.id} className="flex items-center justify-between rounded-[8px] border border-line bg-bg px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  {(a.candidate.audio_languages ?? []).map((l) => <Chip key={l}>{l}</Chip>)}
                  <span className="text-ink-3">{a.candidate.resolution_height ?? "—"}p</span>
                </span>
                <span className="font-mono text-[11px] text-ink-3">score {a.score}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">Descartadas ({rejected.length})</p>
          <ul className="space-y-1">
            {rejected.map((r) => (
              <li key={r.candidate.id} className="flex items-center gap-2 text-[13px] text-ink-3">
                <XCircle size={13} className="text-crit" />
                {r.candidate.resolution_height ?? "—"}p · {(r.candidate.audio_languages ?? []).join(",") || "—"}
                <span className="text-crit">— {r.rejectionReason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
