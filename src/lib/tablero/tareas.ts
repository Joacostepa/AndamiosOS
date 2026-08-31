// Tarjetas de operaciones, contra Supabase (tablero_tareas).
//
// Recibe el cliente por parámetro y no lo crea, igual que src/lib/planificacion/notas.ts:
// así el módulo no arrastra nada server-only y las políticas de RLS corren con la sesión
// de quien pide.
//
// LO IMPORTANTE DE ESTE ARCHIVO es `mapear`: devuelve AsignacionTablero, no un tipo
// propio. Una tarea entra al tablero como una asignación más y desde ahí para arriba
// nadie distingue de qué base salió — la capacidad de la celda y el armado de bloques
// funcionan sin enterarse. Ver el comentario de la migración.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AsignacionTablero, CambioTarea, NuevaTarea } from "@/lib/tablero/tipos";

type DB = SupabaseClient;

const TABLA = "tablero_tareas";

const COLUMNAS = "id, grupo_id, titulo, tipo, notas, cuadrilla_odoo_id, fecha, fraccion, orden_dia, hecha";

type Fila = {
  id: number;
  grupo_id: number;
  titulo: string;
  tipo: string;
  notas: string | null;
  cuadrilla_odoo_id: number | null;
  fecha: string;
  fraccion: number | string;
  orden_dia: number;
  hecha: boolean;
};

function mapear(f: Fila): AsignacionTablero {
  const fraccion = Number(f.fraccion);
  return {
    id: f.id,
    origen: "tarea",
    // Sin OT detrás. Es 0 y no null para no obligar a cada consumidor a manejar el nulo:
    // lo que dice que no hay obra es `origen`, no este número.
    otId: 0,
    tarea: {
      grupoId: f.grupo_id,
      titulo: f.titulo,
      tipo: f.tipo,
      hecha: f.hecha,
    },
    fecha: f.fecha,
    cuadrillaId: f.cuadrilla_odoo_id,
    fraccion: Number.isFinite(fraccion) && fraccion > 0 ? fraccion : 1,
    // Una tarea no se confirma ni queda tentativa: la puso Operaciones y va. Se declara
    // confirmada para que la tarjeta salga con relleno sólido y no con el borde punteado,
    // que en este tablero significa "todavía es borrador".
    estado: "confirmada",
    ordenDia: f.orden_dia,
    notas: f.notas,
    // No hay parte diario: el cierre de una tarea es el booleano `hecha`.
    parteId: null,
  };
}

/** Las tareas del rango que dibuja el tablero, ya con forma de asignación. */
export async function tareasEnRango(
  db: DB,
  desde: string,
  hasta: string,
): Promise<AsignacionTablero[]> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("orden_dia")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => mapear(f as unknown as Fila));
}

/**
 * Crea los días de UNA tarea y devuelve los ids.
 *
 * El grupo se resuelve en dos pasos y no con un trigger: se inserta el primer día sin
 * grupo, y su propio id pasa a ser el grupo de todos. Así el id vuelve en el mismo
 * insert y no hace falta una secuencia aparte.
 *
 * `grupoId` viene con valor cuando se le agregan días a una tarea que ya existe.
 */
export async function crearTarea(
  db: DB,
  dias: NuevaTarea[],
  autorId: string | null,
  grupoId?: number,
): Promise<number[]> {
  if (dias.length === 0) return [];

  const fila = (d: NuevaTarea, grupo: number | null) => ({
    // grupo_id es NOT NULL, así que el primer día se inserta con un valor cualquiera y
    // se corrige enseguida con el suyo propio. Se usa 0, que ningún id real toma.
    grupo_id: grupo ?? 0,
    titulo: d.titulo.trim(),
    tipo: d.tipo,
    notas: d.notas?.trim() || null,
    cuadrilla_odoo_id: d.cuadrillaId,
    fecha: d.fecha,
    fraccion: Number(d.fraccion),
    orden_dia: d.ordenDia ?? 0,
    autor_id: autorId,
  });

  if (grupoId != null) {
    const { data, error } = await db
      .from(TABLA)
      .insert(dias.map((d) => fila(d, grupoId)))
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => (r as { id: number }).id);
  }

  const [primero, ...resto] = dias;
  const { data: creado, error } = await db
    .from(TABLA)
    .insert(fila(primero, null))
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const grupo = (creado as { id: number }).id;

  const { error: e2 } = await db.from(TABLA).update({ grupo_id: grupo }).eq("id", grupo);
  if (e2) throw new Error(e2.message);

  const ids = [grupo];
  if (resto.length > 0) {
    const { data, error: e3 } = await db
      .from(TABLA)
      .insert(resto.map((d) => fila(d, grupo)))
      .select("id");
    if (e3) throw new Error(e3.message);
    ids.push(...(data ?? []).map((r) => (r as { id: number }).id));
  }
  return ids;
}

function valores(cambio: CambioTarea): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  if (cambio.titulo !== undefined) v.titulo = cambio.titulo.trim();
  if (cambio.tipo !== undefined) v.tipo = cambio.tipo;
  if (cambio.notas !== undefined) v.notas = cambio.notas?.trim() || null;
  if (cambio.cuadrillaId !== undefined) v.cuadrilla_odoo_id = cambio.cuadrillaId;
  if (cambio.fecha !== undefined) v.fecha = cambio.fecha;
  if (cambio.fraccion !== undefined) v.fraccion = Number(cambio.fraccion);
  if (cambio.ordenDia !== undefined) v.orden_dia = cambio.ordenDia;
  if (cambio.hecha !== undefined) v.hecha = cambio.hecha;
  return v;
}

/** Actualiza varios días con los mismos valores (mover una tarjeta, cambiar fracción…). */
export async function actualizarTareas(
  db: DB,
  ids: number[],
  cambio: CambioTarea,
): Promise<void> {
  const v = valores(cambio);
  if (ids.length === 0 || Object.keys(v).length === 0) return;
  const { error } = await db.from(TABLA).update(v).in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Mueve una tarjeta de varios días: cada id a su fecha. Un update por fecha distinta,
 * igual que moverAsignaciones del lado de Odoo.
 */
export async function moverTareas(
  db: DB,
  movimientos: { id: number; fecha: string; cuadrillaId?: number | null; ordenDia?: number }[],
): Promise<void> {
  for (const m of movimientos) {
    const v: Record<string, unknown> = { fecha: m.fecha };
    if (m.cuadrillaId !== undefined) v.cuadrilla_odoo_id = m.cuadrillaId;
    if (m.ordenDia !== undefined) v.orden_dia = m.ordenDia;
    const { error } = await db.from(TABLA).update(v).eq("id", m.id);
    if (error) throw new Error(error.message);
  }
}

/** Renombra o re-tipa TODOS los días de una tarea de una sola vez. */
export async function actualizarGrupo(
  db: DB,
  grupoId: number,
  cambio: CambioTarea,
): Promise<void> {
  const v = valores(cambio);
  if (Object.keys(v).length === 0) return;
  const { error } = await db.from(TABLA).update(v).eq("grupo_id", grupoId);
  if (error) throw new Error(error.message);
}

export async function borrarTareas(db: DB, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.from(TABLA).delete().in("id", ids);
  if (error) throw new Error(error.message);
}
