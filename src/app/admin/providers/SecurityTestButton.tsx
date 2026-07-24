"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { runProviderSecurityTest } from "../actions";

/** Dispara la prueba de seguridad estática del proveedor y muestra el resultado. */
export function SecurityTestButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runProviderSecurityTest(id);
            if (res?.error) setMsg({ ok: false, text: res.error });
            else if (res?.warnings?.length) setMsg({ ok: true, text: res.warnings.join(" ") });
            else setMsg({ ok: true, text: "Sin observaciones. Compatible con sandbox." });
          })
        }
        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-bg px-3 py-1.5 text-[12px] font-medium text-ink-2 transition hover:text-ink disabled:opacity-60"
      >
        <ShieldCheck size={13} /> {pending ? "Probando…" : "Probar seguridad"}
      </button>
      {msg && (
        <span className={`text-[11px] ${msg.ok ? "text-good" : "text-crit"}`}>{msg.text}</span>
      )}
    </div>
  );
}
