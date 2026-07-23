"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Activity } from "lucide-react";
import { approveAvailability, rejectAvailability, mockValidate } from "../actions";

export function ReviewActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r?.error ? `Error: ${r.error}` : okMsg);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => run(() => mockValidate(id), "Validada (mock)")}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
      >
        <Activity size={14} /> Validar (mock)
      </button>
      <button
        onClick={() => run(() => approveAvailability(id, true), "Aprobada y autorizada")}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-pill bg-good/15 px-3 py-1.5 text-sm font-medium text-good hover:bg-good/25"
      >
        <CheckCircle2 size={14} /> Aprobar + autorizar
      </button>
      <button
        onClick={() => run(() => rejectAvailability(id), "Rechazada")}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-pill bg-crit/15 px-3 py-1.5 text-sm font-medium text-crit hover:bg-crit/25"
      >
        <XCircle size={14} /> Rechazar
      </button>
      {msg && <span className="font-mono text-[11px] text-ink-3">{msg}</span>}
    </div>
  );
}
