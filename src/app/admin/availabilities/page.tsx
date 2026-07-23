import { createClient } from "@/lib/supabase/server";
import { AvailabilityForm } from "./AvailabilityForm";
import { ReviewBadge, Chip, TechDot } from "@/components/ui";
import type { MediaAvailability, TechStatus } from "@/lib/types/db";

export default async function AvailabilitiesPage() {
  const supabase = await createClient();
  const [{ data: provs }, { data: titles }, { data: avail }] = await Promise.all([
    supabase.from("providers").select("id,name").order("name"),
    supabase.from("media_titles").select("id,title").order("title").limit(200),
    supabase
      .from("media_availabilities")
      .select("*, providers(name), media_titles(title), channels(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const rows = (avail as (MediaAvailability & Record<string, unknown>)[]) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Disponibilidades</h1>
        <p className="mt-1 text-sm text-ink-3">Una forma concreta de acceder a un contenido. Calidad, revisión y autorización son campos separados.</p>
      </div>

      <AvailabilityForm providers={provs ?? []} titles={titles ?? []} />

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Contenido</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Calidad</th>
              <th className="px-4 py-3">Audio</th>
              <th className="px-4 py-3">Técnico</th>
              <th className="px-4 py-3">Revisión</th>
              <th className="px-4 py-3">Autorización</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className="px-4 py-3">
                  {(r.media_titles as { title?: string })?.title ?? (r.channels as { name?: string })?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-2">{(r.providers as { name?: string })?.name}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{r.resolution_height ?? "—"}p · {r.playback_type}</td>
                <td className="px-4 py-3">{(r.audio_languages ?? []).map((l) => <Chip key={l}>{l}</Chip>)}</td>
                <td className="px-4 py-3"><TechDot status={r.tech_status as TechStatus} /></td>
                <td className="px-4 py-3"><ReviewBadge status={r.review_status} /></td>
                <td className="px-4 py-3">
                  <Chip tone={r.publish_authorization === "authorized" ? "accent" : "default"}>{r.publish_authorization}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
