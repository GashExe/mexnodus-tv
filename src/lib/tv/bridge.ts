/**
 * Puente entre el APK de Fire TV y la web
 * =======================================
 * El WebView no puede inyectar teclado dentro de un `<iframe>` cross-origin, y
 * algunas teclas del mando (play/pausa, rebobinar) no llegan al DOM como
 * `keydown` en Fire OS. Así que el APK las captura en `onKeyDown` y las reenvía
 * llamando a `window.__mxTv.key(...)` con `evaluateJavascript`.
 *
 * `playbackKind` va en el sentido contrario: el APK lo LEE para decidir si una
 * pulsación de play/pausa la manda por aquí (`"video"`, hay un `<video>` que
 * controlar) o si tiene que simular un toque real en el centro del WebView
 * (`"embed"`, el player vive dentro de un iframe de otro origen y solo obedece a
 * un click de usuario a nivel de sistema operativo).
 *
 * Solo los tipos viven aquí. El objeto lo instala `SpatialNav`, que es el único
 * dueño, y el Player se registra con `setPlayer` cuando está en modo TV.
 */

/** Teclas que el APK sabe reenviar. Las flechas también llegan como `keydown` normal. */
export type TvKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "select"
  | "back"
  | "play_pause"
  | "rewind"
  | "forward";

/** Qué hay reproduciéndose ahora mismo, para que el APK sepa cómo mandar play/pausa. */
export type TvPlaybackKind = "embed" | "video";

/** Lo que el Player expone al puente mientras está montado en modo TV. */
export interface TvPlayerHandlers {
  kind: TvPlaybackKind;
  /** No-op cuando `kind` es `"embed"`: no hay `<video>` al que hablarle. */
  playPause(): void;
  /** Salto relativo en segundos. No-op en embed y en directo. */
  seek(deltaSeconds: number): void;
}

export interface TvBridge {
  /** Sube si cambia el contrato. El APK lo comprueba antes de usar teclas nuevas. */
  readonly version: 1;
  /** `true` si la web consumió la tecla; el APK puede caer a su comportamiento nativo si es `false`. */
  key(name: TvKey): boolean;
  /** `null` cuando no hay reproducción en pantalla. */
  playbackKind: TvPlaybackKind | null;
  /** El Player se registra al montar y pasa `null` al desmontar. */
  setPlayer(handlers: TvPlayerHandlers | null): void;
}

declare global {
  interface Window {
    __mxTv?: TvBridge;
  }
}

/** Esquema propio que el APK intercepta en `shouldOverrideUrlLoading`. */
export const TV_HOST_SCHEME = "mxtv";

/**
 * Pide al APK un toque real en el centro del WebView.
 *
 * Sigue haciendo falta pese a tener la API de comandos de EmbedMaster: el player
 * del proveedor **exige un gesto de usuario real** para arrancar (política de
 * autoplay), y un `postMessage` no lo es. Comprobado en el aparato: el comando
 * `play` llega y no pasa nada, mientras el botón central del proveedor sigue
 * esperando un click.
 *
 * Un toque a nivel de sistema operativo sí lo enruta Chromium hasta el iframe y
 * cuenta como activación de usuario. Los comandos por `postMessage` sí valen
 * para pausar, buscar y ajustar volumen una vez arrancado.
 *
 * Se hace navegando a `mxtv://tap-center` y NO con `addJavascriptInterface`: ese
 * expone un objeto Java que en varias versiones de WebView también alcanzan los
 * iframes — y aquí el iframe es de un tercero. Con el esquema no se expone nada,
 * y el APK rechaza la petición si no viene del documento principal.
 *
 * Devuelve `false` fuera del APK (en un navegador no hay a quién pedírselo).
 */
export function requestHostTapCenter(): boolean {
  if (typeof window === "undefined") return false;
  if (!navigator.userAgent.includes("MexNodusTV/")) return false;
  window.location.href = `${TV_HOST_SCHEME}://tap-center`;
  return true;
}

/**
 * Toque real en un punto concreto del elemento indicado.
 *
 * Mejor que `requestHostTapCenter`: el centro del WebView casi nunca coincide
 * con el centro del iframe (hay nav lateral, cabecera, la barra de señal
 * debajo…), así que el toque a ciegas caía fuera del botón del proveedor.
 * Aquí se calcula el centro real del iframe y se manda en píxeles de vista.
 *
 * `getBoundingClientRect` da píxeles CSS relativos al viewport; el
 * `dispatchTouchEvent` del lado nativo trabaja en píxeles de vista, así que se
 * multiplica por `devicePixelRatio` — en un Fire TV suelen diferir por 1.5 o 2.
 */
export function requestHostTapOn(el: Element | null): boolean {
  if (typeof window === "undefined" || !el) return false;
  if (!navigator.userAgent.includes("MexNodusTV/")) return false;

  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;

  const dpr = window.devicePixelRatio || 1;
  const x = Math.round((r.left + r.width / 2) * dpr);
  const y = Math.round((r.top + r.height / 2) * dpr);
  window.location.href = `${TV_HOST_SCHEME}://tap?x=${x}&y=${y}`;
  return true;
}
