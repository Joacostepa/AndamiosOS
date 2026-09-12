// Movimientos del tablero, contra Supabase (plan_movimientos).
//
// Recibe el cliente por parámetro, igual que confirmaciones.ts: así el módulo no arrastra
// nada server-only y las políticas de RLS —que son las que hacen que la tabla sea
// append-only— corren con la sesión de quien pide.
//
// NO TOCA ODOO. El título de la obra viene denormalizado en la fila: el panel muestra
// movimientos de obras que no están en la ventana cargada del tablero, y resolver cada
// uno contra Odoo sería un RPC por línea.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccionMovimiento, EstadoBloque, Movimiento, RegistroMovimiento,
} from "@/lib/tablero/tipos-movimiento";

type DB = SupabaseClient;

const TABLA = "plan_movimientos";

const COLUMNAS =
  "id, odoo_ot_id, ot_titulo, accion, asignacion_ids, antes, despues, deshace_a, created_at, user_profiles(nombre)";

type Fila = {
  id: string;
  odoo_ot_id: number;
  ot_titulo: string | null;
  accion: AccionMovimiento;
  asignacion_ids: number[] | null;
  antes: EstadoBloque | null;
  despues: EstadoBloque | null;
  deshace_a: string | null;
  created_at: string;
  user_profiles?: { nombre: string } | null;
};

function mapear(f: Fila, deshechos: Set<string>): Movimiento {
  return {
    id: f.id,
    otId: f.odoo_ot_id,
    otTitulo: f.ot_titulo,
    accion: f.accion,
    asignacionIds: f.asignacion_ids ?? [],
    antes: f.antes,
    despues: f.despues,
    deshaceA: f.deshace_a,
    deshecho: deshechos.has(f.id),
    autorNombre: f.user_profiles?.nombre ?? null,
    createdAt: f.created_at,
  };
}

/**
 * Anota un gesto del tablero.
 *
 * Devuelve el id, que el tablero necesita para poder decir "esto deshace aquello" si
 * después se arrepiente. NO se pasa el autor: lo pone el default de la columna
 * (auth.uid()) y la política de RLS impide firmarlo con el nombre de otro.
 *
 * NUNCA TIRA. Un fallo al registrar no puede voltear el movimiento, que es lo que el
 * usuario pidió y que en Odoo ya pasó: queda en el log del servidor y devuelve null. El
 * historial es una ayuda, no una condición para poder planificar.
 */
export async function registrarMovimiento(
  db: DB,
  registro: RegistroMovimiento,
  asignacionIds: number[],
): Promise<string | null> {
  try {
    const { data, error } = await db
      .from(TABLA)
      .insert({
        odoo_ot_id: registro.otId,
        ot_titulo: registro.otTitulo,
        accion: registro.accion,
        asignacion_ids: asignacionIds,
        antes: registro.antes,
        despues: registro.despues,
        deshace_a: registro.deshaceA ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[planificacion] no se pudo registrar el movimiento", e);
    return null;
  }
}

/** Cuáles de estos movimientos ya fueron deshechos por otro. */
async function deshechosDe(db: DB, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await db.from(TABLA).select("deshace_a").in("deshace_a", ids);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((f) => (f as { deshace_a: string }).deshace_a));
}

/** Resuelve el "ya lo deshicieron" de un lote de filas y las mapea. */
async function conDeshechos(db: DB, filas: Fila[]): Promise<Movimiento[]> {
  const deshechos = await deshechosDe(db, filas.map((f) => f.id));
  return filas.map((f) => mapear(f, deshechos));
}

/** Los últimos movimientos del tablero entero. Es lo que lee el panel de actividad. */
export async function movimientosRecientes(db: DB, limite = 100): Promise<Movimiento[]> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return conDeshechos(db, (data ?? []) as unknown as Fila[]);
}

/** Los de una obra. Es lo que lee el panel de la tarjeta, junto al de confirmaciones. */
export async function movimientosDeOt(
  db: DB,
  otId: number,
  limite = 30,
): Promise<Movimiento[]> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .eq("odoo_ot_id", otId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return conDeshechos(db, (data ?? []) as unknown as Fila[]);
}
