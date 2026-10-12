import { ProveedorCorteHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { ProveedorModoPizarron } from "@/components/hoja-dia/comunes/modo-pizarron";
import { leerParametrosPantalla } from "@/lib/hoja-dia/parametros-pantalla";

// Planificación (el tablero y la Hoja del día, clásica y Pizarrón): los dos parámetros que
// las pantallas necesitan antes de dibujar, en una sola consulta. La hora de corte decide qué
// día abre la hoja ("Mañana" desde las 15); el modo del Pizarrón, si las pestañas muestran
// "Pizarrón (nuevo)" (ver lib/hoja-dia/modo-pizarron.ts).

export default async function PlanificacionLayout({ children }: { children: React.ReactNode }) {
  const p = await leerParametrosPantalla();
  return (
    <ProveedorCorteHoja corteMin={p.corteMin}>
      <ProveedorModoPizarron modo={p.pizarron}>{children}</ProveedorModoPizarron>
    </ProveedorCorteHoja>
  );
}
