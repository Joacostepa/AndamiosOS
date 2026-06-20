// Espejo de Obras: lectura de x_aba_obra desde Odoo y mapeo a la tabla `obras`.
//
// REGLA DE NEGOCIO: Odoo es la fuente de verdad de la creación/identidad de la Obra
// (Comercial la crea tras aprobar la cotización). La app es la capa operativa. El
// vocabulario de estados es COMPARTIDO (x_aba_obra.x_estado == enum estado_obra), así
// que no hay tabla de traducción. El `estado` operativo lo gobierna la app: se SIEMBRA
// en el alta y NO se pisa en updates (ver routes), para no revertir el avance de obra.

import { searchRead } from "./client";

// Los many2one de Odoo vienen como [id, display_name] o false si están vacíos.
export type OdooM2O = [number, string] | false;

export type OdooObra = {
  id: number;
  x_name: string | false;
  x_cliente_id: OdooM2O;
  x_fecha_inicio: string | false;
  x_fecha_fin_estimada: string | false;
  x_estado: string | false;
  x_andamios_id: string | false;
  x_observaciones: string | false;
};

const OBRA_FIELDS = [
  "id", "x_name", "x_cliente_id", "x_fecha_inicio",
  "x_fecha_fin_estimada", "x_estado", "x_andamios_id", "x_observaciones",
];

// Valores válidos de estado_obra (== x_aba_obra.x_estado). Fallback si Odoo manda algo raro.
const ESTADOS_OBRA = new Set([
  "pendiente_armado", "armado", "pendiente_desarme", "desarmado", "cancelada",
]);

function str(v: string | false | null | undefined): string | null {
  return v ? String(v) : null;
}

/** Trae todas las Obras de Odoo. */
export function fetchOdooObras(): Promise<OdooObra[]> {
  return searchRead<OdooObra>("x_aba_obra", [], OBRA_FIELDS, { limit: 10000, order: "id" });
}

/** Trae una Obra puntual por id (para el webhook). Null si no existe. */
export async function fetchObraById(id: number): Promise<OdooObra | null> {
  const rows = await searchRead<OdooObra>("x_aba_obra", [["id", "=", id]], OBRA_FIELDS, { limit: 1 });
  return rows[0] ?? null;
}

/** Devuelve el odoo_partner_id del cliente de la Obra (para resolver el FK), o null. */
export function odooClientePartnerId(o: OdooObra): number | null {
  return Array.isArray(o.x_cliente_id) ? o.x_cliente_id[0] : null;
}

/**
 * Mapea una Obra de Odoo a columnas de `obras`. `clienteId` (FK NOT NULL) lo resuelve
 * el caller desde el espejo de clientes (odoo_partner_id → clientes.id). Si no hay
 * cliente vinculable devuelve null y la Obra se omite. `codigo` lo genera el trigger.
 */
export function mapObraToApp(o: OdooObra, clienteId: string | null) {
  if (!clienteId) return null;
  const estado =
    typeof o.x_estado === "string" && ESTADOS_OBRA.has(o.x_estado) ? o.x_estado : "pendiente_armado";
  const nombre = (typeof o.x_name === "string" ? o.x_name.trim() : "") || `Obra Odoo #${o.id}`;
  return {
    nombre,
    cliente_id: clienteId,
    estado, // solo se usa en el INSERT (seed); en update lo gobierna la app
    fecha_inicio_estimada: str(o.x_fecha_inicio),
    fecha_fin_estimada: str(o.x_fecha_fin_estimada),
    observaciones: str(o.x_observaciones),
    odoo_obra_id: o.id,
  };
}

export type ObraValues = NonNullable<ReturnType<typeof mapObraToApp>>;
