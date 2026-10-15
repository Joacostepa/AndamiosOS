// Caja (/direccion/caja): ¿cuánta plata hay de verdad y llegamos las próximas 8 semanas?
// Lee su RespuestaPantalla en el servidor (cacheada, con lo reservado ya recortado según
// quien mira) y la pinta con VistaCaja. Contrato: docs/direccion/implementacion.md.

import { MarcoPantalla } from "@/components/direccion";
import { VistaCaja } from "@/components/direccion/caja/vista";
import type { DetalleCaja } from "@/lib/direccion/calculo/caja";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerPantalla } from "@/lib/direccion/servidor";

export default async function PaginaCaja() {
  const s = await sesionPaginaDireccion();
  if (!s) return null; // el layout ya muestra "No tenés acceso a Dirección"
  const r = await obtenerPantalla<DetalleCaja>("caja", { conSocios: s.conSocios });
  return <MarcoPantalla respuesta={r}>{(r) => <VistaCaja resultado={r} />}</MarcoPantalla>;
}
