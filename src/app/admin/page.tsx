import { createClient } from "@/lib/supabase/server";

export default async function AdminHome() {
  const supabase = await createClient();
  const [titles, providers, avail, pending, channels] = await Promise.all([
    supabase.from("media_titles").select("*", { count: "exact", head: true }),
    supabase.from("providers").select("*", { count: "exact", head: true }),
    supabase.from("media_availabilities").select("*", { count: "exact", head: true }),
    supabase.from("media_availabilities").select("*", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("channels").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Títulos", value: titles.count ?? 0 },
    { label: "Proveedores", value: providers.count ?? 0 },
    { label: "Disponibilidades", value: avail.count ?? 0 },
    { label: "Pendientes de revisión", value: pending.count ?? 0, hot: true },
    { label: "Canales", value: channels.count ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-card border bg-surface p-4 ${s.hot && s.value > 0 ? "border-warn/50" : "border-line"}`}>
            <p className={`font-mono text-3xl font-bold ${s.hot && s.value > 0 ? "text-warn" : "text-ink"}`}>{s.value}</p>
            <p className="mt-1 text-xs text-ink-3">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-card border border-line bg-surface p-5 text-sm text-ink-2">
        <p className="mb-2 font-semibold text-ink">Flujo recomendado</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sincroniza metadatos desde TMDB (Importar → TMDB).</li>
          <li>Importa una playlist M3U de prueba (Importar → M3U).</li>
          <li>Crea/edita proveedores y sus disponibilidades.</li>
          <li>Revisa y <b>autoriza</b> las fuentes en Revisión (una URL accesible NO se autoriza sola).</li>
          <li>Las fuentes aprobadas y autorizadas aparecen en el catálogo público.</li>
        </ol>
      </div>
    </div>
  );
}
