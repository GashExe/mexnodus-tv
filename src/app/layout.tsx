import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/nav/TopNav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "MexNodus TV",
  description:
    "Plataforma unificada de catálogo y reproducción: cine, series, anime, TV en vivo, radio y FAST.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    role = (data as { role?: string } | null)?.role ?? "user";
  }

  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <body>
        <Providers>
          <TopNav signedIn={!!user} role={role} email={user?.email ?? null} />
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-4 sm:px-8">{children}</main>
          <footer className="mx-auto max-w-[1600px] px-4 py-10 text-xs text-ink-3 sm:px-8">
            MexNodus TV · núcleo funcional · reproduce únicamente fuentes aprobadas y autorizadas.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
