// Write-back app→Odoo de una OT adicional. ÚNICO punto donde la app ESCRIBE en Odoo.
// Idempotente: usa x_andamios_id (= id de la OT en la app) como clave; si ya existe la
// OT en Odoo, actualiza; si no, crea. Así un reintento no duplica.

import { searchRead, create, write } from "./client";

export type AppOTForPush = {
  id: string;                    // uuid de ordenes_trabajo (→ x_andamios_id)
  tipo: string;                  // vocabulario compartido con Odoo (armado/ampliacion/...)
  descripcion: string | null;
  observaciones: string | null;
  motivo_adicional: string | null;
  fecha_programada: string | null;
  obra_odoo_id: number;          // obras.odoo_obra_id (→ x_obra_id)
};

/** Crea/actualiza la OT adicional en Odoo. Devuelve el odoo_ot_id. */
export async function pushAdicionalToOdoo(ot: AppOTForPush): Promise<number> {
  const obs = [ot.observaciones, ot.motivo_adicional ? `Motivo adicional: ${ot.motivo_adicional}` : null]
    .filter(Boolean)
    .join(" — ");

  const values: Record<string, unknown> = {
    x_andamios_id: ot.id,
    x_obra_id: ot.obra_odoo_id,
    x_tipo: ot.tipo,
    x_estado: "pendiente",
    x_es_adicional: true,
    x_aprobada_comercial: false,
    x_name: ot.descripcion?.trim() || `Adicional ${ot.id.slice(0, 8)}`,
    x_observaciones: obs || false,
    x_fecha_programada: ot.fecha_programada || false,
    // Requeridos en Odoo (costeo): defaults; Comercial/Operaciones los ajustan luego.
    x_jornadas_estimadas: 1,
    x_personal_por_jornada: 1,
  };

  const existing = await searchRead<{ id: number }>(
    "x_aba_orden_trabajo",
    [["x_andamios_id", "=", ot.id]],
    ["id"],
    { limit: 1 },
  );
  if (existing.length) {
    await write("x_aba_orden_trabajo", [existing[0].id], values);
    return existing[0].id;
  }
  return await create("x_aba_orden_trabajo", values);
}
