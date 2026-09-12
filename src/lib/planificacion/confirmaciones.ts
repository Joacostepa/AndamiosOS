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

/**
 * Las últimas confirmaciones del tablero entero, para el panel de actividad.
 *
 * AGRUPADAS POR GESTO, no una línea por jornada: confirmar un bloque de cuatro días
 * escribe cuatro filas en el mismo segundo, y el panel tiene que decir "confirmó 4
 * jornadas" y no repetir la misma frase cuatro veces. La tabla guarda fino —cada jornada
 * se lleva su historia cuando el tramo se parte— y la pantalla agrupa.
 *
 * El corte es autor + OT + estado + el minuto: dos confirmaciones de la misma obra
 * separadas por horas son dos decisiones y se muestran aparte.
 */
export async function confirmacionesRecientes(
  db: DB,
  limite = 200,
): Promise<{
  id: string;
  otId: number;
  estado: EstadoConfirmacion;
  fechas: string[];
  autorNombre: string | null;
  createdAt: string;
}[]> {
  const { data, error } = await db
    .from(TABLA)
    .select("id, asignacion_odoo_id, odoo_ot_id, fecha, estado, created_at, user_profiles(nombre)")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);

  const grupos = new Map<string, {
    id: string; otId: number; estado: EstadoConfirmacion; fechas: string[];
    autorNombre: string | null; createdAt: string;
  }>();

  for (const fila of (data ?? []) as unknown as Fila[]) {
    const autor = fila.user_profiles?.nombre ?? null;
    const clave = `${autor}|${fila.odoo_ot_id}|${fila.estado}|${fila.created_at.slice(0, 16)}`;
    const ya = grupos.get(clave);
    if (ya) {
      if (fila.fecha) ya.fechas.push(fila.fecha);
      continue;
    }
    grupos.set(clave, {
      id: fila.id,
      otId: fila.odoo_ot_id,
      estado: fila.estado,
      fechas: fila.fecha ? [fila.fecha] : [],
      autorNombre: autor,
      createdAt: fila.created_at,
    });
  }

  for (const g of grupos.values()) g.fechas.sort();
  return [...grupos.values()];
}
