import type { NextConfig } from "next";

// El saludo con voz del WhatsApp de clientes (src/lib/clientes/voz.ts) procesa el audio con
// ffmpeg (ffmpeg-static) y lo mezcla con un fondo que lee del disco. Corre en el webhook y en
// «Devolver a Tomás» (/api/comercial/clientes/…).
const SALUDO_VOZ = ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/clientes/voz/**/*"];

const nextConfig: NextConfig = {
  // Sistemas: la versión del bundle que tiene abierto quien reporta (contexto-cliente.ts). El
  // servidor guarda la suya (VERCEL_GIT_COMMIT_SHA) y la bandeja avisa si difieren.
  env: { NEXT_PUBLIC_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
  // ffmpeg-static devuelve la ruta del binario dentro de node_modules: no se empaqueta.
  serverExternalPackages: ["ffmpeg-static"],
  // El PDF de la propuesta (src/lib/cotizador/pdf) lee las fuentes Poppins y el logo del disco:
  // sin esto el trazado de archivos de Next no los sube a las funciones de Vercel y el PDF
  // sale sin tipografía o no sale.
  // WhatsApp también arma PDFs (el asistente corre dentro del webhook).
  outputFileTracingIncludes: {
    "/api/comercial/**": ["./src/lib/cotizador/pdf/recursos/**/*", ...SALUDO_VOZ],
    "/api/whatsapp/**": ["./src/lib/cotizador/pdf/recursos/**/*", ...SALUDO_VOZ],
  },
};

export default nextConfig;
