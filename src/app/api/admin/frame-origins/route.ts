import { NextResponse } from "next/server";
import { getActor, isStaff } from "@/lib/auth";
import { getEmbedFrameOrigins } from "@/lib/security/frame-origins";

// Node runtime (usa service-role vía frame-origins) y siempre dinámico.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico de la CSP dinámica: devuelve los orígenes `frame-src` detectados en
 * este momento a partir de los proveedores `pattern-embed` activos. `?fresh=1`
 * evita la caché corta. Solo staff.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const { origins, error, cached } = await getEmbedFrameOrigins({ fresh });

  return NextResponse.json(
    {
      // youtube-nocookie siempre está permitido (tráilers TMDB); el resto es dinámico.
      frameSrc: ["https://www.youtube-nocookie.com", ...origins],
      embedOrigins: origins,
      count: origins.length,
      cached,
      error: error?.message ?? null,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
