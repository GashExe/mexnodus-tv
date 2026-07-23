import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  media_title_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  on: z.boolean(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no auth" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { media_title_id, channel_id, on } = body.data;
  if (!media_title_id && !channel_id) return NextResponse.json({ error: "target requerido" }, { status: 400 });

  if (on) {
    const { error } = await supabase
      .from("user_favorites")
      .upsert({ user_id: user.id, media_title_id: media_title_id ?? null, channel_id: channel_id ?? null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    let del = supabase.from("user_favorites").delete().eq("user_id", user.id);
    del = media_title_id ? del.eq("media_title_id", media_title_id) : del.eq("channel_id", channel_id!);
    await del;
  }
  return NextResponse.json({ ok: true, favorite: on });
}
