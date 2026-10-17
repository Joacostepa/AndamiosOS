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
  AccionMovimiento, EstadoBloque, Movimiento, RegistroApoyoCorrida, RegistroCorrida, RegistroMovimiento,
} from "@/lib/tablero/tipos-movimiento";

type DB = SupabaseClient;

const TABLA = "plan_movimientos";

const COLUMNAS =
  "id, odoo_ot_id, ot_titulo, accion, asignacion_ids, antes, despues, deshace_a, lote_id, motivo, created_at, user_profiles(nombre)";

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
  motivo: string | null;
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
    motivo: f.motivo,
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

  // Un lote puede traer, además de las corridas, apoyos quitados (o recreados al deshacer):
  // ver RegistroApoyoCorrida. La cabeza tiene que ser una corrida —la frase es "Corrió el
  // día…"— y los totales cuentan sólo lo que se corrió. Un lote de sólo apoyos quitados
  // (se suspendió una cuadrilla que únicamente iba de apoyo) queda con su propia frase.
  const esCorrida = (x: Movimiento) => x.accion === "correr";
  for (const m of movimientos) {
    if (!m.loteId) {
      salida.push(m);
      continue;
    }
    const cabeza = yaVisto.get(m.loteId);
    if (!cabeza) {
      const nuevo: Movimiento = {
        ...m,
        lote: esCorrida(m) ? { jornadas: m.asignacionIds.length, obras: 1 } : { jornadas: 0, obras: 0 },
      };
      yaVisto.set(m.loteId, nuevo);
      salida.push(nuevo);
      continue;
    }
    if (esCorrida(m) && !esCorrida(cabeza)) {
      // La cabeza pasa a ser esta corrida; se conservan los totales y el resto.
      Object.assign(cabeza, {
        otId: m.otId, otTitulo: m.otTitulo, accion: m.accion, antes: m.antes, despues: m.despues,
      });
    }
    if (esCorrida(m)) {
      cabeza.lote!.jornadas += m.asignacionIds.length;
      cabeza.lote!.obras += 1;
    }
    cabeza.asignacionIds = [...cabeza.asignacionIds, ...m.asignacionIds];
    cabeza.deshecho = cabeza.deshecho || m.deshecho;
  }
  // Un lote sin ninguna corrida no lleva totales: se lee con la frase de su acción.
  for (const m of salida) if (m.lote && m.lote.obras === 0) delete m.lote;

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
  opts: { motivo: string; deshaceA?: Map<number, string>; apoyos?: RegistroApoyoCorrida[] },
): Promise<{ loteId: string; porOt: Map<number, string> } | null> {
  const apoyos = opts.apoyos ?? [];
  if (registros.length === 0 && apoyos.length === 0) return null;
  const loteId = crypto.randomUUID();
  const comun = { lote_id: loteId, motivo: opts.motivo };

  try {
    const { data, error } = await db
      .from(TABLA)
      .insert([
        ...registros.map((r) => ({
          odoo_ot_id: r.otId,
          ot_titulo: r.otTitulo,
          accion: "correr" as const,
          asignacion_ids: r.asignacionIds,
          antes: r.antes,
          despues: r.despues,
          deshace_a: opts.deshaceA?.get(r.otId) ?? null,
          ...comun,
        })),
        // Los apoyos que quitó el corrimiento (o que el deshacer vuelve a crear). Mismas
        // columnas y mismo lote: no hace falta migración, "quitar" y "crear" ya están en
        // el CHECK de `accion`.
        ...apoyos.map((r) => ({
          odoo_ot_id: r.otId,
          ot_titulo: r.otTitulo,
          accion: r.accion,
          asignacion_ids: r.asignacionIds,
          antes: r.antes,
          despues: r.despues,
          deshace_a: opts.deshaceA?.get(r.otId) ?? null,
          ...comun,
        })),
      ])
      .select("id, odoo_ot_id, accion");
    if (error) throw new Error(error.message);

    // Por obra, prefiriendo la fila de la corrida: es la que el deshacer marca como
    // deshecha. La de un apoyo quitado sólo cuando la obra no tuvo corrida en el lote.
    const porOt = new Map<number, string>();
    for (const f of (data ?? []) as { id: string; odoo_ot_id: number; accion: string }[]) {
      if (f.accion === "correr" || !porOt.has(f.odoo_ot_id)) porOt.set(f.odoo_ot_id, f.id);
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
