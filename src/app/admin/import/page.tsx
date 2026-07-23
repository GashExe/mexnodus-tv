import { ImportPanel } from "./ImportPanel";
import { createClient } from "@/lib/supabase/server";

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar contenido</h1>
        <p className="mt-1 text-sm text-ink-3">Sincroniza TMDB e importa playlists M3U. Toda importación queda registrada.</p>
      </div>

      <ImportPanel />

      <div>
        <h2 className="mb-2 text-sm font-mono uppercase tracking-wide text-ink-3">Últimas importaciones</h2>
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase text-ink-3">
              <tr>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">OK</th>
                <th className="px-4 py-2.5">Fallidos</th>
                <th className="px-4 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j: Record<string, unknown>) => (
                <tr key={j.id as string} className="border-t border-line/60">
                  <td className="px-4 py-2.5 font-mono">{j.kind as string}</td>
                  <td className="px-4 py-2.5">{j.status as string}</td>
                  <td className="px-4 py-2.5">{(j.total as number) ?? 0}</td>
                  <td className="px-4 py-2.5 text-good">{(j.succeeded as number) ?? 0}</td>
                  <td className="px-4 py-2.5 text-crit">{(j.failed as number) ?? 0}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-ink-3">
                    {new Date(j.created_at as string).toLocaleString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
