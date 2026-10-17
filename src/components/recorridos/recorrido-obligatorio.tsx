"use client";

import { usePathname } from "next/navigation";
import { useAcceso } from "@/components/providers/acceso-provider";
import { useRecorridoObligatorio } from "@/hooks/use-recorrido-obligatorio";
import { decidirRecorrido } from "@/lib/recorridos/reglas";
import type { RecorridoPendiente } from "@/lib/recorridos/registro";

/**
 * Corre el recorrido obligatorio que le falta a quien entra (lo decide el layout con
 * `recorridos_vistos`). No pinta nada propio: el recorrido es driver.js sobre el header y el
 * panel de reporte.
 *
 * La pantalla se evalúa acá y no en el servidor porque el layout no la conoce y no se vuelve a
 * renderizar al navegar: en `/fichadas/escanear` espera, y arranca cuando la persona va a otra.
 */
export function RecorridoObligatorio({ pendiente }: { pendiente: RecorridoPendiente | null }) {
  const acceso = useAcceso();
  const pathname = usePathname();
  const habilitado = !!pendiente && decidirRecorrido({ pathname, acceso }) === "mostrar";
  useRecorridoObligatorio(pendiente, { habilitado });
  return null;
}
