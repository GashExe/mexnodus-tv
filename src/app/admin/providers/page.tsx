import { createClient } from "@/lib/supabase/server";
import { ProviderForm } from "./ProviderForm";
import { Chip, TechDot } from "@/components/ui";
import type { Provider, TechStatus } from "@/lib/types/db";

export default async function ProvidersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("providers").select("*").order("priority", { ascending: false });
  const providers = (data as Provider[]) ?? [];

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
                <td className="px-4 py-3"><TechDot status={p.status as TechStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
