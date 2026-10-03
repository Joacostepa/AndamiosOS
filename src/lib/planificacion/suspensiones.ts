// Días suspendidos del tablero, contra Supabase (plan_suspensiones).
//
// Recibe el cliente por parámetro, igual que notas.ts: las políticas de RLS corren con
// la sesión de quien pide.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SuspensionDia } from "@/lib/tablero/tipos-suspension";

type DB = SupabaseClient;

const TABLA = "plan_suspensiones";

type Fila = {
  id: string;
  fecha: string;
  cuadrilla_odoo_id: number;
  motivo: string;
  lote_id: string | null;
  user_profiles?: { nombre: string } | null;
};

export async function suspensionesEnRango(db: DB, desde: string, hasta: string): Promise<SuspensionDia[]> {
  const { data, error } = await db
    .from(TABLA)
    .select("id, fecha, cuadrilla_odoo_id, motivo, lote_id, user_profiles(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map((f) => ({
    id: f.id,
    fecha: f.fecha,
    cuadrillaId: Number(f.cuadrilla_odoo_id),
    motivo: f.motivo,
    loteId: f.lote_id,
    autorNombre: f.user_profiles?.nombre ?? null,
  }));
}

/**
 * Marca el día como suspendido para esas cuadrillas. Si ya estaba marcado (se corrió dos
 * veces el mismo día), se queda con el último motivo y el último lote.
 */
export async function marcarSuspension(
  db: DB,
  datos: { fecha: string; cuadrillaIds: number[]; motivo: string; loteId: string | null },
  autorId: string | null,
): Promise<void> {
  if (datos.cuadrillaIds.length === 0) return;
  const { error } = await db.from(TABLA).upsert(
    datos.cuadrillaIds.map((c) => ({
      fecha: datos.fecha,
      cuadrilla_odoo_id: c,
      motivo: datos.motivo,
      lote_id: datos.loteId,
      autor_id: autorId,
    })),
    { onConflict: "fecha,cuadrilla_odoo_id" },
  );
  if (error) throw new Error(error.message);
}

/** Deshacer un corrimiento levanta las marcas que dejó. */
export async function levantarLote(db: DB, loteId: string): Promise<void> {
  const { error } = await db.from(TABLA).delete().eq("lote_id", loteId);
  if (error) throw new Error(error.message);
}

export async function borrarSuspension(db: DB, id: string): Promise<void> {
  const { error } = await db.from(TABLA).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
