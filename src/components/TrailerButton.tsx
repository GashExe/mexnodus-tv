"use client";

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";

/**
 * Botón + modal para reproducir el tráiler de YouTube. Usa el dominio sin
 * cookies (youtube-nocookie), permitido en el CSP. Cierra con Esc o clic fuera.
 */
export function TrailerButton({ youTubeKey, title }: { youTubeKey: string; title: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-focusable
        className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-6 py-3 font-semibold text-ink transition hover:border-accent/50 hover:text-accent"
      >
        <Play size={18} /> Ver tráiler
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Tráiler de ${title}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm animate-[fade-up_.2s_ease]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-card border border-line bg-black shadow-card"
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar tráiler"
              className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-accent"
            >
              <X size={18} />
            </button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youTubeKey}?autoplay=1&rel=0`}
              title={`Tráiler de ${title}`}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </div>
      )}
    </>
  );
}
