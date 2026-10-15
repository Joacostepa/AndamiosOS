// Cobranzas (/direccion/cobranzas): ¿quién nos debe, desde cuándo y a quién llamamos hoy?
// Lee su RespuestaPantalla en el servidor (cacheada, con lo reservado ya recortado) y la pinta
// con VistaCobranzas. Contrato: docs/direccion/implementacion.md.

import { MarcoPantalla } from "@/components/direccion";
import { VistaCobranzas } from "@/components/direccion/cobranzas/vista";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerPantalla } from "@/lib/direccion/servidor";
import type { DetalleCobranzas } from "@/lib/direccion/calculo/cobranzas";

export default async function PaginaCobranzas() {
  const s = await sesionPaginaDireccion();
  if (!s) return null; // el layout ya muestra "No tenés acceso a Dirección"
  const r = await obtenerPantalla<DetalleCobranzas>("cobranzas", { conSocios: s.conSocios });
  return (
    <MarcoPantalla respuesta={r}>
      {/* Las partidas sólo las usa el desglose por cliente (API): no viajan con la página. */}
      {(r) => <VistaCobranzas resultado={r.detalle ? { ...r, detalle: { ...r.detalle, partidas: [] } } : r} />}
    </MarcoPantalla>
  );
}
