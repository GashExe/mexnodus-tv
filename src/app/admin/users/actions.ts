"use server";

import { createClient } from "@/lib/supabase/server";
import { getActor } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({ userId: z.string().uuid(), role: z.enum(["user", "reviewer", "admin"]) });

/** Cambiar el rol de un usuario. Solo admin (RLS lo refuerza). */
export async function setUserRole(userId: string, role: string) {
  const actor = await getActor();
  if (!actor || actor.role !== "admin") return { error: "Solo un admin puede cambiar roles" };
  const parsed = schema.safeParse({ userId, role });
  if (!parsed.success) return { error: "Datos inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role: parsed.data.role }).eq("id", parsed.data.userId);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    action: "user.role_change",
    entity: "profiles",
    entity_id: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}
