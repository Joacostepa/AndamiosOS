import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El PDF de la propuesta (src/lib/cotizador/pdf) lee las fuentes Poppins y el logo del disco:
  // sin esto el trazado de archivos de Next no los sube a las funciones de Vercel y el PDF
  // sale sin tipografía o no sale.
  // WhatsApp también arma PDFs (el asistente corre dentro del webhook).
  outputFileTracingIncludes: {
    "/api/comercial/**": ["./src/lib/cotizador/pdf/recursos/**/*"],
    "/api/whatsapp/**": ["./src/lib/cotizador/pdf/recursos/**/*"],
  },
};

export default nextConfig;
