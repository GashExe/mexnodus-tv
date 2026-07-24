import { createClient } from "@/lib/supabase/server";
import { ProviderForm } from "./ProviderForm";
import { SecurityTestButton } from "./SecurityTestButton";
import { ProviderActiveToggle } from "./ProviderActiveToggle";
import { Chip, TechDot } from "@/components/ui";
import { planFromConfig, readProviderSecurity } from "@/lib/security/embed-shield";
import { getEmbedFrameOrigins } from "@/lib/security/frame-origins";
import type { Provider, TechStatus } from "@/lib/types/db";

export const dynamic = "force-dynamic";

/** ¿Este proveedor puede servir embeds (y por tanto le aplica el escudo)? */
function isEmbedProvider(p: Provider): boolean {
  return (
    p.adapter === "pattern-embed" ||
    p.capabilities?.embed === true ||
    (p.public_config?.playback_type as string | undefined) === "embed"
  );
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "nunca";
}

export default async function ProvidersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("providers").select("*").order("priority", { ascending: false });
  const providers = (data as Provider[]) ?? [];

  // Orígenes que realmente entran en `frame-src` ahora mismo (diagnóstico).
  const { origins: frameOrigins, error: frameOriginsError } = await getEmbedFrameOrigins({ fresh: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="mt-1 text-sm text-ink-3">Registro declarativo: crear = declarar config + capacidades. El adaptador determina cómo se forma la URL.</p>
      </div>

      <ProviderForm />

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Adaptador</th>
              <th className="px-4 py-3">Confianza</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-t border-line/60">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-[11px] text-ink-3">{p.slug}</div>
                </td>
                <td className="px-4 py-3"><Chip>{p.type}</Chip></td>
                <td className="px-4 py-3 font-mono text-[12px] text-ink-2">{p.adapter}</td>
                <td className="px-4 py-3"><Chip tone={p.trust_level === "verified" ? "accent" : "default"}>{p.trust_level}</Chip></td>
                <td className="px-4 py-3 font-mono">{p.priority}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TechDot status={p.status as TechStatus} />
                    <ProviderActiveToggle id={p.id} active={p.is_active} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CSP dinámica: orígenes que entran ahora mismo en `frame-src`. */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">frame-src activo (CSP dinámica)</h2>
          <a
            href="/api/admin/frame-origins?fresh=1"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            GET /api/admin/frame-origins
          </a>
        </div>
        <p className="mt-1 text-sm text-ink-3">
          Orígenes exactos derivados de <code>domain</code>, <code>movie_pattern</code> y{" "}
          <code>series_pattern</code> de los proveedores <code>pattern-embed</code> activos. Se
          recalcula al crear, editar, activar o desactivar un proveedor — sin redeploy.
        </p>
        {frameOriginsError && (
          <p className="mt-2 rounded-[8px] border border-crit/30 bg-crit/10 px-3 py-2 text-[12px] text-crit">
            Error al leer proveedores: {frameOriginsError.message}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[11px]">
          <Chip>https://www.youtube-nocookie.com</Chip>
          {frameOrigins.map((o) => (
            <Chip key={o} tone="accent">{o}</Chip>
          ))}
          {frameOrigins.length === 0 && !frameOriginsError && (
            <span className="text-ink-3">Sin orígenes embed activos.</span>
          )}
        </div>
      </div>

      {/* Secure Embed Shield: sandbox final generado para cada proveedor de embed. */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Secure Embed Shield</h2>
        <p className="mt-1 text-sm text-ink-3">
          Sandbox y permisos que se aplican al iframe de cada proveedor de embed. Los tokens{" "}
          <code>allow-popups</code>, <code>allow-top-navigation</code> y <code>allow-downloads</code>{" "}
          nunca se conceden.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {providers.filter(isEmbedProvider).map((p) => {
            const sec = readProviderSecurity(p.public_config);
            const plan = planFromConfig(p.public_config);
            return (
              <div key={p.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="font-mono text-[11px] text-ink-3">{p.slug}</div>
                  </div>
                  <Chip tone={plan.incompatible ? "default" : "accent"}>{plan.level}</Chip>
                </div>

                <div className="mt-3 space-y-1.5 font-mono text-[11px] text-ink-2">
                  {plan.renderMode === "iframe" ? (
                    <div className="break-all">
                      <span className="text-ink-3">sandbox=</span>&quot;{plan.sandbox}&quot;
                    </div>
                  ) : (
                    <div className="text-warn">Solo apertura externa · no se enmarca (iframe)</div>
                  )}
                  <div className="break-all">
                    <span className="text-ink-3">allow=</span>&quot;{plan.allow}&quot;
                  </div>
                  <div>
                    <span className="text-ink-3">referrerPolicy=</span>&quot;{plan.referrerPolicy}&quot;
                  </div>
                  {plan.rejected.length > 0 && (
                    <div className="text-crit">tokens rechazados: {plan.rejected.join(", ")}</div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Chip tone={sec.popup_risk === "high" ? "gold" : "default"}>popup: {sec.popup_risk}</Chip>
                  <Chip tone={sec.redirect_risk === "high" ? "gold" : "default"}>redirect: {sec.redirect_risk}</Chip>
                  {sec.requires_same_origin && <Chip>same-origin</Chip>}
                  <Chip tone={sec.sandbox_compatible ? "accent" : "default"}>
                    {sec.sandbox_compatible ? "compatible" : "incompatible"}
                  </Chip>
                </div>

                <div className="mt-2 font-mono text-[11px] text-ink-3">
                  última prueba: {fmtDate(sec.last_security_test_at)}
                </div>

                <SecurityTestButton id={p.id} />
              </div>
            );
          })}
          {providers.filter(isEmbedProvider).length === 0 && (
            <p className="text-sm text-ink-3">No hay proveedores de embed registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
