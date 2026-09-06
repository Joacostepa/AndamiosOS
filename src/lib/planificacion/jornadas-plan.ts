// Cuántas jornadas tiene una obra según Operaciones, contra Supabase (plan_jornadas_ot).
//
// Recibe el cliente por parámetro y no lo crea, igual que notas.ts: así el módulo no
// arrastra nada server-only y las políticas de RLS corren con la sesión de quien pide.
//
// El número que devuelve NO reemplaza al estimado de Comercial: convive con él. La
// bandeja usa éste cuando existe; el Informe de Obra sigue midiendo el desvío contra
// x_duracion_est, que es lo que hace que la corrección de Operaciones no borre la
// evidencia de que el estimado estaba mal. Ver el encabezado de la migración.

import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient;

const TABLA = "plan_jornadas_ot";

export type JornadasPlan = {
  otId: number;
  jornadas: number;
  motivo: string | null;
  autorNombre: string | null;
  updatedAt: string;
};

type Fila = {
  odoo_ot_id: number;
  jornadas: string | number;
  motivo: string | null;
  updated_at: string;
  user_profiles?: { nombre: string } | null;
};

function mapear(f: Fila): JornadasPlan {
  return {
    otId: f.odoo_ot_id,
    // NUMERIC vuelve como string del driver de Postgres. Sin el Number() la resta de la
    // bandeja concatena en vez de restar y una obra de 7 jornadas se lee como "7".
    jornadas: Number(f.jornadas),
    motivo: f.motivo,
    autorNombre: f.user_profiles?.nombre ?? null,
    updatedAt: f.updated_at,
  };
}

/**
 * Todas las correcciones vigentes, de una.
 *
 * SIN FILTRAR POR OT, a propósito: el tablero necesita el número de cada obra de la
 * bandeja en el mismo render, y pedirlos de a uno serían decenas de consultas para una
 * tabla que tiene tantas filas como obras corregidas — hoy cero, y en el peor caso las
 * sesenta y pico de OTs activas. Traerla entera es más barato que el `in` que la filtraría.
 */
export async function jornadasPlanTodas(db: DB): Promise<JornadasPlan[]> {
  const { data, error } = await db
    .from(TABLA)
    .select("odoo_ot_id, jornadas, motivo, updated_at, user_profiles(nombre)");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => mapear(f as unknown as Fila));
}

/**
 * Fija el número de Operaciones para una obra.
 *
 * Es un upsert por OT y no un insert: corregir dos veces la misma obra es normal —se
 * saca una jornada el lunes y otra el jueves— y cada corrección pisa a la anterior
 * porque lo que vale es el número de ahora.
 */
export async function fijarJornadasPlan(
  db: DB,
  otId: number,
  jornadas: number,
  motivo: string | null,
  autorId: string | null,
): Promise<void> {
  const { error } = await db.from(TABLA).upsert(
    {
      odoo_ot_id: otId,
      jornadas,
      motivo,
      autor_id: autorId,
      // El trigger sólo corre en UPDATE; en el alta lo pone el default. Se manda igual
      // para que un upsert que resuelve como insert no quede con el sello de otro día.
      updated_at: new Date().toISOString(),
    },
    { onConflict: "odoo_ot_id" },
  );
  if (error) throw new Error(error.message);
}

/** Vuelve a mandar la obra al estimado de Comercial: se borra la corrección, no se iguala. */
export async function borrarJornadasPlan(db: DB, otId: number): Promise<void> {
  const { error } = await db.from(TABLA).delete().eq("odoo_ot_id", otId);
  if (error) throw new Error(error.message);
}
