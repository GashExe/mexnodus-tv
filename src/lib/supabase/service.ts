import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente Supabase con la llave service-role (salta RLS).
 * ======================================================
 * Para trabajos fuera de una petición HTTP: scripts de mantenimiento y el job
 * nocturno. El cliente de `server.ts` va con las cookies del usuario y por tanto
 * queda sujeto a RLS, que en `channel_streams` solo deja leer lo aprobado y
 * autorizado — inservible para un barrido de salud.
 *
 * NO se marca con `server-only`: este módulo tiene que poder importarse desde un
 * script de Node (`scripts/nightly.ts`), y ese paquete ni siquiera está instalado.
 * La protección real la da el getter `serverEnv.serviceRoleKey`, que lanza si se
 * lee fuera del servidor; aun así, NUNCA importar esto desde un Client Component.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(publicEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
