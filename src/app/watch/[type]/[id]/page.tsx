import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tv } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolvePlayback } from "@/lib/playback/resolve";
import { Player, type PlayerSource } from "@/components/Player";
import { AvailabilityPanel } from "@/components/AvailabilityPanel";
import { LANG_LABEL } from "@/lib/language";
import { getChannel, getPlayableChannelStreams, getCurrentProgram, getRelatedChannels, getEpisode, getSeriesEpisodes, getTitle } from "@/lib/data";
import { EpisodeNav } from "@/components/EpisodeNav";
import { poster } from "@/lib/format";
import { flagEmoji, countryName } from "@/lib/geo";
import { Chip, SectionTitle } from "@/components/ui";
import { ChannelCard } from "@/components/ChannelCard";
import type { ScoredCandidate } from "@/lib/playback/engine";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function progressPct(start: string, end: string) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

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
    const [streams, { current, next }, related] = await Promise.all([
      getPlayableChannelStreams(id),
      getCurrentProgram(id),
      getRelatedChannels(channel, 9),
    ]);
    // Etiquetas amigables: los `label` de BD llevan sufijos internos de import
    // ("Principal (m3u-cl-total)") que no deben verse en el reproductor.
    const sources: PlayerSource[] = streams.map((s, i) => ({
      id: s.id,
      url: s.play_url,
      playbackType: s.playback_type,
      label: i === 0 ? "Principal" : `Respaldo ${i}`,
      resolutionHeight: s.resolution_height,
    }));
    const logo = poster(channel.logo_path);
    const cur = current as { title?: string; starts_at?: string; ends_at?: string } | null;
    const nxt = next as { title?: string; starts_at?: string } | null;

    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <BackLink href="/live" label="Volver a la guía" />
        <Player sources={sources} title={channel.name} isLive subtitle={cur?.title} />

        {/* Identidad del canal */}
        <div className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-surface-2 ring-1 ring-line/60">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <Tv size={26} className="text-ink-3" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{channel.name}</h1>
              {channel.country && (
                <span className="shrink-0 text-lg" title={countryName(channel.country)}>
                  {flagEmoji(channel.country)}
                </span>
              )}
            </div>
            {(channel.categories?.length ?? 0) > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {channel.categories!.slice(0, 4).map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-crit/30 bg-crit/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-crit">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crit" /> En vivo
          </span>
        </div>

        {/* Programación: ahora y a continuación */}
        {cur?.title && cur.starts_at && cur.ends_at && (
          <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-medium">{cur.title}</p>
              <span className="shrink-0 font-mono text-[11px] text-ink-3">
                {hhmm(cur.starts_at)}–{hhmm(cur.ends_at)}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progressPct(cur.starts_at, cur.ends_at)}%` }}
              />
            </div>
            {nxt?.title && nxt.starts_at && (
              <p className="mt-2 truncate text-sm text-ink-3">
                A continuación · <span className="font-mono text-[12px]">{hhmm(nxt.starts_at)}</span> {nxt.title}
              </p>
            )}
          </div>
        )}

        {/* Canales similares */}
        {related.length > 0 && (
          <div className="pt-2">
            <SectionTitle>Canales similares</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((c) => (
                <ChannelCard key={c.id} channel={c} />
              ))}
            </div>
          </div>
        )}
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

  // ── Contexto de serie (navegación de episodios) ──
  let playerTitle = "Reproducción";
  let episodeNav: { seriesTitle: string; episodes: import("@/components/EpisodeNav").EpisodeNavItem[] } | null = null;
  if (kind === "episode") {
    const ep = await getEpisode(id);
    if (ep) {
      const [series, allEpisodes] = await Promise.all([
        getTitle(ep.series_id),
        getSeriesEpisodes(ep.series_id),
      ]);
      const seriesTitle = series?.title ?? "Serie";
      playerTitle = `${seriesTitle} · T${ep.season_number} E${ep.episode_number}${ep.title ? ` — ${ep.title}` : ""}`;
      episodeNav = {
        seriesTitle,
        episodes: allEpisodes.map((e) => ({
          id: e.id,
          season_number: e.season_number,
          episode_number: e.episode_number,
          title: e.title,
          air_date: e.air_date,
          runtime_minutes: e.runtime_minutes,
        })),
      };
    }
  }

  return (
    <div className="space-y-5">
      <BackLink href={kind === "episode" ? "/series" : "/movies"} label="Catálogo" />
      <Player sources={sources} title={playerTitle} progressKey={progressKey} initialPosition={initial} />
      {episodeNav && episodeNav.episodes.length > 0 && (
        <EpisodeNav seriesTitle={episodeNav.seriesTitle} episodes={episodeNav.episodes} currentId={id} />
      )}
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
