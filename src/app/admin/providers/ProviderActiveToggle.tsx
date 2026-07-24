"use client";

import { useState, useTransition } from "react";
import { Power } from "lucide-react";
import { setProviderActive } from "../actions";

/** Activa/desactiva un proveedor; al cambiar, la CSP `frame-src` se recalcula. */
export function ProviderActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(active);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const res = await setProviderActive(id, !on);
            if (res?.error) setErr(res.error);
            else setOn(!on);
          })
        }
        aria-pressed={on}
        title={on ? "Desactivar" : "Activar"}
        className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
          on ? "border-good/40 bg-good/10 text-good" : "border-line bg-bg text-ink-3 hover:text-ink"
        }`}
      >
        <Power size={12} /> {pending ? "…" : on ? "Activo" : "Inactivo"}
      </button>
      {err && <span className="text-[10px] text-crit">{err}</span>}
    </div>
  );
}
