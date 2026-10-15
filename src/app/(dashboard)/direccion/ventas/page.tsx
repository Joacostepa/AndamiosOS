// Ventas (/direccion/ventas?g=&p=&vs=): ¿facturamos? ¿crece lo que importa? ¿ganamos?
// El período vive en la URL (§7.2): se lee acá y pasa al calculador (parte de la clave de
// caché). Sólo los parámetros de PARAMS_PANTALLA.ventas (src/lib/direccion/params.ts).
// El selector de período va arriba del contenido; el resto lo arma VistaVentas.

import { EnConstruccion, MarcoPantalla } from "@/components/direccion";
import { SelectorPeriodo } from "@/components/direccion/ventas/selector-periodo";
import { VistaVentas } from "@/components/direccion/ventas/vista";
import type { DetalleVentas } from "@/lib/direccion/calculo/ventas";
import { paramsDe } from "@/lib/direccion/params";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerPantalla } from "@/lib/direccion/servidor";

export default async function PaginaVentas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await sesionPaginaDireccion();
  if (!s) return null;
  const params = paramsDe("ventas", await searchParams);
  const r = await obtenerPantalla<DetalleVentas>("ventas", { conSocios: s.conSocios, params });
  return (
    <MarcoPantalla respuesta={r}>
      {(r) =>
        // Un snapshot viejo puede no traer el detalle: se muestran sus cifras igual.
        r.detalle?.periodo ? (
          <>
            <SelectorPeriodo key={JSON.stringify(r.detalle.periodo.params)} periodo={r.detalle.periodo} />
            <VistaVentas resultado={r} />
          </>
        ) : (
          <EnConstruccion resultado={r} titulo="Ventas" />
        )
      }
    </MarcoPantalla>
  );
}
