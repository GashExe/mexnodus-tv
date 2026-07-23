"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const langEnum = z.enum(["es-MX", "es-419", "es-ES", "es", "en", "pt-BR", "mul", "und"]);
const schema = z.object({
  audio_priority: z.array(langEnum).min(1),
  subtitle_priority: z.array(langEnum).min(1),
  max_resolution: z.coerce.number().refine((n) => [480, 720, 1080, 2160].includes(n)),
  autoplay_next: z.boolean(),
  data_saver: z.boolean(),
  prefer_hdr: z.boolean(),
  country: z.string().length(2),
});

export async function savePreferences(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión requerida" };

  const parsed = schema.safeParse({
    audio_priority: JSON.parse((formData.get("audio_priority") as string) || "[]"),
    subtitle_priority: JSON.parse((formData.get("subtitle_priority") as string) || "[]"),
    max_resolution: formData.get("max_resolution"),
    autoplay_next: formData.get("autoplay_next") === "on",
    data_saver: formData.get("data_saver") === "on",
    prefer_hdr: formData.get("prefer_hdr") === "on",
    country: (formData.get("country") as string)?.toUpperCase(),
  });
  if (!parsed.success) return { error: "Datos inválidos" };

  const { error } = await supabase
    .from("user_preferences")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // el país también vive en el perfil
  await supabase.from("profiles").update({ country: parsed.data.country }).eq("id", user.id);
  revalidatePath("/settings");
  return { ok: true };
}
