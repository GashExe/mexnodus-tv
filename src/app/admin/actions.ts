"use server";

import { createClient } from "@/lib/supabase/server";
import { getActor, isStaff } from "@/lib/auth";
import { assertSafeUrl } from "@/lib/ssrf";
import { assessProvider, readProviderSecurity } from "@/lib/security/embed-shield";
import { invalidateFrameOriginsCache, readExtraFrameOrigins } from "@/lib/security/frame-origins";
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
  // Dominios extra a los que el proveedor REDIRIGE (el reproductor real). La CSP
  // valida `frame-src` en cada salto del 302, así que deben declararse o el
  // iframe se bloquea al redirigir. Ej.: embedmaster.link → embdmstrplayer.com.
  extra_frame_origins: z.string().optional().or(z.literal("")),
  // Política de referrer del iframe, configurable por proveedor (VidSrc = "origin").
  referrer_policy: z.enum(["origin", "strict-origin-when-cross-origin", "no-referrer", "unsafe-url"]).optional(),
  // Riesgo del proveedor (SOLO analítica; no afecta el render del iframe en web).
  popup_risk: z.enum(["low", "medium", "high"]).optional(),
  redirect_risk: z.enum(["low", "medium", "high"]).optional(),
});

export async function createProvider(_prev: unknown, formData: FormData) {
  const actor = await requireStaff();
  if (actor.role !== "admin") return { error: "Solo un admin puede crear proveedores" };
  const parsed = providerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const {
    movie_pattern,
    series_pattern,
    playback_type,
    referrer_policy,
    extra_frame_origins,
    popup_risk,
    redirect_risk,
    ...providerCols
  } = parsed.data;
  const extraOrigins = readExtraFrameOrigins({ extra_frame_origins });
  const public_config =
    providerCols.adapter === "pattern-embed"
      ? {
          ...(movie_pattern ? { movie_pattern } : {}),
          ...(series_pattern ? { series_pattern } : {}),
          ...(extraOrigins.length ? { extra_frame_origins: extraOrigins } : {}),
          playback_type: playback_type ?? "embed",
          // Política de referrer del iframe, configurable por proveedor.
          referrer_policy: referrer_policy ?? "strict-origin-when-cross-origin",
          // Metadatos de riesgo del proveedor: SOLO analítica (panel admin + futura
          // política de bloqueo en app nativa). En web NO afectan el render del
          // iframe — los embeds se renderizan sin `sandbox` a propósito.
          security: {
            popup_risk: popup_risk ?? "medium",
            redirect_risk: redirect_risk ?? "medium",
            last_security_test_at: null,
          },
        }
      : null;

  // `domain` vacío → null (para que la derivación de origen no reciba "").
  const domain = providerCols.domain ? providerCols.domain.trim() : null;

  const supabase = await createClient();
  // Devolvemos las columnas que alimentan la CSP dinámica para CONFIRMAR que se
  // persistieron: adapter, is_active, domain y public_config.
  const { data, error } = await supabase
    .from("providers")
    .insert({ ...providerCols, domain, public_config })
    .select("id, adapter, is_active, domain, public_config")
    .single();
  if (error) {
    console.error("[provider.create] error insertando proveedor:", error.message);
    return { error: error.message };
  }

  await supabase.from("provider_capabilities").insert({
    provider_id: data.id,
    hls: true,
    embed: providerCols.adapter === "pattern-embed",
  });
  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    action: "provider.create",
    entity: "providers",
    entity_id: data.id,
    metadata: { slug: parsed.data.slug, adapter: data.adapter, is_active: data.is_active },
  });

  // Un proveedor nuevo puede cambiar `frame-src`: invalida la caché y revalida.
  invalidateFrameOriginsCache();
  revalidatePath("/admin/providers");
  revalidatePath("/watch", "layout");
  return { ok: true, id: data.id };
}

// ── Activar / desactivar proveedor (afecta la CSP dinámica `frame-src`) ──
export async function setProviderActive(id: string, active: boolean) {
  const actor = await requireStaff();
  if (actor.role !== "admin") return { error: "Solo un admin puede activar/desactivar proveedores" };
  const supabase = await createClient();
  const { error } = await supabase.from("providers").update({ is_active: active }).eq("id", id);
  if (error) {
    console.error("[provider.setActive] error:", error.message);
    return { error: error.message };
  }
  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    action: active ? "provider.activate" : "provider.deactivate",
    entity: "providers",
    entity_id: id,
  });
  invalidateFrameOriginsCache();
  revalidatePath("/admin/providers");
  revalidatePath("/watch", "layout");
  return { ok: true };
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

// ── Registro de riesgo del proveedor (analítica; sin efecto en el render web) ──
/**
 * Evalúa los metadatos de riesgo (popup_risk/redirect_risk) y sella
 * `last_security_test_at`. SOLO informativo: en web los embeds se renderizan sin
 * `sandbox`, así que esto NO cambia cómo se enmarca nada — alimenta el panel y la
 * futura política de bloqueo en app nativa.
 */
export async function runProviderSecurityTest(id: string) {
  const actor = await requireStaff();
  if (actor.role !== "admin") return { error: "Solo un admin puede evaluar proveedores" };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("providers")
    .select("public_config")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };

  const config = (data.public_config as Record<string, unknown> | null) ?? {};
  const security = readProviderSecurity(config);
  const assessment = assessProvider(security);

  const nextConfig = {
    ...config,
    security: { ...security, last_security_test_at: new Date().toISOString() },
  };

  const { error: upErr } = await supabase
    .from("providers")
    .update({ public_config: nextConfig })
    .eq("id", id);
  if (upErr) return { error: upErr.message };

  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    action: "provider.security_test",
    entity: "providers",
    entity_id: id,
    metadata: { needs_native_mitigation: assessment.needsNativeMitigation },
  });
  revalidatePath("/admin/providers");
  return { ok: true, warnings: assessment.warnings };
}
