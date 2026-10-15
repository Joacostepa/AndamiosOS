// La semana (/direccion): ¿cómo estamos y qué hay que decidir?
// Lee su RespuestaPantalla en el servidor (cacheada, con lo reservado ya recortado) y lo
// guardado en Supabase (dueños, notas, metas) con la sesión de quien mira. Sólo viajan los
// dueños y las notas de las decisiones que esa persona ve. Contrato: docs/direccion/implementacion.md.

import { EstadoSinDatos, MarcoPantalla } from "@/components/direccion";
import { VistaSemana } from "@/components/direccion/semana/vista";
import { createClient } from "@/lib/supabase/server";
import { propiosDeDecisiones } from "@/lib/direccion/calculo/decisiones";
import type { DetalleSemana } from "@/lib/direccion/calculo/semana";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { leerPropios } from "@/lib/direccion/propios";
import { metasVisibles } from "@/lib/direccion/diccionario";
import { obtenerPantalla } from "@/lib/direccion/servidor";

export default async function PaginaSemana() {
  const s = await sesionPaginaDireccion();
  if (!s) return null; // el layout ya muestra "No tenés acceso a Dirección"
  const [r, propios] = await Promise.all([
    obtenerPantalla<DetalleSemana>("semana", { conSocios: s.conSocios }),
    leerPropios(await createClient()),
  ]);
  return (
    <MarcoPantalla respuesta={r}>
      {(r) => {
        if (!r.detalle || !r.detalle.titulos) return <EstadoSinDatos motivo="Todavía no hay datos de La semana." />;
        const ids = (r.decisiones ?? []).map((d) => d.id);
        const { duenos, notas } = propiosDeDecisiones(ids, propios.duenos, propios.notas);
        // Metas de indicadores reservados: sólo a socios (también lo recorta la RLS).
        const metas = metasVisibles(propios.metas, s.conSocios);
        return <VistaSemana resultado={r} propios={{ disponible: propios.disponible, duenos, notas, metas }} />;
      }}
    </MarcoPantalla>
  );
}
