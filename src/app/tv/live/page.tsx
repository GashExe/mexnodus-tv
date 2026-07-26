import Link from "next/link";
import { TvChannelCard } from "@/components/tv/TvChannelCard";
import { getHealthyChannels } from "@/lib/data";
import { EmptyState } from "@/components/ui";
import { flagEmoji, countryName } from "@/lib/geo";

/**
 * Canales en vivo, versión TV.
 *
 * Dos diferencias de fondo con la página de escritorio, ambas por lo mismo —
 * con un mando no se puede ir probando canales hasta acertar:
 *
 * 1. Solo se listan canales con alguna señal `online` y por https
 *    (`getHealthyChannels`). La de escritorio lista el catálogo entero, del que
 *    ~la mitad está caído según el job nocturno.
 * 2. Los filtros son píldoras enfocables, no `<select>`. En Fire OS un `select`
 *    abre un selector nativo que se traga el foco y rompe el recorrido del D-pad.
 *
 * La lista de países es corta a propósito: cien países en una tele no se
 * recorren. México primero, que es el catálogo propio del producto.
 */

const COUNTRIES = ["MX", "US", "ES", "AR", "CO"] as const;

export default async function TvLivePage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country } = await searchParams;
  // Sin parámetro, México: el motor de reproducción ya asume "MX" (resolve.ts).
  const active = country ?? "MX";
  const channels = await getHealthyChannels({
    country: active === "all" ? undefined : active,
    limit: 60,
  });

  const tabs = [
    ...COUNTRIES.map((c) => ({ key: c as string, label: `${flagEmoji(c)} ${countryName(c)}` })),
    { key: "all", label: "Todos" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">En vivo</h1>

      <div className="flex flex-wrap gap-3">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/tv/live?country=${t.key}`}
            data-focusable
            className={`rounded-pill px-5 py-2.5 text-base focus-visible:outline-none ${
              active === t.key ? "bg-accent text-white" : "border border-line bg-surface text-ink-2"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {channels.length === 0 ? (
        <EmptyState
          title="Ningún canal con señal viva aquí"
          hint="Solo se muestran canales verificados y accesibles. Prueba con otro país."
        />
      ) : (
        <div className="grid grid-cols-3 gap-4 py-2">
          {channels.map((ch) => (
            <TvChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}
