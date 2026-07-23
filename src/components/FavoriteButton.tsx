"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

export function FavoriteButton({
  titleId,
  channelId,
  initial,
}: {
  titleId?: string;
  channelId?: string;
  initial: boolean;
}) {
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const optimistic = !fav;
    setFav(optimistic);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_title_id: titleId, channel_id: channelId, on: optimistic }),
      });
      if (!res.ok) setFav(!optimistic);
    } catch {
      setFav(!optimistic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      data-focusable
      aria-pressed={fav}
      className={`inline-flex items-center gap-2 rounded-pill border px-5 py-3 font-semibold transition ${
        fav ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      <Heart size={18} fill={fav ? "currentColor" : "none"} />
      {fav ? "En favoritos" : "Favorito"}
    </button>
  );
}
