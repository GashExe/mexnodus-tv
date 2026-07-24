"use server";

import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { assertSafeUrl } from "@/lib/ssrf";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireStaff() {
  const actor = await getActor();
  if (!actor || !isStaff(actor.role)) throw new Error("No autorizado");
  return actor;
}

// ── Crear proveedor (registro declarativo) ──
const providerSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "slug en minúsculas y guiones"),
  name: z.string().min(2),
  type: z.enum(["official", "public_domain", "government", "university", "fast", "user", "jellyfin", "m3u", "aggregate"]),
  adapter: z.string().min(2),
  domain: z.string().optional(),
  trust_level: z.enum(["untrusted", "low", "medium", "high", "verified"]),
  priority: z.coerce.number().int(),
  // Config del adaptador `pattern-embed` (opcional para el resto).
  movie_pattern: z.string().optional().or(z.literal("")),
  series_pattern: z.string().optional().or(z.literal("")),
  playback_type: z.enum(["hls", "dash", "file", "embed", "jellyfin", "iptv"]).optional(),
});

export async function createProvider(_prev: unknown, formData: FormData) {
  const actor = await requireStaff();
  if (actor.role !== "admin") return { error: "Solo un admin puede crear proveedores" };
  const parsed = providerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const { movie_pattern, series_pattern, playback_type, ...providerCols } = parsed.data;
  const public_config =
    providerCols.adapter === "pattern-embed"
      ? {
          ...(movie_pattern ? { movie_pattern } : {}),
          ...(series_pattern ? { series_pattern } : {}),
          playback_type: playback_type ?? "embed",
        }
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .insert({ ...providerCols, public_config })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase.from("provider_capabilities").insert({ provider_id: data.id, hls: true });
  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    action: "provider.create",
    entity: "providers",
    entity_id: data.id,
    metadata: { slug: parsed.data.slug },
  });
  revalidatePath("/admin/providers");
  return { ok: true, id: data.id };
}

// ── Crear disponibilidad ──
const availSchema = z.object({
  provider_id: z.string().uuid(),
  media_title_id: z.string().uuid().optional().or(z.literal("")),
  channel_id: z.string().uuid().optional().or(z.literal("")),
  playback_type: z.enum(["hls", "dash", "file", "embed", "jellyfin", "iptv"]),
  play_url: z.string().url(),
  resolution_height: z.coerce.number().int().optional(),
  audio_lang: z.string().optional(),
  subtitle_lang: z.string().optional(),
});

export async function createAvailability(_prev: unknown, formData: FormData) {
  const actor = await requireStaff();
  const raw = Object.fromEntries(formData);
  const parsed = availSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  // guardia SSRF sobre la URL antes de guardarla
  const safe = assertSafeUrl(parsed.data.play_url);
  if (!safe.ok) return { error: `URL rechazada: ${safe.reason}` };

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_availabilities")
    .insert({
      provider_id: d.provider_id,
      media_title_id: d.media_title_id || null,
      channel_id: d.channel_id || null,
      playback_type: d.playback_type,
      play_url: d.play_url,
      resolution_height: d.resolution_height || null,
      audio_languages: d.audio_lang ? [d.audio_lang] : [],
      subtitle_languages: d.subtitle_lang ? [d.subtitle_lang] : [],
      tech_status: "unknown",
      review_status: "pending",
      publish_authorization: "unauthorized", // por defecto NO autorizado
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // encola en revisión y en validación técnica (worker externo futuro)
  await supabase.from("review_queue").insert({ availability_id: data.id, reason: "new_source" });
  await supabase.from("validation_jobs").insert({ availability_id: data.id, kind: "probe" });
  await supabase.from("audit_logs").insert({ actor_id: actor.id, action: "availability.create", entity: "media_availabilities", entity_id: data.id });
  revalidatePath("/admin/availabilities");
  revalidatePath("/admin/review");
  return { ok: true, id: data.id };
}

// ── Aprobar / rechazar (usa las RPC security-definer) ──
export async function approveAvailability(id: string, authorize: boolean) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_availability", { p_availability: id, p_authorize: authorize });
  if (error) return { error: error.message };
  revalidatePath("/admin/review");
  revalidatePath("/admin/availabilities");
  return { ok: true };
}

export async function rejectAvailability(id: string) {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_availability", { p_availability: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/review");
  return { ok: true };
}

// ── Simular validación técnica (sin worker: rellena métricas mock) ──
export async function mockValidate(id: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("stream_checks").insert({
    availability_id: id,
    ok: true,
    http_status: 200,
    response_ms: 850,
    resolution_height: 1080,
    bitrate_kbps: 5000,
    detected_codecs: { video: "h264", audio: "aac" },
    source: "mock",
  });
  await supabase
    .from("media_availabilities")
    .update({ tech_status: "online", stability: 90, uptime_pct: 98, last_checked_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/admin/review");
  return { ok: true };
}
