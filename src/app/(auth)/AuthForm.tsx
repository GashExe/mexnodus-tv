"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, null as { error?: string } | null);
  const isLogin = mode === "login";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[16px] bg-gradient-to-br from-accent to-accent-2 text-2xl font-bold text-white shadow-glow">
          M
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLogin ? "Entra a MexNodus TV" : "Crea tu cuenta"}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {isLogin ? "Continúa viendo donde lo dejaste." : "Tu catálogo, en todos tus dispositivos."}
        </p>
      </div>

      <form action={formAction} className="space-y-3 rounded-card border border-line bg-surface p-6 shadow-card">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-[10px] border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
            placeholder="tucorreo@ejemplo.com"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">Contraseña</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="w-full rounded-[10px] border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
            placeholder="Mínimo 8 caracteres"
          />
        </label>

        {state?.error && (
          <p className="rounded-[10px] border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-pill bg-accent py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Un momento…" : isLogin ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-3">
        {isLogin ? (
          <>
            ¿Sin cuenta?{" "}
            <Link href="/register" className="text-accent hover:underline">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Entra
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
