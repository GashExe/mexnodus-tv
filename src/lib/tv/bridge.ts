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

/**
 * Esquema propio que el APK intercepta en `shouldOverrideUrlLoading`.
 *
 * Se usó para pedirle al host un toque real en el centro del WebView, que era
 * la única forma de dar play dentro de un iframe cross-origin. Ya NO se emite
 * desde la web: EmbedMaster expone una API de comandos por `postMessage`
 * (`src/lib/embed/commands.ts`) que hace lo mismo de forma limpia y además
 * permite pausar, buscar y ajustar volumen.
 *
 * El APK conserva el interceptor a propósito, como red de seguridad: si algún
 * día un proveedor emitiera una navegación a este esquema, se descarta en vez
 * de dejar el WebView en una página de error.
 */
export const TV_HOST_SCHEME = "mxtv";
