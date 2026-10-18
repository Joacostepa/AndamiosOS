// Las marcas de comodín (plan_comodines), del lado del servidor. SÓLO SERVIDOR.
//
// Contrato: docs/tablero-planificacion/guardias-contrato.md §2 (reescrito el 18/10, decidido
// por JS): un comodín es una OT que Planificación MARCÓ, no una que cumple una regla. Lo que se
// hace con la marca (cruzarla con el tablero, ordenarla, decir si puede ir a una guardia) es
// puro y está en src/lib/tablero/comodines.ts; esto sólo la lee y la escribe.
//
// DOS LECTORES, DOS CLIENTES:
//   · la ruta /api/planificacion/comodines lee y escribe con la SESIÓN de quien marca: la RLS
//     de la migración 20261018100003 exige planificación en "editar" para escribir y firma la
//     marca con auth.uid(), así que no hay forma de marcar con el nombre de otro;
//   · el candado de las guardias (candado-guardias.ts, prepararUso en guardias.ts) y la corrida
//     de las 13 h leen con la SERVICE ROLE, como el resto de lo que leen.
//
// LEER FALLA HACIA AFUERA (tira). Cada llamador decide qué hacer: el candado, que falla
// cerrado, trata a la obra como no comodín (pide autorización a JS); la corrida de las 13 h
// avisa sin comodines antes que no avisar.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Marcados } from "@/lib/tablero/comodines";
import type { MarcaComodin } from "@/lib/tablero/guardias-tipos";

type DB = SupabaseClient;

export const TABLA_COMODINES = "plan_comodines";

type Fila = { ot_id: number | string; marcado_por: string | null; marcado_el: string };

/**
 * Las marcas, como las usa la regla pura: otId → cuándo se marcó. `otIds` acota la lectura
 * (el candado pregunta por una sola obra); sin eso, todas.
 */
export async function leerMarcados(db: DB, otIds?: readonly number[]): Promise<Marcados> {
  if (otIds && otIds.length === 0) return new Map();
  let q = db.from(TABLA_COMODINES).select("ot_id, marcado_el");
  if (otIds) q = q.in("ot_id", [...new Set(otIds)]);
  const { data, error } = await q;
  if (error) throw new Error(`No pude leer los comodines: ${error.message}`);
  return new Map(((data ?? []) as Pick<Fila, "ot_id" | "marcado_el">[]).map((f) => [Number(f.ot_id), f.marcado_el]));
}

/**
 * Todas las marcas con el nombre de quien las puso, para la pantalla. El nombre sale de
 * user_profiles en UNA consulta más; si falla, la marca llega igual sin nombre (el nombre es
 * para el tooltip, no para decidir nada).
 */
export async function leerMarcas(db: DB): Promise<MarcaComodin[]> {
  const { data, error } = await db
    .from(TABLA_COMODINES)
    .select("ot_id, marcado_por, marcado_el")
    .order("marcado_el", { ascending: true });
  if (error) throw new Error(`No pude leer los comodines: ${error.message}`);
  const filas = (data ?? []) as Fila[];
  const nombres = await nombresDe(db, filas.map((f) => f.marcado_por));
  return filas.map((f) => aMarca(f, nombres));
}

/**
 * Marca una OT. Si ya estaba marcada NO se toca: el `marcado_el` es el orden de la bandeja y
 * del relleno, y volver a marcar (dos pestañas, un doble clic) no tiene por qué mandarla al
 * final de la cola. Devuelve la marca como quedó.
 */
export async function marcarComodin(db: DB, otId: number): Promise<MarcaComodin> {
  // marcado_por lo pone la base (DEFAULT auth.uid()) y la política exige que sea quien
  // escribe: no se manda desde acá para que no haya dos fuentes del mismo dato.
  const { error } = await db.from(TABLA_COMODINES).insert({ ot_id: otId });
  // 23505 = ya estaba marcada. Es lo que se quería: se devuelve la marca que hay.
  if (error && error.code !== "23505") throw new Error(`No pude marcar el comodín: ${error.message}`);
  const { data, error: e2 } = await db
    .from(TABLA_COMODINES)
    .select("ot_id, marcado_por, marcado_el")
    .eq("ot_id", otId)
    .maybeSingle();
  if (e2) throw new Error(`No pude leer el comodín: ${e2.message}`);
  if (!data) throw new Error("No pude marcar el comodín: la marca no quedó guardada.");
  const fila = data as Fila;
  return aMarca(fila, await nombresDe(db, [fila.marcado_por]));
}

/**
 * Quita la marca. Quitar una que no estaba no es un error (dos personas quitando la misma, o
 * un tablero viejo): el resultado es el mismo. Devuelve si había algo que quitar.
 *
 * OJO CON LA RLS: un DELETE que la política no deja pasar no tira, borra cero filas. Por eso
 * la ruta exige el permiso ANTES (exigirPermisoDeApi), y acá se pide la fila borrada de vuelta
 * para no confundir "no estaba" con "no me dejaron" sin saberlo.
 */
export async function quitarComodin(db: DB, otId: number): Promise<boolean> {
  const { data, error } = await db.from(TABLA_COMODINES).delete().eq("ot_id", otId).select("ot_id");
  if (error) throw new Error(`No pude quitar el comodín: ${error.message}`);
  return (data ?? []).length > 0;
}

function aMarca(f: Fila, nombres: Map<string, string>): MarcaComodin {
  return {
    otId: Number(f.ot_id),
    marcadoEl: f.marcado_el,
    marcadoPorNombre: f.marcado_por ? (nombres.get(f.marcado_por) || null) : null,
  };
}

async function nombresDe(db: DB, ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await db.from("user_profiles").select("id, nombre").in("id", unicos);
  if (error) {
    console.error("[comodines] no se pudieron leer los nombres", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.id as string, ((p.nombre as string | null) ?? "").trim()]));
}
