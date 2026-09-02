// Historial de confirmaciones de jornada, contra Supabase (plan_confirmaciones).
//
// Recibe el cliente por parámetro, como src/lib/habilitaciones/servicio.ts: así el módulo
// no arrastra nada server-only y las políticas de RLS —que son las que hacen que la tabla
// sea append-only— corren con la sesión de quien pide.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Confirmacion, EstadoConfirmacion } from "@/lib/tablero/tipos-confirmacion";

type DB = SupabaseClient;

const TABLA = "plan_confirmaciones";

type Fila = {
  id: string;
  asignacion_odoo_id: number;
  odoo_ot_id: number;
  fecha: string | null;
  estado: EstadoConfirmacion;
  created_at: string;
  user_profiles?: { nombre: string } | null;
};

function mapear(f: Fila): Confirmacion {
  return {
    id: f.id,
    asignacionId: f.asignacion_odoo_id,
    otId: f.odoo_ot_id,
    fecha: f.fecha,
    estado: f.estado,
    autorNombre: f.user_profiles?.nombre ?? null,
    createdAt: f.created_at,
  };
}

/**
 * Anota un cambio de estado, una fila por jornada.
 *
 * `fechas[i]` acompaña a `asignacionIds[i]`. Si vienen de distinta longitud se guarda sin
 * fecha antes que emparejar mal: el dato importante es quién y cuándo, y una fecha
 * equivocada en un registro de auditoría es peor que una fecha ausente.
 */
export async function registrarConfirmacion(
  db: DB,
  datos: {
    asignacionIds: number[];
    otId: number;
    fechas: (string | null)[];
    estado: EstadoConfirmacion;
    autorId: string | null;
  },
): Promise<void> {
  if (datos.asignacionIds.length === 0) return;
  const alineadas = datos.fechas.length === datos.asignacionIds.length;

  const { error } = await db.from(TABLA).insert(
    datos.asignacionIds.map((id, i) => ({
      asignacion_odoo_id: id,
      odoo_ot_id: datos.otId,
      fecha: alineadas ? datos.fechas[i] : null,
      estado: datos.estado,
      autor_id: datos.autorId,
    })),
  );
  if (error) throw new Error(error.message);
}

/** El historial de una obra, lo último primero. Es lo que lee el panel de la tarjeta. */
export async function historialDeOt(db: DB, otId: number): Promise<Confirmacion[]> {
  const { data, error } = await db
    .from(TABLA)
    .select("id, asignacion_odoo_id, odoo_ot_id, fecha, estado, created_at, user_profiles(nombre)")
    .eq("odoo_ot_id", otId)
    .order("created_at", { ascending: false })
    // Una obra larga que se confirmó y se volvió atrás muchas veces no tiene por qué
    // traer doscientas filas a un panel que muestra las últimas.
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => mapear(f as unknown as Fila));
}
