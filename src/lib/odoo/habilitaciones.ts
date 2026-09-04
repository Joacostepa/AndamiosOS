// Habilitaciones contra Odoo — lecturas de x_aba_orden_trabajo y de sale.order.
//
// SOLO server-side. Se consume desde /api/habilitaciones/*.
//
// QUÉ ESCRIBE Y QUÉ NO: la app escribe CUATRO campos de la OT —x_hab_estado,
// x_hab_fecha_consulta, x_hab_fecha_envio, x_hab_fecha (y x_hab_vencimiento)— y los
// campos de permiso de la venta. Los otros cuatro x_hab_* (etapa, semáforo, alerta,
// días) son COMPUTADOS: Odoo los recalcula en la misma transacción que su input, así que
// escribirlos no hace falta.
//
// Y escribirlos tampoco falla, que es peor: verificado contra Odoo 19, el write se
// acepta y el valor persiste hasta que cambia alguno de sus depends. Un derivado escrito
// a mano no da error, da una mentira con fecha de vencimiento. Por eso `escribirInputs`
// es la única puerta de escritura de este módulo hacia la OT.
//
// EL PERMISO VA EN LA VENTA, NO EN LA OT: es municipal, por dirección, y el armado y el
// desarme de la misma obra lo comparten. Además es el único join que existe —x_obra_id
// está vacío en las 1003 OTs y x_order_id al 100%—. Verificado que una venta no cubre
// dos direcciones: de 567 ventas con OTs, 436 tienen 2 (armado + desarme) y 131 una.

import { searchRead, read, write } from "./client";
import { CAMPOS_TRABAJO, leerTrabajo, type FilaTrabajo } from "./trabajo";
import type {
  HabAlerta, HabEstado, HabEtapa, HabSemaforo, InputsHabilitacion,
  ModalidadPermiso, Permiso, TramiteEstado,
} from "@/lib/habilitaciones/tipos";
import type { TrabajoOt } from "@/lib/tablero/tipos";

type M2O = [number, string] | false;

function m2oId(v: M2O | undefined): number | null {
  return Array.isArray(v) ? v[0] : null;
}
function m2oName(v: M2O | undefined): string | null {
  return Array.isArray(v) ? v[1] : null;
}
function str(v: string | false | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function num(v: number | false | null | undefined): number {
  return typeof v === "number" ? v : 0;
}

const OT = "x_aba_orden_trabajo";
const VENTA = "sale.order";

/** Las OTs vivas. Una OT completada o cancelada no tiene habilitación que gestionar. */
const ACTIVAS = [["x_estado", "in", ["pendiente", "en_proceso"]]];

const CAMPOS_OT = [
  "x_name", "x_estado", "x_tipo", "x_order_id", "x_fecha_programada", "x_tecnico",
  // Computados en Odoo — se LEEN, nunca se escriben.
  "x_hab_etapa", "x_hab_semaforo", "x_hab_alerta", "x_hab_dias",
  // Escribibles — son los inputs de los de arriba.
  "x_hab_estado", "x_hab_fecha_consulta", "x_hab_fecha_envio", "x_hab_fecha",
  "x_hab_vencimiento", "x_hab_obs", "x_hab_responsable_id",
];

// La clasificación del trabajo viaja con el permiso: la venta ya se lee entera para el
// permiso, así que sumar estos cinco campos no cuesta ninguna llamada más.
const CAMPOS_VENTA = [
  "name", "x_permiso_modalidad", "x_permiso_definida", "x_tramite_estado",
  "x_expediente_nro", "x_expediente_fecha", "x_permiso_fecha", "x_studio_tcnico",
  ...CAMPOS_TRABAJO,
];

export type FilaOtHab = {
  id: number;
  x_name: string | false;
  x_estado: string | false;
  x_tipo: string | false;
  x_order_id: M2O;
  x_fecha_programada: string | false;
  x_tecnico: string | false;
  x_hab_etapa: string | false;
  x_hab_semaforo: string | false;
  x_hab_alerta: string | false;
  x_hab_dias: number | false;
  x_hab_estado: string | false;
  x_hab_fecha_consulta: string | false;
  x_hab_fecha_envio: string | false;
  x_hab_fecha: string | false;
  x_hab_vencimiento: string | false;
  x_hab_obs: string | false;
  x_hab_responsable_id: M2O;
};

type FilaVenta = Partial<FilaTrabajo> & {
  id: number;
  name: string | false;
  x_permiso_modalidad: string | false;
  x_permiso_definida: string | false;
  x_tramite_estado: string | false;
  x_expediente_nro: string | false;
  x_expediente_fecha: string | false;
  x_permiso_fecha: string | false;
  x_studio_tcnico: M2O;
};

export type OtConPermiso = {
  ot: FilaOtHab;
  permiso: Permiso;
  /** Qué se arma y qué necesita. Ver src/lib/odoo/trabajo.ts. */
  trabajo: TrabajoOt;
};

function mapPermiso(v: FilaVenta | undefined, tecnicoOt: string | null): Permiso {
  if (!v) {
    return {
      ventaId: null, ventaNombre: null, modalidad: null, modalidadDefinida: null,
      tramite: null, expedienteNro: null, expedienteFecha: null, permisoFecha: null,
      tecnicoId: null, tecnicoNombre: tecnicoOt,
    };
  }
  return {
    ventaId: v.id,
    ventaNombre: str(v.name),
    modalidad: (str(v.x_permiso_modalidad) as ModalidadPermiso | null) ?? null,
    modalidadDefinida: str(v.x_permiso_definida),
    tramite: (str(v.x_tramite_estado) as TramiteEstado | null) ?? null,
    expedienteNro: str(v.x_expediente_nro),
    expedienteFecha: str(v.x_expediente_fecha),
    permisoFecha: str(v.x_permiso_fecha),
    tecnicoId: m2oId(v.x_studio_tcnico),
    // x_studio_tcnico es many2one a hr.employee y llega a una persona real; x_tecnico de
    // la OT es un char de dos letras (GS/JS/JR) que no rutea a nadie. Se usa de respaldo
    // para las ventas donde el many2one no está cargado (362 de 400 lo tienen).
    tecnicoNombre: m2oName(v.x_studio_tcnico) ?? tecnicoOt,
  };
}

/** Todas las OTs activas con su permiso resuelto. Dos lecturas, no N+1. */
export async function fetchOtsActivas(): Promise<OtConPermiso[]> {
  const ots = await searchRead<FilaOtHab>(OT, ACTIVAS, CAMPOS_OT, {
    order: "x_fecha_programada, id",
    limit: 500,
  });

  const ventaIds = [...new Set(ots.map((o) => m2oId(o.x_order_id)).filter((x): x is number => x !== null))];
  const ventas = ventaIds.length ? await read<FilaVenta>(VENTA, ventaIds, CAMPOS_VENTA) : [];
  const porId = new Map(ventas.map((v) => [v.id, v]));

  return ots.map((ot) => {
    const venta = porId.get(m2oId(ot.x_order_id) ?? -1);
    return { ot, permiso: mapPermiso(venta, str(ot.x_tecnico)), trabajo: leerTrabajo(venta) };
  });
}

/** Una sola OT, para la ficha. */
export async function fetchOt(otId: number): Promise<OtConPermiso | null> {
  const filas = await read<FilaOtHab>(OT, [otId], CAMPOS_OT);
  const ot = filas[0];
  if (!ot) return null;

  const ventaId = m2oId(ot.x_order_id);
  const ventas = ventaId ? await read<FilaVenta>(VENTA, [ventaId], CAMPOS_VENTA) : [];
  return { ot, permiso: mapPermiso(ventas[0], str(ot.x_tecnico)), trabajo: leerTrabajo(ventas[0]) };
}

/**
 * Escribe los cuatro inputs en la OT. Odoo recalcula etapa, semáforo, alerta y días.
 *
 * Se mandan siempre los cinco campos (incluido el vencimiento) y no un diff: el estado
 * completo se deriva de los requisitos en cada cambio, así que un write parcial dejaría
 * combinaciones imposibles —por ejemplo `habilitada` con fecha de envío nula—.
 */
export async function escribirInputs(otId: number, inputs: InputsHabilitacion): Promise<void> {
  await write(OT, [otId], {
    x_hab_estado: inputs.hab_estado ?? false,
    x_hab_fecha_consulta: inputs.hab_fecha_consulta ?? false,
    x_hab_fecha_envio: inputs.hab_fecha_envio ?? false,
    x_hab_fecha: inputs.hab_fecha ?? false,
    x_hab_vencimiento: inputs.hab_vencimiento ?? false,
  });
}

/** El responsable de la habilitación. Hoy está vacío en las 400 OTs. */
export async function asignarResponsable(otId: number, uid: number): Promise<void> {
  await write(OT, [otId], { x_hab_responsable_id: uid });
}

export type CambioPermiso = Partial<{
  modalidad: ModalidadPermiso | null;
  modalidadDefinida: string | null;
  tramite: TramiteEstado | null;
  expedienteNro: string | null;
  expedienteFecha: string | null;
  permisoFecha: string | null;
}>;

/** Escribe el permiso en la VENTA, así el armado y el desarme lo comparten. */
export async function escribirPermiso(ventaId: number, cambio: CambioPermiso): Promise<void> {
  const valores: Record<string, unknown> = {};
  if ("modalidad" in cambio) valores.x_permiso_modalidad = cambio.modalidad ?? false;
  if ("modalidadDefinida" in cambio) valores.x_permiso_definida = cambio.modalidadDefinida ?? false;
  if ("tramite" in cambio) valores.x_tramite_estado = cambio.tramite ?? false;
  if ("expedienteNro" in cambio) valores.x_expediente_nro = cambio.expedienteNro ?? false;
  if ("expedienteFecha" in cambio) valores.x_expediente_fecha = cambio.expedienteFecha ?? false;
  if ("permisoFecha" in cambio) valores.x_permiso_fecha = cambio.permisoFecha ?? false;
  if (Object.keys(valores).length === 0) return;
  await write(VENTA, [ventaId], valores);
}

/**
 * El permiso de las OTs pedidas, para el candado del tablero.
 *
 * Es la única lectura que el tablero necesita para decidir si una jornada se puede
 * confirmar, y no toca Supabase: los tres campos que deciden viven en sale.order. Si
 * Supabase estuviera caído la planificación sigue funcionando.
 */
export async function permisosDeOts(otIds: number[]): Promise<Map<number, Permiso>> {
  const ids = [...new Set(otIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return new Map();

  const ots = await read<{ id: number; x_order_id: M2O; x_tecnico: string | false }>(
    OT, ids, ["x_order_id", "x_tecnico"],
  );
  const ventaIds = [...new Set(ots.map((o) => m2oId(o.x_order_id)).filter((x): x is number => x !== null))];
  const ventas = ventaIds.length ? await read<FilaVenta>(VENTA, ventaIds, CAMPOS_VENTA) : [];
  const porId = new Map(ventas.map((v) => [v.id, v]));

  return new Map(
    ots.map((o) => [o.id, mapPermiso(porId.get(m2oId(o.x_order_id) ?? -1), str(o.x_tecnico))]),
  );
}

/** Los ids de OT que siguen existiendo en Odoo, para detectar filas huérfanas. */
export async function otsExistentes(otIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(otIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return new Set();
  const filas = await searchRead<{ id: number }>(OT, [["id", "in", ids]], ["id"], { limit: ids.length });
  return new Set(filas.map((f) => f.id));
}

/** Normaliza una fila cruda de Odoo a los tipos del módulo. */
export function leerOt(ot: FilaOtHab) {
  return {
    otId: ot.id,
    titulo: str(ot.x_name) ?? `OT #${ot.id}`,
    tipo: str(ot.x_tipo) ?? "otro",
    estadoOt: str(ot.x_estado) ?? "pendiente",
    fechaProgramada: str(ot.x_fecha_programada),
    etapa: str(ot.x_hab_etapa) as HabEtapa | null,
    semaforo: str(ot.x_hab_semaforo) as HabSemaforo | null,
    alerta: str(ot.x_hab_alerta) as HabAlerta | null,
    dias: num(ot.x_hab_dias),
    habEstado: str(ot.x_hab_estado) as HabEstado | null,
    fechaConsulta: str(ot.x_hab_fecha_consulta),
    fechaEnvio: str(ot.x_hab_fecha_envio),
    fechaHabilitada: str(ot.x_hab_fecha),
    vencimiento: str(ot.x_hab_vencimiento),
    observaciones: str(ot.x_hab_obs),
    ventaId: m2oId(ot.x_order_id),
    ventaNombre: m2oName(ot.x_order_id),
  };
}

export function urlOdooOt(otId: number): string {
  const root = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  return `${root}/odoo/${OT}/${otId}`;
}

export function urlOdooVenta(ventaId: number | null): string | null {
  if (!ventaId) return null;
  const root = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  return `${root}/odoo/sale.order/${ventaId}`;
}
