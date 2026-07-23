"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clapperboard, Tv, MonitorPlay, Library, Settings, Shield, Search } from "lucide-react";

const LINKS = [
  { href: "/", label: "Inicio", icon: Home, exact: true },
  { href: "/movies", label: "Películas", icon: Clapperboard },
  { href: "/series", label: "Series", icon: MonitorPlay },
  { href: "/live", label: "En vivo", icon: Tv },
  { href: "/library", label: "Biblioteca", icon: Library },
];

export function TopNav({
  signedIn,
  role,
  email,
}: {
  signedIn: boolean;
  role: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const isStaff = role === "admin" || role === "reviewer";

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 sm:px-8">
        <Link href="/" className="mr-2 flex items-center gap-2" aria-label="MexNodus TV — inicio">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent to-accent-2 font-mono text-sm font-bold text-white shadow-glow">
            M
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
            MexNodus<span className="text-accent"> TV</span>
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {LINKS.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              data-focusable
              className={`flex items-center gap-2 whitespace-nowrap rounded-pill px-3 py-2 text-sm transition ${
                active(href, exact)
                  ? "bg-surface-2 text-ink"
                  : "text-ink-2 hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon size={17} strokeWidth={2} />
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/search"
            data-focusable
            aria-label="Buscar"
            className="grid h-9 w-9 place-items-center rounded-pill text-ink-2 hover:bg-surface hover:text-ink"
          >
            <Search size={18} />
          </Link>
          {isStaff && (
            <Link
              href="/admin"
              data-focusable
              className="flex items-center gap-1.5 rounded-pill border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-accent/10"
            >
              <Shield size={16} /> <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          {signedIn ? (
            <div className="flex items-center gap-1">
              <Link
                href="/settings"
                data-focusable
                aria-label="Configuración"
                className="grid h-9 w-9 place-items-center rounded-pill text-ink-2 hover:bg-surface hover:text-ink"
              >
                <Settings size={18} />
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  data-focusable
                  className="rounded-pill bg-surface-2 px-3 py-2 text-sm text-ink-2 hover:text-ink"
                  title={email ?? undefined}
                >
                  Salir
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              data-focusable
              className="rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
