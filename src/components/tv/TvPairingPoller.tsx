"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { POLL_INTERVAL_MS } from "@/lib/tv/pairing";

/**
 * Sondea el emparejamiento hasta que el móvil lo reclama. Cuando la respuesta
 * dice `claimed`, las cookies de sesión ya vienen puestas en ESA respuesta, así
 * que basta con refrescar para que el servidor renderice como usuario.
 */
export function TvPairingPoller({
  pairingId,
  deviceSecret,
  next,
}: {
  pairingId: string;
  deviceSecret: string;
  next: string;
}) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const res = await fetch("/api/tv/pair/poll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: pairingId, secret: deviceSecret }),
        });
        if (cancelled) return;
        const data = (await res.json()) as { state?: string };

        if (data.state === "claimed") {
          router.replace(next);
          router.refresh();
          return;
        }
        if (data.state === "expired") {
          setExpired(true);
          return; // deja de sondear: el código ya no sirve
        }
      } catch {
        // Un fallo de red no debe matar el sondeo: la tele puede estar
        // reconectando al wifi. Se reintenta en el siguiente ciclo.
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pairingId, deviceSecret, next, router]);

  if (!expired) {
    return <p className="text-base text-ink-3">Esperando confirmación…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-base text-warn">El código caducó.</p>
      <button
        onClick={() => router.refresh()}
        data-focusable
        className="rounded-pill bg-accent px-6 py-3 text-base font-semibold text-white focus-visible:outline-none"
      >
        Generar uno nuevo
      </button>
    </div>
  );
}
