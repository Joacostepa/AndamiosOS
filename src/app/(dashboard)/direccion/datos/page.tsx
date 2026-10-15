// Datos y definiciones (/direccion/datos): diccionario de indicadores (fijo, con las metas de
// Supabase) y el registro de calidad de los datos (calculado: avisos automáticos + manuales).
// El diccionario se muestra aunque Odoo no responda (no depende de Odoo). Lo reservado
// (avisos de retiros, indicador Retiros) ya llega recortado según quien mira.

import { LecturaPantalla, MarcoPantalla } from "@/components/direccion";
import { VistaDatos } from "@/components/direccion/datos/vista-datos";
import { createClient } from "@/lib/supabase/server";
import { sesionPaginaDireccion } from "@/lib/direccion/permisos-servidor";
import { leerPropios } from "@/lib/direccion/propios";
import { metasVisibles } from "@/lib/direccion/diccionario";
import { obtenerPantalla } from "@/lib/direccion/servidor";
import type { DetalleDatos } from "@/lib/direccion/calculo/datos";

export default async function PaginaDatos() {
  const s = await sesionPaginaDireccion();
  if (!s) return null; // el layout ya muestra "No tenés acceso a Dirección"
  const [r, propios] = await Promise.all([obtenerPantalla<DetalleDatos>("datos", { conSocios: s.conSocios }), leerPropios(await createClient())]);
  // Metas de indicadores reservados: sólo a socios (también lo recorta la RLS).
  const metas = metasVisibles(propios.metas, s.conSocios);
  if (!r.ok) {
    return (
      <>
        <LecturaPantalla pantalla="datos" lectura={null} tc={null} />
        <VistaDatos resultado={null} motivo={r.motivo} metas={metas} guardable={propios.disponible} />
      </>
    );
  }
  return <MarcoPantalla respuesta={r}>{(r) => <VistaDatos resultado={r} metas={metas} guardable={propios.disponible} />}</MarcoPantalla>;
}
