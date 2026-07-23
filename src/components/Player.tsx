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

export interface PlayerSource {
  id: string;
  url: string;
  playbackType: "hls" | "dash" | "file" | "embed" | "jellyfin" | "iptv";
  label: string;
  reasons?: string[];
  score?: number;
  resolutionHeight?: number | null;
  audioLanguages?: string[];
}

export interface PlayerProps {
  sources: PlayerSource[]; // ordenadas: [primaria, ...fallbacks]
  title: string;
  subtitle?: string;
  isLive?: boolean;
  initialPosition?: number;
  progressKey?: { media_title_id?: string; episode_id?: string }; // null en canales
  onEnded?: () => void;
}

type Status = "loading" | "playing" | "switching" | "error" | "exhausted";

export function Player({
  sources,
  title,
  subtitle,
  isLive = false,
  initialPosition = 0,
  progressKey,
  onEnded,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [showInfo, setShowInfo] = useState(false);
  const current = sources[index];

  // ── controles propios para EN VIVO (sin línea de tiempo) ──────────────────
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  // ── calidades del stream (niveles HLS) ────────────────────────────────────
  const [levels, setLevels] = useState<{ index: number; height: number }[]>([]);
  const [level, setLevel] = useState(-1); // -1 = automática
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [showQuality, setShowQuality] = useState(false);

  const advancingRef = useRef(false);

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
      const video = videoRef.current;
      const source = sources[i];
      if (!video || !source) return;
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
      // nativo (Safari/iOS o archivo directo): el error del <video> dispara el failover
      video.src = source.url;
      video.onerror = () => handleFatal();
      video.play().then(() => setStatus("playing")).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, isLive],
  );

  useEffect(() => {
    void load(index);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [index, load]);

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

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
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
      >
        {/* En vivo NO lleva controles nativos: sin línea de tiempo; barra propia */}
        <video
          ref={videoRef}
          controls={!isLive}
          playsInline
          className="h-full w-full"
          aria-label={`Reproduciendo ${title}`}
          onClick={isLive ? () => { togglePlay(); wakeControls(); } : undefined}
        />

        {/* insignia EN VIVO dentro del vídeo (no bloquea los controles) */}
        {isLive && status === "playing" && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-black/60 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crit" /> En vivo
          </span>
        )}

        {/* botón central cuando está en pausa (o el autoplay fue bloqueado) */}
        {isLive && !playing && status === "playing" && (
          <button
            onClick={() => { togglePlay(); wakeControls(); }}
            aria-label="Reproducir"
            className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-accent"
          >
            <Play size={26} fill="currentColor" className="ml-1" />
          </button>
        )}

        {/* barra de controles propia (solo en vivo) */}
        {isLive && status !== "exhausted" && (
          <div
            className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-12 transition-opacity duration-200 ${
              controlsVisible || !playing || showQuality ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
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

            <button
              onClick={goLive}
              data-focusable
              title="Sincronizar con el directo"
              className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-white transition hover:bg-accent"
            >
              <Radio size={13} /> Al directo
            </button>
            <button
              onClick={toggleFullscreen}
              data-focusable
              aria-label="Pantalla completa"
              className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/15"
            >
              <Maximize size={18} />
            </button>
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
