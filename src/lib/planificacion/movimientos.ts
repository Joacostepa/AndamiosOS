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
  AccionMovimiento, EstadoBloque, Movimiento, RegistroCorrida, RegistroMovimiento,
} from "@/lib/tablero/tipos-movimiento";

type DB = SupabaseClient;

const TABLA = "plan_movimientos";

const COLUMNAS =
  "id, odoo_ot_id, ot_titulo, accion, asignacion_ids, antes, despues, deshace_a, lote_id, created_at, user_profiles(nombre)";

type Fila = {
  id: string;
  odoo_ot_id: number;
  ot_titulo: string | null;
  accion: AccionMovimiento;
  asignacion_ids: number[] | null;
  antes: EstadoBloque | null;
  despues: EstadoBloque | null;
  deshace_a: string | null;
  lote_id: string | null;
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
    loteId: f.lote_id,
    deshecho: deshechos.has(f.id),
    autorNombre: f.user_profiles?.nombre ?? null,
    createdAt: f.created_at,
  };
}

/**
 * Colapsa las filas de un mismo lote en una sola línea.
 *
 * Correr un día escribe una fila POR OBRA —la ficha de cada obra tiene que poder mostrar
 * la suya— pero en el panel de actividad esas doce filas son un solo gesto. Se colapsa
 * acá y no en la base por el mismo motivo que se agrupan las confirmaciones: la tabla
 * guarda fino y la pantalla resume.
 *
 * SE QUEDA CON LA PRIMERA FILA del lote, que trae el antes/después de una obra cualquiera.
 * Alcanza porque todas se corrieron el mismo día y con el mismo salto: lo que se muestra
 * es "del jueves al viernes", no las fechas de esa obra en particular.
 *
 * EL LOTE ESTÁ DESHECHO SI LO ESTÁ CUALQUIERA DE SUS FILAS: el deshacer devuelve el lote
 * entero o no devuelve nada, así que una sola alcanza para saberlo.
 */
function colapsarLotes(movimientos: Movimiento[]): Movimiento[] {
  const salida: Movimiento[] = [];
  const yaVisto = new Map<string, Movimiento>();

  for (const m of movimientos) {
    if (!m.loteId) {
      salida.push(m);
      continue;
    }
    const cabeza = yaVisto.get(m.loteId);
    if (!cabeza) {
      const nuevo: Movimiento = {
        ...m,
        lote: { jornadas: m.asignacionIds.length, obras: 1 },
      };
      yaVisto.set(m.loteId, nuevo);
      salida.push(nuevo);
      continue;
    }
    cabeza.lote!.jornadas += m.asignacionIds.length;
    cabeza.lote!.obras += 1;
    cabeza.asignacionIds = [...cabeza.asignacionIds, ...m.asignacionIds];
    cabeza.deshecho = cabeza.deshecho || m.deshecho;
  }

  return salida;
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

/**
 * Anota un corrimiento: una fila por obra, todas con el mismo lote.
 *
 * DEVUELVE LOS IDS POR OBRA para que el deshacer pueda apuntar cada fila suya a la que
 * vino a deshacer, y el panel marque el corrimiento original como deshecho sin ninguna
 * columna nueva. Se emparejan por número de obra y no por el orden en que volvieron: el
 * orden de un insert múltiple no es algo que valga la pena asumir.
 *
 * NUNCA TIRA, igual que registrarMovimiento: las jornadas ya se movieron en Odoo y eso es
 * lo que el usuario pidió. Lo que se pierde si falla es la línea del historial —y el poder
 * deshacer desde el panel—, no el corrimiento.
 */
export async function registrarCorrimiento(
  db: DB,
  registros: RegistroCorrida[],
  opts: { deshaceA?: Map<number, string> } = {},
): Promise<{ loteId: string; porOt: Map<number, string> } | null> {
  if (registros.length === 0) return null;
  const loteId = crypto.randomUUID();

  try {
    const { data, error } = await db
      .from(TABLA)
      .insert(
        registros.map((r) => ({
          odoo_ot_id: r.otId,
          ot_titulo: r.otTitulo,
          accion: "correr" as const,
          asignacion_ids: r.asignacionIds,
          antes: r.antes,
          despues: r.despues,
          deshace_a: opts.deshaceA?.get(r.otId) ?? null,
          lote_id: loteId,
        })),
      )
      .select("id, odoo_ot_id");
    if (error) throw new Error(error.message);

    const porOt = new Map<number, string>();
    for (const f of (data ?? []) as { id: string; odoo_ot_id: number }[]) {
      porOt.set(f.odoo_ot_id, f.id);
    }
    return { loteId, porOt };
  } catch (e) {
    console.error("[planificacion] no se pudo registrar el corrimiento", e);
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

/**
 * Los últimos movimientos del tablero entero. Es lo que lee el panel de actividad.
 *
 * El límite se pide más grande de lo que se muestra porque un corrimiento se lleva doce
 * filas de un saque y después se colapsan en una: con el límite justo, una lluvia dejaría
 * el panel mostrando dos líneas.
 */
export async function movimientosRecientes(db: DB, limite = 100): Promise<Movimiento[]> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .order("created_at", { ascending: false })
    .limit(limite * 2);
  if (error) throw new Error(error.message);
  const filas = await conDeshechos(db, (data ?? []) as unknown as Fila[]);
  return colapsarLotes(filas).slice(0, limite);
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
