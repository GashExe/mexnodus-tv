"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Info,
  RefreshCw,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Radio,
  Settings2,
  Check,
} from "lucide-react";
import {
  EMBED_ALLOW,
  EMBED_REFERRER_POLICY,
  EMBED_LOAD_TIMEOUT_MS,
  SHIELD_EVENT_SOURCE,
  isCriticalEmbedEvent,
  type EmbedEventKind,
  type ReferrerPolicyValue,
} from "@/lib/security/embed-shield";
import { toggleFullscreen as toggleFullscreenFor } from "@/lib/fullscreen";
import { requestHostTapCenter } from "@/lib/tv/bridge";

export interface PlayerSource {
  id: string;
  url: string;
  playbackType: "hls" | "dash" | "file" | "embed" | "jellyfin" | "iptv";
  label: string;
  reasons?: string[];
  score?: number;
  resolutionHeight?: number | null;
  audioLanguages?: string[];
  /** Política de referrer del iframe, configurable por proveedor (fuentes embed). */
  referrerPolicy?: ReferrerPolicyValue;
}

export interface PlayerProps {
  sources: PlayerSource[]; // ordenadas: [primaria, ...fallbacks]
  title: string;
  subtitle?: string;
  isLive?: boolean;
  initialPosition?: number;
  progressKey?: { media_title_id?: string; episode_id?: string }; // null en canales
  onEnded?: () => void;
  /**
   * Modo TV (Fire TV, mando a distancia). Sustituye los `controls` nativos del
   * VOD por la barra propia: los del navegador se recorren fatal con D-pad
   * (el foco entra en un shadow DOM que no controlamos) y a tres metros son
   * diminutos. También registra el player en `window.__mxTv` para que el APK
   * pueda mandarle las teclas de reproducción del mando.
   */
  tv?: boolean;
}

type Status = "loading" | "playing" | "switching" | "error" | "exhausted";

/** mm:ss, o h:mm:ss si pasa de la hora. */
function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function Player({
  sources,
  title,
  subtitle,
  isLive = false,
  initialPosition = 0,
  progressKey,
  onEnded,
  tv = false,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [showInfo, setShowInfo] = useState(false);
  const current = sources[index];
  const isEmbed = current?.playbackType === "embed";

  // Barra propia: siempre en directo (no hay línea de tiempo que mostrar) y
  // también en VOD cuando estamos en TV (allí los `controls` nativos estorban).
  const customControls = isLive || tv;
  // La línea de tiempo solo tiene sentido en VOD: un directo no se busca.
  const showTimeline = customControls && !isLive;

  // ── controles propios (EN VIVO siempre; VOD solo en TV) ───────────────────
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);
  // Posición para la línea de tiempo. Solo se sigue cuando hay barra que pintar:
  // `timeupdate` dispara ~4 veces por segundo y en un Fire TV Stick eso cuesta.
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ── calidades del stream (niveles HLS) ────────────────────────────────────
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [level, setLevel] = useState(-1); // -1 = automática
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [showQuality, setShowQuality] = useState(false);

  const advancingRef = useRef(false);
  // ── failover de fuentes `embed` (iframe cross-origin) ─────────────────────
  const embedWatchdogRef = useRef<number | undefined>(undefined);
  // Un popup bloqueado por el sandbox es ÉXITO del escudo, NO un fallo: se cuenta
  // y se registra, pero jamás cambia el estado ni dispara failover.
  const [blockedPopups, setBlockedPopups] = useState(0);
  const playbackConfirmedRef = useRef(false); // el embed confirmó reproducción

  // ── fallback automático a la siguiente fuente aprobada ─────────────────────
  const handleFatal = useCallback(() => {
    if (advancingRef.current) return; // evita doble avance por errores repetidos
    advancingRef.current = true;
    setIndex((prev) => {
      const next = prev + 1;
      if (next < sources.length) {
        setStatus("switching");
        return next;
      }
      setStatus("exhausted");
      return prev;
    });
  }, [sources.length]);

  // ── carga de una fuente: prioriza hls.js; nativo como respaldo ─────────────
  // Ambas rutas enganchan el error → failover automático a la siguiente fuente.
  const load = useCallback(
    async (i: number) => {
      const source = sources[i];
      if (!source) return;

      // cancela el watchdog de un embed anterior
      window.clearTimeout(embedWatchdogRef.current);

      // Fuentes `embed`: se transmiten dentro de un <iframe> (contenido servido
      // por el proveedor). No pasan por hls.js/<video> ni por métricas locales;
      // el navegador las gestiona de forma aislada (cross-origin).
      if (source.playbackType === "embed") {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        setLevels([]);
        setLevel(-1);
        setAutoHeight(null);
        advancingRef.current = false;
        setStatus("switching");

        // NO se sondea la URL antes de framarla. Una `fetch` en modo `no-cors`
        // devuelve una respuesta OPACA: `status` siempre es 0, así que no puede
        // distinguir un 200 de un 403 — nunca pudo diagnosticar nada. A cambio
        // costaba: duplicaba la petición al proveedor, retrasaba el iframe y, en
        // Safari, la petición se cancela por Cross-Origin-Resource-Policy sobre
        // la MISMA URL que el iframe necesita, llenando la consola de errores que
        // enmascaraban el fallo real. La salud de la carga la vigila el watchdog.
        setStatus("playing"); // el iframe (render por JSX) muestra el reproductor
        // Watchdog: si el iframe no dispara `onLoad` a tiempo (servidor colgado o
        // framing bloqueado por X-Frame-Options), ESO sí es un fallo real → salta
        // a la siguiente señal.
        embedWatchdogRef.current = window.setTimeout(() => handleFatal(), EMBED_LOAD_TIMEOUT_MS);
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      setStatus("switching");
      advancingRef.current = false; // nueva carga: rearma la detección de fallo

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.onerror = null;
      video.onplaying = () => setStatus("playing");
      // cada señal declara sus propias calidades
      setLevels([]);
      setLevel(-1);
      setAutoHeight(null);

      const isHls = source.playbackType === "hls" || source.url.includes(".m3u8");

      if (isHls) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: isLive, backBufferLength: 30 });
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // calidades disponibles: dedup por altura, de mayor a menor
            const seen = new Set<number>();
            const lv: { index: number; height: number }[] = [];
            hls.levels.forEach((l, i) => {
              if (l.height && !seen.has(l.height)) {
                seen.add(l.height);
                lv.push({ index: i, height: l.height });
              }
            });
            setLevels(lv.sort((a, b) => b.height - a.height));
            void video.play().catch(() => {});
            setStatus("playing");
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            setAutoHeight(hls.levels[data.level]?.height ?? null);
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) handleFatal();
          });
          hls.loadSource(source.url);
          hls.attachMedia(video);
          return;
        }
      }
      // Sin hls.js, un HLS solo se reproduce donde el navegador lo soporte de
      // forma nativa: Safari e iOS. El WebView de Android NO, y ahí asignar el
      // .m3u8 al <video> no lanza error ni fija `video.error`, así que el
      // failover de abajo nunca se dispara y la señal se queda en negro para
      // siempre, sin audio y sin mensaje. Se comprueba antes y se pasa a la
      // siguiente fuente en lugar de fingir que está reproduciendo.
      if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
        handleFatal();
        return;
      }

      // nativo (Safari/iOS o archivo directo): solo un error REAL de media
      // (`video.error` presente) dispara el failover. Los fallos de iconos
      // internos de los controles de Safari (PiP/AirPlay) no fijan `video.error`
      // ni disparan este handler, así que no cuentan como fallo de reproducción.
      video.src = source.url;
      video.onerror = () => {
        if (video.error) handleFatal();
      };
      video.play().then(() => setStatus("playing")).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, isLive],
  );

  useEffect(() => {
    // nueva fuente: rearma la confirmación de reproducción del embed
    playbackConfirmedRef.current = false;
    void load(index);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      window.clearTimeout(embedWatchdogRef.current);
    };
  }, [index, load]);

  // ── Señales de salud del embed (postMessage) ───────────────────────────────
  // Un embed COOPERANTE (p.ej. el reproductor de primera parte) puede informar
  // popups bloqueados, iconos que no cargan, arranque de reproducción o error.
  // Clasificamos: los benignos se cuentan/registran SIN cambiar de estado; solo
  // un `playback_error` explícito dispara el failover.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as { source?: string; kind?: EmbedEventKind } | null;
      if (!d || typeof d !== "object" || d.source !== SHIELD_EVENT_SOURCE || !d.kind) return;
      const kind = d.kind;

      if (kind === "popup_blocked") {
        // Un popup bloqueado (por el host NATIVO en Electron/Android/iOS, o por el
        // bloqueador del navegador) es benigno: se cuenta y registra, NUNCA degrada
        // el estado ni dispara failover. En la web NO usamos sandbox (ver iframe).
        setBlockedPopups((n) => n + 1);
        console.info("[embed] popup_blocked (no crítico): una ventana emergente fue bloqueada.");
        return;
      }
      if (kind === "playback_started" || kind === "iframe_loaded") {
        // Reproducción confirmada: cancela el vigía de carga (no habrá failover).
        playbackConfirmedRef.current = true;
        window.clearTimeout(embedWatchdogRef.current);
        setStatus("playing");
        return;
      }
      if (!isCriticalEmbedEvent(kind)) {
        // icon_load_failed / telemetry_failed: ruido benigno mientras reproduce.
        console.debug(`[embed] ${kind} (no crítico)`);
        return;
      }
      // playback_error: el embed declara que NO puede reproducir → fallo real.
      console.warn("[embed] playback_error: el proveedor no puede reproducir → siguiente fuente.");
      handleFatal();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleFatal]);

  // ── Fallo REAL de carga: el CSP `frame-src` rechaza el iframe ───────────────
  // Un rechazo de frame-src (p.ej. un redirect a un origen no autorizado) sí es
  // un fallo de carga: se salta a la siguiente fuente al instante, sin esperar
  // el vigía. NO se dispara por popups (los bloqueos de popup no son violaciones
  // de CSP y no emiten este evento).
  useEffect(() => {
    function onViolation(e: SecurityPolicyViolationEvent) {
      if (!e.violatedDirective.startsWith("frame-src")) return;
      const blocked = e.blockedURI ?? "";
      if (current?.url && blocked && current.url.startsWith(blocked)) {
        console.warn("[embed] frame-src rechazó el iframe (fallo de carga real) → siguiente fuente:", blocked);
        handleFatal();
      }
    }
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, [current?.url, handleFatal]);

  // sincroniza el estado play/pause del vídeo con la UI de controles propios
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  // los controles se ocultan tras 2.5s sin movimiento (solo mientras reproduce)
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  }, []);

  /**
   * Sin ratón, `wakeControls` nunca se llamaba (solo colgaba de `onMouseMove`),
   * así que el temporizador no se armaba y la barra se quedaba fija para siempre.
   * En TV se arma al empezar a reproducir. Se limita a `tv` a propósito: en la
   * web en vivo el comportamiento actual se queda exactamente como está.
   */
  useEffect(() => {
    if (tv && status === "playing") wakeControls();
  }, [tv, status, wakeControls]);

  /** Cualquier tecla del mando revive la barra, igual que un movimiento de ratón. */
  const onContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!customControls) return;
      wakeControls();
      // Si el foco está en un control, es suyo: el `range` de la línea de tiempo
      // usa izquierda/derecha y un `button` usa espacio/enter.
      if ((e.target as HTMLElement).closest("button, input, a, select")) return;
      if (e.key === " " || e.key === "MediaPlayPause") {
        e.preventDefault();
        togglePlay();
      }
    },
    [customControls, wakeControls, togglePlay],
  );

  /** Salto relativo, en segundos. No hace nada en embed (no hay `<video>`) ni en directo. */
  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration === 0) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = seconds;
    setTime(seconds);
  }, []);

  // Seguimiento de posición solo cuando hay línea de tiempo que pintar.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showTimeline) return;
    const onTime = () => setTime(v.currentTime);
    const onMeta = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
    };
  }, [showTimeline, index]);

  /**
   * Registro en el puente del APK. `kind` es lo que decide, del lado nativo, si
   * play/pausa se manda por aquí o se simula un toque real en el centro del
   * WebView — en un embed no hay `<video>` al que hablarle.
   */
  useEffect(() => {
    if (!tv) return;
    const bridge = window.__mxTv;
    if (!bridge) return;
    bridge.setPlayer({
      kind: isEmbed ? "embed" : "video",
      playPause: togglePlay,
      seek: seekBy,
    });
    return () => bridge.setPlayer(null);
  }, [tv, isEmbed, togglePlay, seekBy]);

  /** Cambia la calidad; -1 = automática. `nextLevel` evita el corte brusco. */
  const selectLevel = useCallback((idx: number) => {
    const hls = hlsRef.current;
    if (hls) hls.nextLevel = idx;
    setLevel(idx);
    setShowQuality(false);
  }, []);

  /**
   * "Al directo": salta al borde en vivo del stream (si hls.js lo conoce) o
   * recarga la señal — garantiza estar al corriente tras una pausa o un bache.
   */
  const goLive = useCallback(() => {
    const v = videoRef.current;
    const hls = hlsRef.current;
    if (v && hls?.liveSyncPosition) {
      v.currentTime = hls.liveSyncPosition;
      void v.play().catch(() => {});
    } else {
      void load(index);
    }
  }, [index, load]);

  // Safari de iPhone no permite pantalla completa sobre un `<div>`: solo sobre el
  // `<video>`. La cascada de compatibilidad vive en `@/lib/fullscreen` (testeada).
  const toggleFullscreen = useCallback(() => {
    toggleFullscreenFor(containerRef.current, videoRef.current, document);
  }, []);

  // ── posición inicial + guardado de progreso (cada 15s) ─────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isLive || !progressKey) return;

    const onLoaded = () => {
      if (initialPosition > 0 && initialPosition < (video.duration || Infinity)) {
        video.currentTime = initialPosition;
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);

    const save = () => {
      if (!video.duration) return;
      navigator.sendBeacon?.(
        "/api/progress",
        new Blob(
          [
            JSON.stringify({
              ...progressKey,
              position_seconds: Math.floor(video.currentTime),
              duration_seconds: Math.floor(video.duration),
            }),
          ],
          { type: "application/json" },
        ),
      );
    };
    const id = setInterval(save, 15_000);
    const onEnd = () => {
      save();
      onEnded?.();
    };
    video.addEventListener("ended", onEnd);
    window.addEventListener("beforeunload", save);
    return () => {
      clearInterval(id);
      save();
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("ended", onEnd);
      window.removeEventListener("beforeunload", save);
    };
  }, [initialPosition, isLive, progressKey, onEnded]);

  if (!current) {
    return (
      <div className="grid aspect-video place-items-center rounded-card border border-line bg-surface text-center">
        <div className="max-w-sm p-6">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-warn/10 text-warn">
            <AlertTriangle size={22} />
          </div>
          <p className="font-medium">Este contenido aún no tiene señal disponible</p>
          <p className="mt-1.5 text-sm text-ink-3">
            Un revisor debe aprobar y autorizar una fuente antes de poder reproducirlo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-black shadow-card">
      <div
        ref={containerRef}
        className="group/player relative aspect-video w-full bg-black"
        onMouseMove={isLive ? wakeControls : undefined}
        onMouseLeave={isLive ? () => setControlsVisible(false) : undefined}
        onKeyDown={customControls ? onContainerKeyDown : undefined}
      >
        {/* Fuentes `embed`: iframe del proveedor. El resto usa <video>/hls.js.
            ⚠️ SIN atributo `sandbox` A PROPÓSITO (versión web): múltiples
            proveedores de embed DETECTAN el atributo `sandbox` y RECHAZAN la
            reproducción («Please disable sandbox»). Se prioriza la compatibilidad
            de reproducción; el bloqueo de popups se hará en las apps nativas
            (Electron/Android/iOS) vía el host/WebView. No se evade la detección:
            simplemente no se usa sandbox. Ver src/lib/security/embed-shield.ts. */}
        {isEmbed ? (
          <iframe
            key={current.url}
            src={current.url}
            title={`Reproduciendo ${title}`}
            className="h-full w-full border-0"
            allow={EMBED_ALLOW}
            allowFullScreen
            // Some providers (e.g. VidSrc Ad-Free Plays) require a specific
            // Referrer Policy to identify verified domains.
            // This value is configurable per provider.
            referrerPolicy={current.referrerPolicy ?? EMBED_REFERRER_POLICY}
            onLoad={() => window.clearTimeout(embedWatchdogRef.current)}
          />
        ) : (
          /* Ni en vivo ni en TV llevan controles nativos: los sustituye la barra
             propia. En la web en VOD siguen siendo los del navegador. */
          <video
            ref={videoRef}
            controls={!customControls}
            playsInline
            className="h-full w-full"
            aria-label={`Reproduciendo ${title}`}
            onClick={customControls ? () => { togglePlay(); wakeControls(); } : undefined}
          />
        )}

        {/* Play/pausa para fuentes `embed` en TV.
            Dentro de un iframe cross-origin no se puede inyectar teclado, así que
            el botón le pide al APK un toque REAL en el centro del WebView, que es
            lo único que Chromium enruta hasta el iframe. Sin esto, con mando no
            hay absolutamente ninguna forma de arrancar la reproducción. */}
        {tv && isEmbed && status !== "exhausted" && (
          <button
            onClick={() => requestHostTapCenter()}
            data-focusable
            aria-label="Reproducir o pausar"
            /* `pointer-events-none` es IMPRESCINDIBLE, no cosmético: el toque que
               manda el APK va al centro del WebView, y si este botón lo intercepta
               nunca llega al iframe — además de reactivarse a sí mismo en bucle.
               Sin eventos de puntero el toque lo atraviesa y llega al player del
               proveedor, mientras el botón sigue recibiendo foco y Enter del mando.
               Va abajo y no en el centro para no tapar el play del proveedor. */
            className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-black/60 px-6 py-3 text-base font-semibold text-white opacity-60 backdrop-blur-sm transition focus-visible:bg-accent focus-visible:opacity-100"
          >
            <Play size={20} fill="currentColor" /> Reproducir / Pausar
          </button>
        )}

        {/* insignia EN VIVO dentro del vídeo (no bloquea los controles) */}
        {isLive && status === "playing" && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-black/60 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crit" /> En vivo
          </span>
        )}

        {/* botón central cuando está en pausa (o el autoplay fue bloqueado) */}
        {customControls && !isEmbed && !playing && status === "playing" && (
          <button
            onClick={() => { togglePlay(); wakeControls(); }}
            data-focusable
            aria-label="Reproducir"
            className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-accent"
          >
            <Play size={26} fill="currentColor" className="ml-1" />
          </button>
        )}

        {/* barra de controles propia (en vivo siempre; VOD solo en TV) */}
        {customControls && !isEmbed && status !== "exhausted" && (
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-12 transition-opacity duration-200 ${
              controlsVisible || !playing || showQuality ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/* Línea de tiempo (VOD). Un `range` nativo ya responde a
                izquierda/derecha del D-pad en cuanto recibe el foco, así que no
                hace falta lógica de arrastre: es el control correcto para mando. */}
            {showTimeline && (
              <div className="mb-1.5 flex items-center gap-3">
                <span className="font-mono text-[11px] tabular-nums text-white/80">{fmtTime(time)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={5}
                  value={Math.min(time, duration || 0)}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  data-focusable
                  aria-label="Posición"
                  disabled={!duration}
                  className="h-1.5 flex-1 cursor-pointer accent-accent"
                />
                <span className="font-mono text-[11px] tabular-nums text-white/80">{fmtTime(duration)}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
            <button
              onClick={togglePlay}
              data-focusable
              aria-label={playing ? "Pausar" : "Reproducir"}
              className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/15"
            >
              {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="ml-0.5" />}
            </button>
            <button
              onClick={toggleMute}
              data-focusable
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/15"
            >
              {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              data-focusable
              aria-label="Volumen"
              className="hidden h-1 w-20 cursor-pointer accent-accent sm:block"
            />

            <div className="flex-1" />

            {/* selector de calidad (solo si el stream declara varias) */}
            {levels.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowQuality((v) => !v)}
                  data-focusable
                  aria-expanded={showQuality}
                  aria-label="Calidad de imagen"
                  className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-mono text-[11px] text-white transition ${
                    showQuality ? "bg-white/20" : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  <Settings2 size={13} />
                  {level === -1
                    ? autoHeight
                      ? `Auto · ${autoHeight}p`
                      : "Auto"
                    : `${levels.find((l) => l.index === level)?.height ?? "?"}p`}
                </button>
                {showQuality && (
                  <div className="absolute bottom-full right-0 mb-2 min-w-[130px] overflow-hidden rounded-[12px] border border-line/60 bg-surface/95 py-1 shadow-card backdrop-blur-md">
                    {[{ index: -1, height: 0 }, ...levels].map((l) => (
                      <button
                        key={l.index}
                        onClick={() => selectLevel(l.index)}
                        data-focusable
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[12px] transition hover:bg-surface-2 ${
                          level === l.index ? "text-ink" : "text-ink-2"
                        }`}
                      >
                        {l.index === -1 ? "Automática" : `${l.height}p`}
                        {level === l.index && <Check size={13} className="text-accent" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isLive && (
              <button
                onClick={goLive}
                data-focusable
                title="Sincronizar con el directo"
                className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-white transition hover:bg-accent"
              >
                <Radio size={13} /> Al directo
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              data-focusable
              aria-label="Pantalla completa"
              className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/15"
            >
              <Maximize size={18} />
            </button>
            </div>
          </div>
        )}

        {(status === "switching" || status === "loading") && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
            <div className="flex items-center gap-2.5 rounded-pill border border-line/60 bg-surface/95 px-4 py-2 text-sm shadow-card">
              <RefreshCw size={15} className="animate-spin text-accent" />
              {index === 0 ? "Conectando señal…" : `Probando ${sources[index]?.label?.toLowerCase() ?? `respaldo ${index}`}…`}
            </div>
          </div>
        )}

        {status === "exhausted" && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center backdrop-blur-[2px]">
            <div className="max-w-sm">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-crit/15 text-crit">
                <AlertTriangle size={22} />
              </div>
              <p className="font-medium text-white">Ninguna señal respondió</p>
              <p className="mt-1.5 text-sm text-ink-2">
                Se probaron las {sources.length} señales de este canal sin éxito.
              </p>
              <button
                data-focusable
                onClick={() => {
                  setStatus("loading");
                  setIndex(0);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                <RefreshCw size={15} /> Reintentar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* barra de señales / info técnica */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line/70 bg-surface px-3.5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Señal</span>
        {sources.map((s, i) => (
          <button
            key={s.id}
            data-focusable
            onClick={() => {
              setStatus("switching");
              setIndex(i);
            }}
            aria-pressed={i === index}
            className={`rounded-pill px-3 py-1.5 text-[12px] font-medium transition ${
              i === index
                ? "bg-accent text-white shadow-glow"
                : "border border-line bg-bg text-ink-2 hover:border-line hover:text-ink"
            }`}
            title={s.reasons?.join(" · ")}
          >
            {s.label}
            {s.resolutionHeight ? (
              <span className={`ml-1.5 font-mono text-[10px] ${i === index ? "text-white/75" : "text-ink-3"}`}>
                {s.resolutionHeight}p
              </span>
            ) : null}
          </button>
        ))}
        <button
          onClick={() => setShowInfo((v) => !v)}
          data-focusable
          aria-expanded={showInfo}
          className={`ml-auto flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] transition ${
            showInfo ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"
          }`}
        >
          <Info size={14} /> Detalles
        </button>
      </div>

      {showInfo && (
        <div className="border-t border-line/70 bg-bg px-3 py-3 font-mono text-[12px] text-ink-2">
          <div className="mb-1 text-ink">{title}{subtitle ? ` — ${subtitle}` : ""}</div>
          <div>tipo: {current.playbackType} · resolución declarada: {current.resolutionHeight ?? "—"}p</div>
          <div>audio: {current.audioLanguages?.join(", ") || "—"}</div>
          {isEmbed && (
            <div className="text-ink-3">
              popups bloqueados (reportados): {blockedPopups}
              {" · web sin sandbox — mitigación en app nativa"}
            </div>
          )}
          {current.score != null && <div>puntuación del engine: {current.score}</div>}
          {current.reasons && current.reasons.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              motivos:
              {current.reasons.map((r) => (
                <span key={r} className="inline-flex items-center gap-0.5 text-accent">
                  <ChevronRight size={12} />
                  {r}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 break-all text-ink-3">url: {current.url}</div>
        </div>
      )}
    </div>
  );
}
