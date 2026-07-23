"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase para componentes del navegador (usa la anon key pública).
 * Cliente sin tipar a nivel de esquema: los resultados se validan/castean en la
 * capa de datos (`src/lib/data.ts`) contra los tipos de `@/lib/types/db`.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
