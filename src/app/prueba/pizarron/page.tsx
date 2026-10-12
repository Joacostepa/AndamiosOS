import { notFound } from "next/navigation";
import { ArnesPizarron } from "@/components/hoja-dia/pizarron/arnes-prueba";

// El Pizarrón montado SIN sesión ni Supabase, para el arnés de Playwright (e2e/hoja-dia).
// Sólo en desarrollo: en producción es un 404 (y el proxy tampoco la deja pasar sin sesión).
// Las llamadas a /api/hoja-dia* las contesta el arnés con `page.route` (el escenario del
// martes 13 y optimista.ts); esta página no lee nada por su cuenta.

export const dynamic = "force-dynamic";

export default function PruebaPizarronPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ArnesPizarron />;
}
