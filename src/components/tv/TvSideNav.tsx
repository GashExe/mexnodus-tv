"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clapperboard, Tv, MonitorPlay, Library, Search, Link2 } from "lucide-react";

/**
 * Nav lateral de TV.
 *
 * Vertical y no horizontal porque con D-pad el gesto natural para cambiar de
 * sección es arriba/abajo, dejando izquierda/derecha para recorrer el contenido.
 * Con una barra superior habría que subir hasta ella y luego moverse en el mismo
 * eje que las tarjetas, que es justo lo que confunde.
 *
 * Los destinos llevan `data-focusable` para que `SpatialNav` los considere, y el
 * activo se marca con fondo (no solo color) porque el foco y el estado activo
 * tienen que distinguirse a simple vista desde el sofá.
 */

const LINKS = [
  { href: "/tv", label: "Inicio", icon: Home, exact: true },
  { href: "/tv/movies", label: "Películas", icon: Clapperboard },
  { href: "/tv/series", label: "Series", icon: MonitorPlay },
  { href: "/tv/live", label: "En vivo", icon: Tv },
  { href: "/tv/search", label: "Buscar", icon: Search },
  { href: "/tv/library", label: "Biblioteca", icon: Library },
];

export function TvSideNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1.5 pr-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-gradient-to-br from-accent to-accent-2 font-mono text-base font-bold text-white shadow-glow">
          M
        </span>
        <span className="text-base font-semibold tracking-tight">
          MexNodus<span className="text-accent"> TV</span>
        </span>
      </div>

      {LINKS.map(({ href, label, icon: Icon, exact }) => (
        <Link
          key={href}
          href={href}
          data-focusable
          className={`flex items-center gap-3 rounded-pill px-4 py-3 text-base transition focus-visible:outline-none ${
            active(href, exact) ? "bg-surface-2 font-medium text-ink" : "text-ink-2"
          }`}
        >
          <Icon size={22} strokeWidth={2} />
          {label}
        </Link>
      ))}

      {!signedIn && (
        <Link
          href="/tv/link"
          data-focusable
          className="mt-4 flex items-center gap-3 rounded-pill border border-accent/40 px-4 py-3 text-base text-accent focus-visible:outline-none"
        >
          <Link2 size={22} strokeWidth={2} />
          Vincular
        </Link>
      )}
    </nav>
  );
}
