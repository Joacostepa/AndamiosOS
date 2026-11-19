// El PM de cada obra (plan_pm_ot), del lado del servidor. SÓLO SERVIDOR.
//
// Se lee y se escribe con la SESIÓN de quien lo hace: la RLS de la migración 20261119000001
// decide quién puede tomar, pasar o soltar (ver su encabezado). Lo puro está en
// src/lib/tablero/pm.ts.
//
// NO SE PISAN POR LA CLAVE PRIMARIA: tomar es un INSERT, y si otro la tomó un instante antes la
// base contesta 23505. A diferencia de marcarComodin —donde "ya estaba" es éxito— acá es el
// caso que importa: se devuelve quién la tiene para decir "Ya la tomó Juani".

import type { SupabaseClient } from "@supabase/supabase-js";
import { nombrePm, type CandidatoPm, type PmDeObra } from "@/lib/tablero/pm";

type DB = SupabaseClient;

export const TABLA_PM = "plan_pm_ot";

type Fila = { ot_id: number | string; pm: string; asignado_por: string | null; asignado_el: string };

/** Error de negocio con su status: la ruta lo devuelve tal cual. */
export class ErrorPm extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Todos los PMs asignados. Pocas filas: una por obra activa con PM. */
export async function leerPms(db: DB): Promise<PmDeObra[]> {
  const { data, error } = await db.from(TABLA_PM).select("ot_id, pm, asignado_por, asignado_el");
  if (error) throw new Error(`No pude leer los PMs: ${error.message}`);
  const filas = (data ?? []) as Fila[];
  const nombres = await nombresDe(db, filas.flatMap((f) => [f.pm, f.asignado_por]));
  return filas.map((f) => aPm(f, nombres));
}

/** Quiénes pueden ser PM: "PM de obras" en «editar» en su perfil, y activos. */
export async function leerCandidatos(db: DB): Promise<CandidatoPm[]> {
  // Se filtra acá y no con `permisos->>planificacion-pm` en la consulta: el guion de la clave
  // no es seguro en la sintaxis de filtros de PostgREST, y son una docena de perfiles.
  const { data, error } = await db.from("user_profiles").select("id, nombre, permisos").eq("activo", true).order("nombre");
  if (error) throw new Error(`No pude leer quiénes son PM: ${error.message}`);
  return (data ?? [])
    .filter((p) => (p.permisos as Record<string, unknown> | null)?.["planificacion-pm"] === "editar")
    .map((p) => ({ id: p.id as string, nombre: nombrePm(p.nombre as string | null) }));
}

/**
 * Asigna el PM de una obra que no tiene. Si ya tiene, 409 con el nombre de quien la tiene: es
 * lo que pasa cuando dos tocan "Tomar" a la vez.
 */
export async function asignarPm(db: DB, otId: number, pm: string): Promise<PmDeObra> {
  const { error } = await db.from(TABLA_PM).insert({ ot_id: otId, pm });
  if (error) {
    if (error.code === "23505") {
      const actual = await leerUno(db, otId);
      const quien = actual ? actual.pmNombre : "otra persona";
      throw new ErrorPm(`Ya la tomó ${quien}.`, 409);
    }
    // La RLS rechaza el INSERT con 42501: no es PM, o quiso asignar a otro sin editar Planificación.
    if (error.code === "42501") throw new ErrorPm("No podés asignar esta obra a esa persona.", 403);
    throw new Error(`No pude asignar el PM: ${error.message}`);
  }
  const fila = await leerUno(db, otId);
  if (!fila) throw new Error("No pude asignar el PM: no quedó guardado.");
  return fila;
}

/**
 * Pasa la obra a otro PM. `de` es quién la tenía según la pantalla de quien la pasa: si mientras
 * tanto cambió, no se toca (409), para no pisar un cambio que esa pantalla no vio.
 */
export async function pasarPm(db: DB, otId: number, pm: string, de: string): Promise<PmDeObra> {
  const { data, error } = await db.from(TABLA_PM).update({ pm }).eq("ot_id", otId).eq("pm", de).select("ot_id");
  if (error) {
    if (error.code === "42501") throw new ErrorPm("No podés pasar esta obra a esa persona.", 403);
    throw new Error(`No pude pasar el PM: ${error.message}`);
  }
  if ((data ?? []).length === 0) {
    const actual = await leerUno(db, otId);
    throw new ErrorPm(actual ? `La obra ahora la tiene ${actual.pmNombre}.` : "La obra ya no tiene PM.", 409);
  }
  const fila = await leerUno(db, otId);
  if (!fila) throw new Error("No pude pasar el PM: la obra quedó sin PM.");
  return fila;
}

/**
 * Suelta o quita el PM. Un DELETE que la RLS no deja pasar no tira: borra cero filas. Por eso se
 * pide la fila borrada de vuelta y, si no hubo, se distingue "no tenía" de "no te deja".
 */
export async function quitarPm(db: DB, otId: number): Promise<void> {
  const { data, error } = await db.from(TABLA_PM).delete().eq("ot_id", otId).select("ot_id");
  if (error) throw new Error(`No pude quitar el PM: ${error.message}`);
  if ((data ?? []).length > 0) return;
  const actual = await leerUno(db, otId);
  if (actual) throw new ErrorPm(`La obra la tiene ${actual.pmNombre}: sólo esa persona u Operaciones la pueden soltar.`, 403);
}

async function leerUno(db: DB, otId: number): Promise<PmDeObra | null> {
  const { data, error } = await db
    .from(TABLA_PM)
    .select("ot_id, pm, asignado_por, asignado_el")
    .eq("ot_id", otId)
    .maybeSingle();
  if (error) throw new Error(`No pude leer el PM: ${error.message}`);
  if (!data) return null;
  const fila = data as Fila;
  return aPm(fila, await nombresDe(db, [fila.pm, fila.asignado_por]));
}

function aPm(f: Fila, nombres: Map<string, string>): PmDeObra {
  return {
    otId: Number(f.ot_id),
    pmId: f.pm,
    pmNombre: nombres.get(f.pm) || "Sin nombre",
    asignadoEl: f.asignado_el,
    asignadoPorNombre: f.asignado_por ? (nombres.get(f.asignado_por) || null) : null,
  };
}

async function nombresDe(db: DB, ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await db.from("user_profiles").select("id, nombre").in("id", unicos);
  if (error) {
    console.error("[pm] no se pudieron leer los nombres", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.id as string, ((p.nombre as string | null) ?? "").trim()]));
}
