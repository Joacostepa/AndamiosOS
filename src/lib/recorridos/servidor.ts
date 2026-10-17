// Lectura de `recorridos_vistos` para el layout del dashboard, con la sesión de quien entra.

import { createClient } from "@/lib/supabase/server";
import { RECORRIDOS, type RecorridoVisto } from "./registro.ts";

/**
 * Los recorridos que ya hizo `usuarioId`, o null si no se pudo saber.
 *
 * NULL = NO MOSTRAR. Si la tabla todavía no existe (migración sin aplicar), o la consulta
 * falla por lo que sea, el recorrido no sale: un obligatorio que no puede guardar que se hizo
 * aparecería en cada carga y trabaría a todos.
 *
 * SE LLAMA EN PARALELO con `accesoActual()` y todavía sin el id: la consulta no filtra por
 * usuario sino por las claves del registro, y `usuarioDe()` filtra después. Para cualquiera
 * la RLS ya devuelve sólo lo propio; un admin lee todas las filas (para contar quién falta),
 * que en esta empresa son unas decenas por recorrido. Es más barato que esperar el getUser()
 * antes de consultar.
 */
export async function leerRecorridosVistos(): Promise<{ usuarioId: string; clave: string; version: number }[] | null> {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("recorridos_vistos")
      .select("usuario_id, clave, version")
      .in("clave", RECORRIDOS.map((r) => r.clave));
    if (error || !data) return null;
    return data.map((f) => ({ usuarioId: String(f.usuario_id), clave: String(f.clave), version: Number(f.version) }));
  } catch {
    return null;
  }
}

/** Las filas de una persona, o null si la lectura falló. */
export function usuarioDe(
  filas: { usuarioId: string; clave: string; version: number }[] | null,
  usuarioId: string,
): RecorridoVisto[] | null {
  if (!filas) return null;
  return filas.filter((f) => f.usuarioId === usuarioId).map(({ clave, version }) => ({ clave, version }));
}
