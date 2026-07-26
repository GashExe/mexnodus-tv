/**
 * Detección de superficie (web vs TV)
 * ===================================
 * El middleware marca cada petición con esta cabecera y el layout raíz la lee
 * para decidir dos cosas: si escala la tipografía en `<html>` (la clase
 * `tv-scale`, ver globals.css — `rem` solo mira al elemento raíz, así que no se
 * puede resolver desde un layout anidado) y si oculta el cromo de escritorio
 * (`TopNav`, contenedor centrado, footer).
 *
 * Es una cabecera de PETICIÓN inyectada por nuestro propio middleware, no algo
 * que el cliente pueda enviar: `NextResponse.next({ request: { headers } })`
 * reescribe las cabeceras que ven los componentes de servidor, así que un valor
 * que venga de fuera queda sobrescrito.
 */

export const SURFACE_HEADER = "x-mx-surface";

export type Surface = "web" | "tv";

/** Token que el APK añade a su User-Agent. Ver firetv/MainActivity.kt. */
export const TV_USER_AGENT_TOKEN = "MexNodusTV/";

/** Prefijo de las rutas de la superficie de TV. */
export const TV_PATH_PREFIX = "/tv";

/** ¿Esta ruta pertenece a la superficie de TV? */
export function isTvPath(pathname: string): boolean {
  return pathname === TV_PATH_PREFIX || pathname.startsWith(`${TV_PATH_PREFIX}/`);
}

/**
 * La superficie se decide SOLO por la ruta, no por el User-Agent, para que el
 * cromo que renderiza el layout raíz siempre coincida con la página servida. Si
 * dependiera del UA, el APK entrando por `/movies` recibiría el layout de tele
 * envolviendo una página de escritorio.
 */
export function detectSurface(pathname: string): Surface {
  return isTvPath(pathname) ? "tv" : "web";
}

/**
 * ¿La petición viene del APK de Fire TV? Solo se usa para redirigir la raíz a
 * `/tv`: el APK carga el dominio a secas y a partir de ahí toda la navegación
 * son enlaces `/tv/...`, así que no hace falta reescribir ninguna otra ruta (y
 * conviene no tocar `/api/...` ni `/auth/callback`).
 */
export function isTvClient(userAgent: string | null): boolean {
  return Boolean(userAgent?.includes(TV_USER_AGENT_TOKEN));
}
