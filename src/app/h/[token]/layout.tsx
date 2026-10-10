import type { Metadata, Viewport } from "next";

// El link del capataz y del chofer (/h/<token>): sin sidebar ni sesión, claro de alto
// contraste SIEMPRE (al sol el oscuro del escritorio no se lee), que no lo indexe nadie
// y que el token no viaje como "Referer" a Google Maps ni a ningún lado.

export const metadata: Metadata = {
  title: "Tu hoja del día · Andamios Buenos Aires",
  description: "Dónde vas, a qué hora y con quién.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  // El manifest de la app abre el escritorio: este link no se instala como AndamiosOS.
  manifest: null,
  appleWebApp: { capable: false, title: "Hoja del día" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Se puede hacer zoom (accesibilidad): el visor de planos tiene el suyo.
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

// El tema del escritorio (next-themes) pone `dark` en <html>; acá el fondo es blanco igual.
const CLARO = "html,body{background:#fff!important;color-scheme:light}body{overscroll-behavior-y:none}";

export default function HojaLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style href="hoja-dia-celular-claro" precedence="high">{CLARO}</style>
      <div style={{ height: "100dvh", width: "100%", background: "#fff" }}>{children}</div>
    </>
  );
}
