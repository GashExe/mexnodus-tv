import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolvePlayback } from "@/lib/playback/resolve";
import { Player, type PlayerSource } from "@/components/Player";
import { LANG_LABEL } from "@/lib/language";
import {
  getChannel,
  getPlayableChannelStreams,
  getCurrentProgram,
  getEpisode,
  getSeriesEpisodes,
  getTitle,
} from "@/lib/data";
import { EpisodeNav } from "@/components/EpisodeNav";
import type { ScoredCandidate } from "@/lib/playback/engine";
import type { ReferrerPolicyValue } from "@/lib/security/embed-shield";

/**
 * Reproducción en TV.
 *
 * Misma resolución de fuentes que la página de escritorio, con dos cambios:
 * `resolvePlayback` recibe la superficie `"tv"` (perfil de pesos que prefiere
 * fuentes directas sobre embeds, ver TV_WEIGHTS) y el `Player` va en modo `tv`
 * (barra de controles propia en lugar de los `controls` nativos).
 *
 * No se renderiza `AvailabilityPanel`: es diagnóstico para revisores y en el
 * sofá solo es ruido.
 */
function candidateToSource(sc: ScoredCandidate, referrerPolicy?: ReferrerPolicyValue): PlayerSource {
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
    ...(referrerPolicy ? { referrerPolicy } : {}),
  };
}

export default async function TvWatchPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Canales en vivo ──
  if (type === "channel") {
    const channel = await getChannel(id);
    if (!channel) notFound();
    const [streams, { current }] = await Promise.all([
      getPlayableChannelStreams(id),
      getCurrentProgram(id),
    ]);
    // Fuera las URLs `http://`: la página va por https, así que el navegador las
    // bloquea por contenido mixto y el APK las rechaza además por
    // `usesCleartextTraffic="false"`. Dejarlas solo gastaría intentos del
    // failover antes de llegar a una señal que sí puede reproducir.
    const sources: PlayerSource[] = streams
      .filter((s) => s.play_url.startsWith("https://"))
      .map((s, i) => ({
        id: s.id,
        url: s.play_url,
        playbackType: s.playback_type,
        label: i === 0 ? "Principal" : `Respaldo ${i}`,
        resolutionHeight: s.resolution_height,
      }));
    const cur = current as { title?: string } | null;

    return (
      <div className="space-y-4">
        <BackLink href="/tv/live" label="Volver a canales" />
        <Player sources={sources} title={channel.name} isLive subtitle={cur?.title} tv />
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
          {cur?.title && <p className="text-base text-ink-2">{cur.title}</p>}
        </div>
      </div>
    );
  }

  // ── Películas / episodios ──
  const kind = type === "episode" ? "episode" : "title";
  const { result, referrerPolicyById } = await resolvePlayback({ kind, id }, user?.id ?? null, "tv");
  const ordered = result.primary ? [result.primary, ...result.fallbacks] : [];
  const sources = ordered
    .map((sc) => candidateToSource(sc, referrerPolicyById[sc.candidate.id]))
    .filter((s) => s.url);

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

  let playerTitle = "Reproducción";
  let backHref = "/tv/movies";
  let episodeNav: {
    seriesTitle: string;
    episodes: import("@/components/EpisodeNav").EpisodeNavItem[];
  } | null = null;

  if (kind === "episode") {
    const ep = await getEpisode(id);
    if (ep) {
      const [series, allEpisodes] = await Promise.all([
        getTitle(ep.series_id),
        getSeriesEpisodes(ep.series_id),
      ]);
      const seriesTitle = series?.title ?? "Serie";
      playerTitle = `${seriesTitle} · T${ep.season_number} E${ep.episode_number}${ep.title ? ` — ${ep.title}` : ""}`;
      backHref = `/tv/series/${ep.series_id}`;
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
  } else {
    const t = await getTitle(id);
    if (t) {
      playerTitle = t.title;
      backHref = `/tv/movies/${t.id}`;
    }
  }

  return (
    <div className="space-y-4">
      <BackLink href={backHref} label="Volver" />
      <Player
        sources={sources}
        title={playerTitle}
        progressKey={progressKey}
        initialPosition={initial}
        tv
      />
      <h1 className="text-2xl font-semibold tracking-tight">{playerTitle}</h1>
      {episodeNav && episodeNav.episodes.length > 0 && (
        <EpisodeNav
          seriesTitle={episodeNav.seriesTitle}
          episodes={episodeNav.episodes}
          currentId={id}
          basePath="/tv/watch/episode"
        />
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      data-focusable
      className="inline-flex items-center gap-2 rounded-pill px-3 py-2 text-base text-ink-2 focus-visible:outline-none"
    >
      <ArrowLeft size={18} /> {label}
    </Link>
  );
}
