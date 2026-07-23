import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdminSDK } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente Supabase para Server Components / Route Handlers.
 * Respeta RLS: opera como el usuario autenticado a través de sus cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Invocado desde un Server Component sin respuesta mutable: ignorable,
            // el middleware refresca la sesión.
          }
        },
      },
    },
  );
}

/**
 * Cliente administrativo con service-role. SALTA RLS.
 * Úsalo SOLO en el servidor y SOLO tras verificar el rol del actor.
 * Nunca lo expongas a un Client Component.
 */
export function createAdminClient() {
  return createAdminSDK(publicEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
