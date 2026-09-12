// Comentarios de la OT, contra Supabase (ot_comentarios).
//
// Recibe el cliente por parámetro y no lo crea: así el módulo no arrastra nada
// server-only y las políticas de RLS corren con la sesión de quien pide, igual que
// src/lib/planificacion/notas.ts.
//
// NO TOCA ODOO, y no es un descuido. La OT de Odoo no tiene chatter —el modelo de Studio
// no es mail.thread, no tiene message_ids y hay 0 mensajes sobre OTs contra 25.910 sobre
// ventas—, así que "mandarlo a Odoo" significaría convertir el modelo y darle licencia a
// los cinco operativos. Y abrir el panel pasaría a costar los ~800 ms de un RPC para
// mostrar tres líneas de texto.
//
// EL AUTOR NO SE PASA EN EL INSERT: lo pone el default de la columna (auth.uid()) y la
// política de RLS impide firmarlo con el nombre de otro. Una ruta que se olvide de mirar
// quién es no puede dejar un comentario sin firma.
//
// EL ÁMBITO, EN CAMBIO, SE PASA SIEMPRE Y NO TIENE DEFAULT — ni acá ni en la columna. Son
// dos conversaciones distintas sobre la misma OT: la de operaciones es con quien está en
// la obra y su asunto es cuándo y cómo se entra; la de habilitación es con el área de SyH
// del cliente y su asunto son los papeles para poder entrar. Ya se mezclaron una vez, y
// el resultado fue un panel de tablero con 19 líneas de trámite y una sola útil. Un
// default es exactamente cómo vuelve a pasar.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComentarioOt, ResumenComentarios } from "@/lib/tablero/tipos-comentario";

type DB = SupabaseClient;

export const TABLA = "ot_comentarios";

/**
 * De cuál de las dos conversaciones es este comentario.
 *
 * No hay valor por defecto en ningún lado de la cadena: quien escribe tiene que decirlo.
 */
export type Ambito = "operaciones" | "habilitacion";

const COLUMNAS = "id, odoo_ot_id, texto, fijada, autor_id, created_at, user_profiles(nombre)";

type Fila = {
  id: string;
  odoo_ot_id: number;
  texto: string;
  fijada: boolean;
  autor_id: string | null;
  created_at: string;
  user_profiles?: { nombre: string } | null;
};

function mapear(f: Fila): ComentarioOt {
  return {
    id: f.id,
    otId: f.odoo_ot_id,
    texto: f.texto,
    fijado: f.fijada,
    autorId: f.autor_id,
    autorNombre: f.user_profiles?.nombre ?? null,
    createdAt: f.created_at,
  };
}

/**
 * El hilo de una OT, entero.
 *
 * Los fijados van arriba de todo y el resto por fecha descendente: lo permanente —"el
 * administrador sólo atiende martes y jueves"— no puede hundirse debajo de la charla de
 * ayer, que es exactamente lo que le pasa a un hilo ordenado sólo por fecha.
 */
export async function comentariosDeOt(
  db: DB,
  otId: number,
  ambito: Ambito,
): Promise<ComentarioOt[]> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .eq("odoo_ot_id", otId)
    .eq("ambito", ambito)
    .order("fijada", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => mapear(f as unknown as Fila));
}

/**
 * Cuántos y cuál fue el último, para todas las OTs del tablero de un saque.
 *
 * Trae las filas y agrupa en TypeScript en vez de pedirle a Postgres un DISTINCT ON: son
 * pocas por OT y el tablero ya pide un puñado de OTs por vez. Una función SQL nueva para
 * ahorrar un `reduce` sería superficie que después hay que mantener.
 *
 * El último es el último ESCRITO, no el fijado: el fijado manda en el orden del hilo,
 * pero lo que la tarjeta tiene que soplar al pasar el mouse es lo más fresco.
 */
export async function resumenComentarios(
  db: DB,
  otIds: number[],
  ambito: Ambito,
): Promise<Map<number, ResumenComentarios>> {
  if (otIds.length === 0) return new Map();

  const { data, error } = await db
    .from(TABLA)
    .select("odoo_ot_id, texto, created_at, user_profiles(nombre)")
    .in("odoo_ot_id", otIds)
    .eq("ambito", ambito)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const mapa = new Map<number, ResumenComentarios>();
  for (const f of (data ?? []) as unknown as Fila[]) {
    const ya = mapa.get(f.odoo_ot_id);
    if (ya) {
      ya.cantidad += 1;
      continue;
    }
    // El primero que llega de cada OT es el más reciente: la consulta vino ordenada.
    mapa.set(f.odoo_ot_id, {
      cantidad: 1,
      ultimo: {
        texto: f.texto,
        autorNombre: f.user_profiles?.nombre ?? null,
        createdAt: f.created_at,
      },
    });
  }
  return mapa;
}

export async function comentar(
  db: DB,
  otId: number,
  texto: string,
  ambito: Ambito,
  fijado = false,
): Promise<void> {
  const { error } = await db.from(TABLA).insert({
    odoo_ot_id: otId,
    texto,
    ambito,
    fijada: fijado,
  });
  if (error) throw new Error(error.message);
}

/** Fijar o desfijar. Lo puede hacer cualquiera: es curaduría del hilo, no autoría. */
export async function fijarComentario(db: DB, id: string, fijado: boolean): Promise<void> {
  const { error } = await db.from(TABLA).update({ fijada: fijado }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Borrar. La RLS sólo se lo permite al autor, así que un borrado ajeno no falla: no
 * encuentra la fila y no borra nada. Por eso se cuenta lo borrado y se avisa.
 */
export async function borrarComentario(db: DB, id: string): Promise<void> {
  const { error, count } = await db
    .from(TABLA)
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Sólo quien escribió un comentario puede borrarlo");
}
