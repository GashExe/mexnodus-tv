import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor, isStaff } from "@/lib/auth";
import { LayoutDashboard, Boxes, ListChecks, ClipboardCheck, DownloadCloud, Users, ShieldAlert } from "lucide-react";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/providers", label: "Proveedores", icon: Boxes },
  { href: "/admin/availabilities", label: "Disponibilidades", icon: ListChecks },
  { href: "/admin/review", label: "Revisión", icon: ClipboardCheck },
  { href: "/admin/import", label: "Importar", icon: DownloadCloud },
  { href: "/admin/users", label: "Usuarios", icon: Users },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin");
  if (!isStaff(actor.role)) redirect("/");

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 flex items-center gap-2 rounded-card border border-accent/30 bg-accent/5 px-3 py-2">
          <ShieldAlert size={16} className="text-accent" />
          <div>
            <p className="text-sm font-semibold">Panel admin</p>
            <p className="font-mono text-[10px] uppercase text-ink-3">{actor.role}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col no-scrollbar">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-focusable
              className="flex items-center gap-2 whitespace-nowrap rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-surface hover:text-ink"
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
