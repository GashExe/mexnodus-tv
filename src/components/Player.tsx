"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, RefreshCw, ChevronRight } from "lucide-react";

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
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [showInfo, setShowInfo] = useState(false);
  const current = sources[index];

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

      const isHls = source.playbackType === "hls" || source.url.includes(".m3u8");

      if (isHls) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: isLive, backBufferLength: 30 });
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void video.play().catch(() => {});
            setStatus("playing");
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
        <div className="p-6">
          <AlertTriangle className="mx-auto mb-3 text-warn" />
          <p className="font-medium">No hay ninguna fuente aprobada y autorizada para reproducir.</p>
          <p className="mt-1 text-sm text-ink-3">Un revisor debe aprobar una disponibilidad primero.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-black">
      <div className="relative aspect-video w-full bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          className="h-full w-full"
          aria-label={`Reproduciendo ${title}`}
        />

        {(status === "switching" || status === "loading") && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <div className="flex items-center gap-2 rounded-pill bg-surface/90 px-4 py-2 text-sm">
              <RefreshCw size={16} className="animate-spin" />
              {index === 0 ? "Cargando fuente…" : `Cambiando a respaldo #${index + 1}…`}
            </div>
          </div>
        )}

        {status === "exhausted" && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
            <div>
              <AlertTriangle className="mx-auto mb-3 text-crit" />
              <p className="font-medium">Se agotaron las fuentes disponibles.</p>
              <button
                onClick={() => {
                  setStatus("loading");
                  setIndex(0);
                }}
                className="mt-4 rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white"
              >
                Reintentar desde la principal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* barra de fuentes / info técnica */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line/70 bg-surface px-3 py-2.5">
        <span className="font-mono text-[11px] text-ink-3">Fuente:</span>
        {sources.map((s, i) => (
          <button
            key={s.id}
            data-focusable
            onClick={() => {
              setStatus("switching");
              setIndex(i);
            }}
            className={`rounded-pill px-3 py-1 font-mono text-[11px] transition ${
              i === index
                ? "bg-accent text-white"
                : "border border-line bg-bg text-ink-2 hover:text-ink"
            }`}
            title={s.reasons?.join(" · ")}
          >
            {i === 0 ? "★ " : ""}
            {s.label}
            {s.resolutionHeight ? ` · ${s.resolutionHeight}p` : ""}
          </button>
        ))}
        <button
          onClick={() => setShowInfo((v) => !v)}
          data-focusable
          className="ml-auto flex items-center gap-1.5 rounded-pill border border-line px-3 py-1 text-[12px] text-ink-2 hover:text-ink"
        >
          <Info size={14} /> Info técnica
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
