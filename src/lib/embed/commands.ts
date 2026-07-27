/**
 * Protocolo de comandos del player de EmbedMaster
 * ==============================================
 * El proveedor expone una API por `postMessage` que permite controlar la
 * reproducción desde el documento padre: play, pausa, búsqueda, volumen y
 * pantalla completa. Y emite eventos de vuelta.
 *
 * Esto cambia por completo el problema del mando: hasta ahora, dar play dentro
 * de un `<iframe>` cross-origin solo era posible simulando un toque real del
 * sistema operativo desde el APK — frágil, dependiente de dónde dibujara el
 * proveedor su botón, e imposible en un navegador normal. Con esta API se puede
 * ofrecer una barra de controles de verdad, enfocable con el D-pad.
 *
 * OJO: `postMessage` a un iframe que no entienda el protocolo simplemente se
 * ignora, así que enviar comandos es inofensivo aunque la fuente sea de otro
 * proveedor. Lo que NO se puede es dar por hecho que hay alguien escuchando.
 *
 * Módulo puro: no toca el DOM ni conoce React. La cáscara está en Player.tsx.
 */

/** `source` que espera el player en los mensajes que le enviamos. */
export const EMBED_COMMAND_SOURCE = "embedmaster_player_command";

/** `source` con el que el player marca los eventos que emite. */
export const EMBED_EVENT_SOURCE = "embedmaster_player";

export type EmbedCommand =
  | "play"
  | "pause"
  | "seek" // value = segundos absolutos
  | "mute"
  | "unmute"
  | "volume" // value = 0..100
  | "fullscreen";

export interface EmbedCommandMessage {
  source: typeof EMBED_COMMAND_SOURCE;
  command: EmbedCommand;
  value?: number;
}

/**
 * Construye el mensaje de comando. `value` se omite cuando no aplica en lugar
 * de mandarse como `undefined`: algunos players comprueban la presencia de la
 * clave, no su valor.
 */
export function buildEmbedCommand(command: EmbedCommand, value?: number): EmbedCommandMessage {
  const msg: EmbedCommandMessage = { source: EMBED_COMMAND_SOURCE, command };
  if (typeof value === "number" && Number.isFinite(value)) msg.value = value;
  return msg;
}

/** Volumen en 0..100, redondeado y acotado, que es lo que espera el proveedor. */
export function volumeCommand(percent: number): EmbedCommandMessage {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return buildEmbedCommand("volume", clamped);
}

/** Búsqueda a un segundo absoluto. Los negativos se llevan a 0. */
export function seekCommand(seconds: number): EmbedCommandMessage {
  return buildEmbedCommand("seek", Math.max(0, Math.round(seconds)));
}

export interface EmbedPlayerEvent {
  event: string;
  info?: unknown;
}

/**
 * Reconoce un evento emitido por el player del proveedor.
 *
 * Devuelve `null` para cualquier otra cosa — y eso importa: en la ventana caen
 * también los mensajes del escudo de embeds (`secure-embed-shield`), los de
 * terceros y los de extensiones. Nunca se asume que un `message` es nuestro.
 */
export function parseEmbedPlayerEvent(data: unknown): EmbedPlayerEvent | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== EMBED_EVENT_SOURCE) return null;
  if (typeof d.event !== "string" || d.event.length === 0) return null;
  return { event: d.event, info: d.info };
}

/**
 * Traduce un evento del proveedor al estado de reproducción, o `null` si el
 * evento no dice nada al respecto (`timeupdate`, `ready`, telemetría…).
 */
export function playingStateFromEvent(event: string): boolean | null {
  switch (event) {
    case "play":
    case "playing":
      return true;
    case "pause":
    case "paused":
    case "ended":
      return false;
    default:
      return null;
  }
}
