import { createClient } from "@/lib/supabase/server";
import { getActor } from "@/lib/auth";
import { RoleSelect } from "./RoleSelect";
import { Chip } from "@/components/ui";

export default async function UsersPage() {
  const actor = await getActor();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
  const isAdmin = actor?.role === "admin";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-ink-3">Roles: user · reviewer · admin. Solo un admin puede cambiarlos.</p>
      </div>
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Alta</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u: Record<string, unknown>) => (
              <tr key={u.id as string} className="border-t border-line/60">
                <td className="px-4 py-3">{(u.display_name as string) ?? (u.username as string) ?? (u.id as string).slice(0, 8)}</td>
                <td className="px-4 py-3 font-mono">{u.country as string}</td>
                <td className="px-4 py-3">
                  {isAdmin ? <RoleSelect userId={u.id as string} role={u.role as string} /> : <Chip>{u.role as string}</Chip>}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-ink-3">
                  {new Date(u.created_at as string).toLocaleDateString("es-MX")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
