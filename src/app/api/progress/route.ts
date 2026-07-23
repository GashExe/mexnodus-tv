import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  media_title_id: z.string().uuid().optional(),
  episode_id: z.string().uuid().optional(),
  position_seconds: z.number().int().min(0),
  duration_seconds: z.number().int().min(0).nullable().optional(),
});

/** Guarda el progreso de reproducción. Llamado por sendBeacon desde el player. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no auth" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { media_title_id, episode_id, position_seconds, duration_seconds } = parsed.data;
  if (!media_title_id && !episode_id) return NextResponse.json({ error: "target" }, { status: 400 });

  const percent = duration_seconds ? Math.min(100, (position_seconds / duration_seconds) * 100) : 0;
  const completed = percent >= 92;

  const { error } = await supabase.from("watch_progress").upsert(
    {
      user_id: user.id,
      media_title_id: media_title_id ?? null,
      episode_id: episode_id ?? null,
      position_seconds,
      duration_seconds: duration_seconds ?? null,
      percent,
      completed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: media_title_id ? "user_id,media_title_id" : "user_id,episode_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // registro en historial (append-only)
  await supabase.from("watch_history").insert({
    user_id: user.id,
    media_title_id: media_title_id ?? null,
    episode_id: episode_id ?? null,
  });

  return NextResponse.json({ ok: true, percent, completed });
}
