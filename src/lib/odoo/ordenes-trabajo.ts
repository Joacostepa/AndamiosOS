// Espejo de Órdenes de Trabajo: lectura de x_aba_orden_trabajo desde Odoo y mapeo a
// la tabla `ordenes_trabajo`.
//
// REGLA DE NEGOCIO: Comercial dispara la OT desde Odoo (tipo + obra + fecha). La app
// ejecuta: el `estado` (pendiente→programada→en_curso→completada) y la HABILITACIÓN
// (booleans requiere_habilitacion / habilitacion_aprobada) los gobierna la app — se
// siembran en el alta y NO se pisan en updates. Vocabulario de tipo/estado COMPARTIDO
// con Odoo (sin tabla de traducción).

import { searchRead } from "./client";
import type { OdooM2O } from "./obras";

export type OdooOrdenTrabajo = {
  id: number;
  x_name: string | false;
  x_obra_id: OdooM2O;
  x_tipo: string | false;
  x_estado: string | false;
  x_fecha_programada: string | false;
  x_observaciones: string | false;
  x_es_adicional: boolean;
  x_aprobada_comercial: boolean;
  x_andamios_id: string | false;
};

const OT_FIELDS = [
  "id", "x_name", "x_obra_id", "x_tipo", "x_estado", "x_fecha_programada", "x_observaciones",
  "x_es_adicional", "x_aprobada_comercial", "x_andamios_id",
];

const TIPOS_OT = new Set([
  "armado", "desarme", "ampliacion", "desmonte_parcial", "mantenimiento", "otro",
]);
const ESTADOS_OT = new Set(["pendiente", "programada", "en_curso", "completada", "cancelada"]);

function str(v: string | false | null | undefined): string | null {
  return v ? String(v) : null;
}

/** Trae todas las OTs de Odoo. */
export function fetchOdooOTs(): Promise<OdooOrdenTrabajo[]> {
  return searchRead<OdooOrdenTrabajo>("x_aba_orden_trabajo", [], OT_FIELDS, { limit: 10000, order: "id" });
}

/** Trae una OT puntual por id (para el webhook). Null si no existe. */
export async function fetchOTById(id: number): Promise<OdooOrdenTrabajo | null> {
  const rows = await searchRead<OdooOrdenTrabajo>("x_aba_orden_trabajo", [["id", "=", id]], OT_FIELDS, { limit: 1 });
  return rows[0] ?? null;
}

/** Devuelve el odoo_obra_id de la OT (para resolver el FK obra_id), o null. */
export function odooOTObraId(ot: OdooOrdenTrabajo): number | null {
  return Array.isArray(ot.x_obra_id) ? ot.x_obra_id[0] : null;
}

/**
 * Mapea una OT de Odoo a columnas de `ordenes_trabajo`. `obraId` (FK NOT NULL) lo
 * resuelve el caller desde el espejo de obras (odoo_obra_id → obras.id). Si la obra no
 * está espejada aún devuelve null y la OT se omite. `codigo` lo genera el trigger;
 * `requiere_habilitacion`/`habilitacion_aprobada` toman el default de la app (no de Odoo).
 */
export function mapOTToApp(ot: OdooOrdenTrabajo, obraId: string | null) {
  if (!obraId) return null;
  const tipo = typeof ot.x_tipo === "string" && TIPOS_OT.has(ot.x_tipo) ? ot.x_tipo : "otro";
  const estado =
    typeof ot.x_estado === "string" && ESTADOS_OT.has(ot.x_estado) ? ot.x_estado : "pendiente";
  // La aprobación comercial es Odoo-owned (Comercial la marca allá). Las OTs normales
  // (no adicionales) se consideran siempre aprobadas.
  const esAdicional = ot.x_es_adicional === true;
  const aprobadaComercial = esAdicional ? ot.x_aprobada_comercial === true : true;
  return {
    obra_id: obraId,
    tipo,
    estado, // solo se usa en el INSERT (seed); en update lo gobierna la app
    descripcion: (typeof ot.x_name === "string" ? ot.x_name.trim() : "") || `OT Odoo #${ot.id}`,
    fecha_programada: str(ot.x_fecha_programada),
    observaciones: str(ot.x_observaciones),
    es_adicional: esAdicional,
    aprobada_comercial: aprobadaComercial,
    odoo_ot_id: ot.id,
  };
}

export type OTValues = NonNullable<ReturnType<typeof mapOTToApp>>;
