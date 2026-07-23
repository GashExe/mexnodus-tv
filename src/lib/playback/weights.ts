import type { LangCode } from "@/lib/types/db";

/**
 * Pesos configurables del Playback Selection Engine.
 * NO están enterrados en el algoritmo: viven aquí y pueden persistirse en
 * `playback_scores`/config de Supabase y sobreescribirse por usuario o admin.
 *
 * Cada factor produce una contribución en 0..1 que se multiplica por su peso.
 * La puntuación final es la suma ponderada (mayor = mejor).
 */
export interface PlaybackWeights {
  audioLatam: number;
  audioSpanish: number;
  audioSpanishES: number;
  subtitlesSpanish: number;
  resolution: number;
  bitrate: number;
  hdr: number;
  audioChannels: number;
  stability: number;
  startupSpeed: number;
  recentlyVerified: number;
  providerTrust: number;
  deviceCompatibility: number;
  authorization: number;
  geoAllowed: number;
}

/**
 * Perfil por defecto: prioriza español latino y estabilidad por encima de
 * resolución cruda. Coincide con el ejemplo del brief:
 *   audio es-MX/es-419 › audio es › audio es-ES › subs es › estabilidad › 1080p+ › bitrate › inicio
 */
export const DEFAULT_WEIGHTS: PlaybackWeights = {
  audioLatam: 30,
  audioSpanish: 18,
  audioSpanishES: 12,
  subtitlesSpanish: 10,
  resolution: 9,
  bitrate: 5,
  hdr: 3,
  audioChannels: 3,
  stability: 14,
  startupSpeed: 6,
  recentlyVerified: 6,
  providerTrust: 8,
  deviceCompatibility: 7,
  authorization: 20,
  geoAllowed: 10,
};

/** Preferencias que entran al motor (derivadas de user_preferences). */
export interface SelectionPreferences {
  audioPriority: LangCode[];
  subtitlePriority: LangCode[];
  maxResolution: number; // 480|720|1080|2160
  preferHdr: boolean;
  country: string; // ISO-3166 alpha-2, p.ej. "MX"
}

/** Capacidades del dispositivo/cliente que reproduce. */
export interface DeviceCapabilities {
  maxResolution: number; // 480|720|1080|2160
  hevc: boolean; // soporte H.265
  hdr: boolean;
  dolbyVision: boolean;
  surround: boolean; // salida 5.1+
  supportsHls: boolean;
  supportsDash: boolean;
}

export const DEFAULT_DEVICE: DeviceCapabilities = {
  maxResolution: 1080,
  hevc: true,
  hdr: false,
  dolbyVision: false,
  surround: false,
  supportsHls: true,
  supportsDash: true,
};
