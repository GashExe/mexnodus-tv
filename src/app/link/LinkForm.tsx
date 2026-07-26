"use client";

import { useActionState } from "react";
import { claimPairing, type ClaimState } from "./actions";
import { CODE_LENGTH } from "@/lib/tv/pairing";

const INITIAL: ClaimState = { ok: false, message: "" };

export function LinkForm() {
  const [state, formAction, pending] = useActionState(claimPairing, INITIAL);

  if (state.ok) {
    return (
      <p className="rounded-[10px] border border-good/40 bg-good/10 px-4 py-3 text-sm text-good">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-ink-2">Código de la tele</span>
        <input
          name="code"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={CODE_LENGTH + 2}
          placeholder="ABC234"
          className="w-full rounded-[10px] border border-line bg-bg px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] text-ink outline-none focus:border-accent"
        />
      </label>

      {state.message && (
        <p className="rounded-[10px] border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-pill bg-accent py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Vinculando…" : "Vincular tele"}
      </button>
    </form>
  );
}
