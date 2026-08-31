// Notas de la jornada, contra Supabase (plan_notas_dia).
//
// Recibe el cliente por parámetro y no lo crea: así el módulo no arrastra nada
// server-only y las políticas de RLS corren con la sesión de quien pide, igual que
// src/lib/habilitaciones/servicio.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaJornada, NuevaNotaJornada } from "@/lib/tablero/tipos-nota";

type DB = SupabaseClient;

const TABLA = "plan_notas_dia";

type Fila = {
  id: string;
  desde: string;
  hasta: string;
  cuadrilla_odoo_id: number | null;
  texto: string;
  created_at: string;
  user_profiles?: { nombre: string } | null;
};

function mapear(f: Fila): NotaJornada {
  return {
    id: f.id,
    desde: f.desde,
    hasta: f.hasta,
    cuadrillaId: f.cuadrilla_odoo_id,
    texto: f.texto,
    autorNombre: f.user_profiles?.nombre ?? null,
    createdAt: f.created_at,
  };
}

/**
 * Las notas que TOCAN el rango pedido, no las que empiezan dentro.
 *
 * Es un solapamiento y no una pertenencia: una licencia del 12 al 20 tiene que
 * aparecer cuando el tablero muestra del 15 al 22, y su `desde` queda fuera de esa
 * ventana. Filtrar por `desde BETWEEN` —el error fácil— la haría desaparecer
 * exactamente en los días en los que importa.
 */
export async function notasEnRango(db: DB, desde: string, hasta: string): Promise<NotaJornada[]> {
  const { data, error } = await db
    .from(TABLA)
    .select("id, desde, hasta, cuadrilla_odoo_id, texto, created_at, user_profiles(nombre)")
    .gte("hasta", desde)
    .lte("desde", hasta)
    .order("desde")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => mapear(f as unknown as Fila));
}

export async function agregarNotaJornada(
  db: DB,
  nota: NuevaNotaJornada,
  autorId: string | null,
): Promise<void> {
  const { error } = await db.from(TABLA).insert({
    desde: nota.desde,
    hasta: nota.hasta,
    cuadrilla_odoo_id: nota.cuadrillaId,
    texto: nota.texto,
    autor_id: autorId,
  });
  if (error) throw new Error(error.message);
}

export async function borrarNotaJornada(db: DB, notaId: string): Promise<void> {
  const { error } = await db.from(TABLA).delete().eq("id", notaId);
  if (error) throw new Error(error.message);
}
