import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolvePlayback } from "@/lib/playback/resolve";
import { Player, type PlayerSource } from "@/components/Player";
import { AvailabilityPanel } from "@/components/AvailabilityPanel";
import { LANG_LABEL } from "@/lib/language";
import { getChannel, getPlayableChannelStreams, getCurrentProgram } from "@/lib/data";
import type { ScoredCandidate } from "@/lib/playback/engine";

function candidateToSource(sc: ScoredCandidate): PlayerSource {
  const c = sc.candidate;
  const lang = c.audio_languages?.[0];
  return {
    id: c.id,
    url: c.play_url ?? "",
    playbackType: c.playback_type,
    label: lang ? (LANG_LABEL[lang] ?? lang) : "Fuente",
    reasons: sc.reasons,
    score: sc.score,
    resolutionHeight: c.resolution_height,
    audioLanguages: c.audio_languages,
  };
}

export default async function WatchPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Canales en vivo ──
  if (type === "channel") {
    const channel = await getChannel(id);
    if (!channel) notFound();
    const streams = await getPlayableChannelStreams(id);
    const { current, next } = await getCurrentProgram(id);
    const sources: PlayerSource[] = streams.map((s, i) => ({
      id: s.id,
      url: s.play_url,
      playbackType: s.playback_type,
      label: s.label ?? (s.is_primary ? "Principal" : `Respaldo ${i}`),
      resolutionHeight: s.resolution_height,
    }));
    return (
      <div className="space-y-5">
        <BackLink href="/live" label="En vivo" />
        <Player sources={sources} title={channel.name} isLive subtitle={(current as { title?: string })?.title} />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <h1 className="text-xl font-semibold">{channel.name}</h1>
            <p className="mt-1 text-sm text-ink-2">
              Ahora: {(current as { title?: string })?.title ?? "—"}
              {(next as { title?: string })?.title ? ` · A continuación: ${(next as { title?: string }).title}` : ""}
            </p>
          </div>
          <div className="rounded-card border border-line bg-surface p-4 text-sm text-ink-2">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-ink-3">Señales aprobadas</p>
            {sources.length === 0 ? (
              <p className="text-warn">Sin señales autorizadas para este canal.</p>
            ) : (
              <ul className="space-y-1">
                {streams.map((s, i) => (
                  <li key={s.id} className="flex justify-between">
                    <span>{i === 0 ? "★ " : ""}{s.label ?? "Señal"}</span>
                    <span className="font-mono text-ink-3">{s.resolution_height ?? "—"}p</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Películas / episodios ──
  const kind = type === "episode" ? "episode" : "title";
  const { result } = await resolvePlayback({ kind, id }, user?.id ?? null);
  const ordered = result.primary ? [result.primary, ...result.fallbacks] : [];
  const sources = ordered.map(candidateToSource).filter((s) => s.url);

  // progreso inicial
  let initial = 0;
  if (user) {
    const col = kind === "episode" ? "episode_id" : "media_title_id";
    const { data } = await supabase
      .from("watch_progress")
      .select("position_seconds")
      .eq("user_id", user.id)
      .eq(col, id)
      .maybeSingle();
    initial = (data as { position_seconds?: number } | null)?.position_seconds ?? 0;
  }

  const progressKey = kind === "episode" ? { episode_id: id } : { media_title_id: id };

  return (
    <div className="space-y-5">
      <BackLink href={kind === "episode" ? "/series" : "/movies"} label="Catálogo" />
      <Player sources={sources} title="Reproducción" progressKey={progressKey} initialPosition={initial} />
      <div className="max-w-2xl">
        <AvailabilityPanel result={result} />
      </div>
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
      <ArrowLeft size={16} /> {label}
    </Link>
  );
}
