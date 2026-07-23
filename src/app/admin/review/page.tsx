import { createClient } from "@/lib/supabase/server";
import { ReviewActions } from "./ReviewActions";
import { ReviewBadge, TechDot, Chip, EmptyState } from "@/components/ui";
import type { MediaAvailability, TechStatus } from "@/lib/types/db";

export default async function ReviewPage() {
  const supabase = await createClient();
  // staff ve TODAS las disponibilidades (RLS lo permite); mostramos las no aún autorizadas primero
  const { data } = await supabase
    .from("media_availabilities")
    .select("*, providers(name, slug), media_titles(title), channels(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data as (MediaAvailability & Record<string, unknown>)[]) ?? [];
  const queue = rows.filter((r) => r.publish_authorization !== "authorized" || r.review_status !== "approved");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cola de revisión</h1>
        <p className="mt-1 text-sm text-ink-3">
          Estado técnico, revisión y autorización son <b>independientes</b>. Autorizar es una decisión humana explícita.
        </p>
      </div>

      {queue.length === 0 ? (
        <EmptyState title="Nada pendiente" hint="Todas las fuentes están revisadas y autorizadas." />
      ) : (
        <div className="space-y-3">
          {queue.map((r) => {
            const content =
              (r.media_titles as { title?: string })?.title ??
              (r.channels as { name?: string })?.name ??
              "Contenido";
            return (
              <div key={r.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{content}</p>
                    <p className="font-mono text-[11px] text-ink-3">
                      {(r.providers as { name?: string })?.name} · {r.playback_type} · {r.resolution_height ?? "—"}p
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TechDot status={r.tech_status as TechStatus} />
                    <ReviewBadge status={r.review_status} />
                    <Chip tone={r.publish_authorization === "authorized" ? "accent" : "default"}>
                      {r.publish_authorization}
                    </Chip>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(r.audio_languages ?? []).map((l) => <Chip key={l}>{l}</Chip>)}
                  <span className="truncate font-mono text-[11px] text-ink-3">{r.play_url}</span>
                </div>
                <div className="mt-3 border-t border-line/60 pt-3">
                  <ReviewActions id={r.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
