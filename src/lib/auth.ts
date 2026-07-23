import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/db";

/** Devuelve el usuario y su rol, o null si no hay sesión. */
export async function getActor(): Promise<{ id: string; email: string | null; role: AppRole } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { id: user.id, email: user.email ?? null, role: ((data as { role?: AppRole } | null)?.role ?? "user") };
}

export const isStaff = (role: AppRole) => role === "admin" || role === "reviewer";
