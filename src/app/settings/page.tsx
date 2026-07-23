import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";
import { Eyebrow } from "@/components/ui";
import type { UserPreferences } from "@/lib/types/db";
import { DEFAULT_AUDIO_PRIORITY, DEFAULT_SUBTITLE_PRIORITY } from "@/lib/language";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
  const prefs: UserPreferences =
    (data as UserPreferences) ?? {
      user_id: user.id,
      audio_priority: DEFAULT_AUDIO_PRIORITY,
      subtitle_priority: DEFAULT_SUBTITLE_PRIORITY,
      max_resolution: 1080,
      autoplay_next: true,
      data_saver: false,
      prefer_hdr: false,
      player_prefs: {},
      updated_at: new Date().toISOString(),
    };

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Configuración</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Preferencias</h1>
        <p className="mt-1 text-sm text-ink-3">
          Prioridad por defecto: español latino → general → castellano → subtítulos en español.
        </p>
      </div>
      <SettingsForm prefs={prefs} />
    </div>
  );
}
