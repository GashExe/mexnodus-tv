import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LinkForm } from "./LinkForm";

/**
 * Reclamo del código desde el móvil o el ordenador. Exige sesión: es
 * precisamente la sesión que se va a trasladar a la tele.
 */
export default async function LinkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/link");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Vincular una tele</h1>
        <p className="mt-1 text-sm text-ink-3">
          Escribe el código que aparece en la pantalla de tu Fire TV.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        <LinkForm />
      </div>

      <p className="mt-4 text-center text-sm text-ink-3">
        Se vinculará con <span className="text-ink-2">{user.email}</span>.
      </p>
    </div>
  );
}
