import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="font-mono text-6xl font-bold text-accent">404</p>
        <p className="mt-3 text-lg">No encontramos ese contenido.</p>
        <Link href="/" className="mt-5 inline-block rounded-pill bg-accent px-6 py-3 font-semibold text-white">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
