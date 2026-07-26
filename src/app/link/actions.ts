"use server";

import { headers } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalizeCode, isValidCodeShape, isPairingUsable, type PairingRow } from "@/lib/tv/pairing";
import { consumeAttempt } from "@/lib/tv/rate-limit";

export interface ClaimState {
  ok: boolean;
  message: string;
}

/** 10 intentos cada 5 minutos por IP: de sobra para teclear mal, insuficiente para barrer códigos. */
const CLAIM_LIMIT = 10;
const CLAIM_WINDOW_MS = 5 * 60 * 1000;

/**
 * Reclama un código desde un dispositivo YA autenticado (el móvil del usuario).
 *
 * Esto no entrega ninguna sesión: solo marca de quién es el emparejamiento. La
 * tele recoge la sesión en su siguiente sondeo, y para eso necesita el
 * `device_secret`, que nunca sale de ella.
 */
export async function claimPairing(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión para vincular una tele." };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
  const limit = consumeAttempt(`claim:${ip}`, CLAIM_LIMIT, CLAIM_WINDOW_MS);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `Demasiados intentos. Espera ${limit.retryAfterSeconds} segundos.`,
    };
  }

  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!isValidCodeShape(code)) {
    return { ok: false, message: "El código son 6 caracteres. Revísalo." };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("tv_pairings")
    .select("id, expires_at, consumed_at, claimed_by")
    .eq("code", code)
    .maybeSingle();

  const row = data as (PairingRow & { id: string }) | null;
  // Mensaje idéntico para inexistente y caducado: distinguirlos convertiría esto
  // en un oráculo para saber qué códigos están vivos.
  if (!row || !isPairingUsable(row)) {
    return { ok: false, message: "Código no válido o caducado. Genera uno nuevo en la tele." };
  }
  if (row.claimed_by) {
    return { ok: false, message: "Ese código ya se usó. Genera uno nuevo en la tele." };
  }

  const { error } = await admin
    .from("tv_pairings")
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq("id", row.id)
    // Condición de carrera: si otro reclamo entró primero, este update no toca
    // ninguna fila y no se pisa la sesión ajena.
    .is("claimed_by", null);

  if (error) {
    return { ok: false, message: "No se pudo vincular. Inténtalo de nuevo." };
  }

  return { ok: true, message: "¡Listo! Tu tele se desbloqueará en unos segundos." };
}
