import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { TvPairingPoller } from "@/components/tv/TvPairingPoller";
import { generateCode, generateDeviceSecret, PAIRING_TTL_MS } from "@/lib/tv/pairing";
import { publicEnv } from "@/lib/env";

/**
 * Pantalla de vinculación de la tele.
 *
 * Crea un emparejamiento nuevo en cada visita y muestra el código. El secreto
 * del dispositivo viaja al cliente a propósito: el cliente ES la tele, y es lo
 * único que le permite recoger la sesión más tarde. Quien mire la pantalla ve el
 * código pero no el secreto.
 */
export const dynamic = "force-dynamic";

export default async function TvLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ya hay sesión: no hay nada que vincular.
  if (user) redirect(next && next.startsWith("/tv") ? next : "/tv");

  const admin = createAdminClient();
  // Barrido perezoso de caducados, para no depender de un cron.
  await admin.rpc("purge_expired_tv_pairings");

  const code = generateCode();
  const deviceSecret = generateDeviceSecret();
  const { data, error } = await admin
    .from("tv_pairings")
    .insert({
      code,
      device_secret: deviceSecret,
      device_label: "Fire TV",
      expires_at: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <p className="text-base text-crit">
          No se pudo generar el código de vinculación. Inténtalo de nuevo.
        </p>
      </div>
    );
  }

  // Dominio sin protocolo: es más corto de leer y de teclear en el móvil.
  const linkHost = publicEnv.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight">Vincula tu cuenta</h1>
        <p className="mt-3 text-lg text-ink-2">
          Desde el móvil o el ordenador, entra en{" "}
          <span className="font-semibold text-ink">{linkHost}/link</span> y escribe este código:
        </p>

        <div className="my-8 inline-flex gap-3">
          {[...code].map((c, i) => (
            <span
              key={i}
              className="grid h-24 w-20 place-items-center rounded-card border-2 border-accent/40 bg-surface font-mono text-5xl font-bold tracking-widest text-accent"
            >
              {c}
            </span>
          ))}
        </div>

        <p className="mb-6 text-base text-ink-3">Caduca en 5 minutos.</p>

        <TvPairingPoller
          pairingId={data.id as string}
          deviceSecret={deviceSecret}
          next={next && next.startsWith("/tv") ? next : "/tv"}
        />

        <p className="mt-10 text-sm text-ink-3">
          También puedes seguir sin cuenta: el catálogo y la reproducción funcionan sin vincular.
          Solo se pierden favoritos y «continuar viendo».
        </p>
      </div>
    </div>
  );
}
