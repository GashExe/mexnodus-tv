import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePlayback } from "@/lib/playback/resolve";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["title", "episode", "channel"]),
  id: z.string().uuid(),
});

/**
 * Ejecuta el Playback Selection Engine para un contenido y devuelve la fuente
 * elegida, alternativas, descartadas y razones. Útil para clientes de Smart TV
 * / móviles que consumirán este núcleo vía HTTP.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({ type: searchParams.get("type"), id: searchParams.get("id") });
  if (!parsed.success) return NextResponse.json({ error: "params: type,id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { result } = await resolvePlayback(
    { kind: parsed.data.type, id: parsed.data.id },
    user?.id ?? null,
  );

  return NextResponse.json({
    primary: result.primary
      ? { id: result.primary.candidate.id, url: result.primary.candidate.play_url, score: result.primary.score, reasons: result.primary.reasons }
      : null,
    fallbacks: result.fallbacks.map((f) => ({ id: f.candidate.id, url: f.candidate.play_url, score: f.score })),
    rejected: result.rejected.map((r) => ({ id: r.candidate.id, reason: r.rejectionReason })),
    evaluatedAt: result.evaluatedAt,
  });
}
