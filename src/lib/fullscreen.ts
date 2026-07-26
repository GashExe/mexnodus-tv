/**
 * Pantalla completa entre navegadores
 * ===================================
 * Safari de iPhone NO expone `requestFullscreen` en un elemento cualquiera: allí
 * SOLO el `<video>` puede ir a pantalla completa, mediante `webkitEnterFullscreen()`.
 * Sin esta cascada, el botón de pantalla completa del directo no hacía nada en
 * móvil — y encima sin lanzar error, porque la llamada iba con optional chaining
 * (`el.requestFullscreen?.()`), que se traga la ausencia del método en silencio.
 *
 * Afecta solo a EN VIVO: en VOD el `<video>` lleva `controls` nativos, y esos ya
 * traen su propio botón de pantalla completa que iOS sí implementa.
 *
 * Módulo PURO respecto al DOM: recibe los elementos y el documento, no los busca
 * por su cuenta. Así se testea con dobles, sin navegador (vitest corre en node).
 */

/** Contenedor que además puede exponer la API antigua de WebKit (iPad, Safari viejo). */
export type FullscreenContainer = HTMLElement & {
  webkitRequestFullscreen?: () => unknown;
};

/** `<video>` con la API exclusiva de iPhone. */
export type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => unknown;
};

/** Documento con los alias de WebKit para consultar y salir. */
export type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => unknown;
};

/**
 * Vía usada para entrar. `null` = el navegador no ofrece ninguna, y quien llama
 * puede decidir ocultar el botón en vez de dejarlo muerto.
 */
export type FullscreenStrategy = "standard" | "webkit-element" | "webkit-video" | null;

/** Ignora el rechazo de las variantes que devuelven promesa (p.ej. sin gesto de usuario). */
function swallow(result: unknown): void {
  if (result instanceof Promise) void result.catch(() => {});
}

/** ¿Hay algo en pantalla completa ahora mismo? Contempla el alias de WebKit. */
export function isFullscreen(doc: FullscreenDocument): boolean {
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Entra en pantalla completa probando, en orden: el estándar sobre el contenedor
 * (escritorio y Android), la variante WebKit sobre el contenedor (iPad y Safari
 * antiguo) y, como último recurso, el `<video>` (iPhone, donde es la única).
 *
 * OJO con la tercera vía: iOS entrega su reproductor nativo, así que los
 * controles propios se sustituyen por los del sistema mientras dure. Es
 * inevitable, y mejor que quedarse sin pantalla completa.
 */
export function enterFullscreen(
  container: FullscreenContainer | null,
  video: FullscreenVideo | null,
): FullscreenStrategy {
  if (container?.requestFullscreen) {
    swallow(container.requestFullscreen());
    return "standard";
  }
  if (container?.webkitRequestFullscreen) {
    swallow(container.webkitRequestFullscreen());
    return "webkit-element";
  }
  if (video?.webkitEnterFullscreen) {
    swallow(video.webkitEnterFullscreen());
    return "webkit-video";
  }
  return null;
}

/** Sale de pantalla completa por la vía que ofrezca el documento. */
export function exitFullscreen(doc: FullscreenDocument): void {
  if (doc.exitFullscreen) {
    swallow(doc.exitFullscreen());
    return;
  }
  if (doc.webkitExitFullscreen) swallow(doc.webkitExitFullscreen());
}

/**
 * Alterna pantalla completa. Devuelve la vía usada al entrar, o `null` si salió
 * o si el navegador no ofrece ninguna.
 */
export function toggleFullscreen(
  container: FullscreenContainer | null,
  video: FullscreenVideo | null,
  doc: FullscreenDocument,
): FullscreenStrategy {
  if (isFullscreen(doc)) {
    exitFullscreen(doc);
    return null;
  }
  return enterFullscreen(container, video);
}
