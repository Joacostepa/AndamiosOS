import { ProveedorCorteHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { leerParametrosPantalla } from "@/lib/hoja-dia/parametros-pantalla";

// Planificación (el tablero y la Hoja del día: Pizarrón y Camiones): la hora de corte, que
// decide qué día abre la hoja ("Mañana" desde las 15), leída antes de dibujar.

export default async function PlanificacionLayout({ children }: { children: React.ReactNode }) {
  const p = await leerParametrosPantalla();
  return (
    <ProveedorCorteHoja corteMin={p.corteMin}>{children}</ProveedorCorteHoja>
  );
}
