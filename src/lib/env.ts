/**
 * Acceso centralizado y validado a variables de entorno.
 * Separa estrictamente lo público (NEXT_PUBLIC_*) de lo secreto.
 * Los getters de secretos lanzan si se invocan en el cliente.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno: ${name}`);
  return value;
}

const isServer = typeof window === "undefined";

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

/** Solo servidor. Nunca importar el resultado en un Client Component. */
export const serverEnv = {
  get serviceRoleKey() {
    if (!isServer) throw new Error("serviceRoleKey solo puede leerse en el servidor");
    return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get tmdbToken() {
    if (!isServer) throw new Error("tmdbToken solo puede leerse en el servidor");
    return process.env.TMDB_ACCESS_TOKEN ?? "";
  },
  get validationWorkerSecret() {
    if (!isServer) throw new Error("validationWorkerSecret solo puede leerse en el servidor");
    return process.env.VALIDATION_WORKER_SECRET ?? "";
  },
  tmdbLanguage: process.env.TMDB_DEFAULT_LANGUAGE ?? "es-MX",
  tmdbRegion: process.env.TMDB_DEFAULT_REGION ?? "MX",
  anilistEnabled: (process.env.ANILIST_ENABLED ?? "false") === "true",
};

export const hasTmdb = () => isServer && !!process.env.TMDB_ACCESS_TOKEN;
export const hasSupabase = () => !!publicEnv.supabaseUrl && !!publicEnv.supabaseAnonKey;
