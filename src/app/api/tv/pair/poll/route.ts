import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { pairingState, type PairingRow } from "@/lib/tv/pairing";

/**
 * Sondeo del emparejamiento desde la tele.
 *
 * Es POST, no GET, porque consume el emparejamiento y fija cookies de sesión: un
 * GET podría dispararlo un prefetch del navegador o un proxy y quemar el código
 * sin que nadie lo pidiera.
 *
 * Autoriza por `device_secret`, no por el código: el código se ve en la pantalla
 * del salón y solo sirve para que el dueño reclame desde su móvil. Ver el modelo
 * de amenaza en `supabase/migrations/0014_tv_pairing.sql`.
 */

const schema = z.object({
  id: z.string().uuid(),
  secret: z.string().min(32),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "params: id,secret" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("tv_pairings")
    .select("id, device_secret, expires_at, consumed_at, claimed_by")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const row = data as (PairingRow & { id: string; device_secret: string }) | null;
  // Mismo error para "no existe" y "secreto incorrecto": distinguirlos permitiría
  // enumerar identificadores válidos.
  if (!row || row.device_secret !== parsed.data.secret) {
    return NextResponse.json({ state: "expired" as const });
  }

  const state = pairingState(row);
  if (state !== "claimed") {
    return NextResponse.json({ state });
  }

  // ── Reclamado: se monta la sesión en ESTA respuesta ──────────────────────
  // Supabase no expone "crear sesión para el usuario X", así que se genera un
  // enlace mágico con el service-role (que NO envía correo: solo devuelve el
  // token) y se canjea acto seguido con el cliente ligado a cookies. El efecto
  // es el mismo que si el usuario hubiera pinchado el enlace en esta pestaña.
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(row.claimed_by!);
  const email = userData?.user?.email;
  if (userError || !email) {
    return NextResponse.json({ state: "expired" as const });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("[tv/pair] no se pudo generar el enlace de sesión:", linkError?.message);
    return NextResponse.json({ error: "no se pudo completar el emparejamiento" }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (otpError) {
    console.error("[tv/pair] no se pudo canjear el token:", otpError.message);
    return NextResponse.json({ error: "no se pudo completar el emparejamiento" }, { status: 500 });
  }

  // Un solo uso: se marca DESPUÉS de que la sesión exista, para que un fallo
  // intermedio deje el código todavía utilizable en el siguiente sondeo.
  await admin
    .from("tv_pairings")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return NextResponse.json({ state: "claimed" as const });
}
