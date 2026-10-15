// En la calle (/direccion/calle): ¿qué material está afuera, qué venció y qué hay que hacer
// esta semana? Lee su RespuestaPantalla en el servidor (cacheada 10 min; si Odoo no
// responde, el último snapshot con la banda) y la pinta con VistaCalle. Nada es reservado.

import { MarcoPantalla } from "@/components/direccion";
import { VistaCalle } from "@/components/direccion/calle/vista";
import type { DetalleCalle } from "@/lib/direccion/calculo/calle-reglas";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerPantalla } from "@/lib/direccion/servidor";

export default async function PaginaCalle() {
  const s = await sesionPaginaDireccion();
  if (!s) return null; // el layout ya muestra "No tenés acceso a Dirección"
  const r = await obtenerPantalla<DetalleCalle | null>("calle", { conSocios: s.conSocios });
  return <MarcoPantalla respuesta={r}>{(r) => <VistaCalle resultado={r} />}</MarcoPantalla>;
}
