// Órdenes de Trabajo contra Odoo — listado y ficha.
//
// SOLO server-side. Se consume desde /api/ordenes-trabajo.
//
// POR QUÉ SE REPUNTA: había dos listas de OT que no se veían entre sí. /ordenes-trabajo
// leía la tabla `ordenes_trabajo` de Supabase y el tablero leía x_aba_orden_trabajo de
// Odoo, que es la fuente de verdad comercial y tiene las 1003.
//
// DECISIÓN DE NAVEGACIÓN: el vínculo con la obra es la VENTA, no x_obra_id. Ese campo
// está vacío en las 1003 OTs; el que está cargado al 100% es x_order_id. Por eso no hay
// enlaces a /obras/[id]: del lado de Odoo esa relación no existe.

import { searchRead, searchCount, read, executeKw, write } from "./client";
import type {
  ConteosOrdenes,
  FiltroOrdenes,
  JornadaDeOrden,
  ListadoOrdenes,
  OrdenDetalle,
  OrdenListado,
  Urgencia,
} from "@/lib/tablero/tipos-orden";
// Relativo y no con alias: es el único import de VALOR que cruza de lib/odoo a
// lib/tablero (los demás son de tipos, que se borran al compilar), y así el módulo se
// puede ejecutar en un script de prueba sin resolver el alias.
import { parseDesvio } from "../tablero/tipos-orden";

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

const ACTIVAS = [["x_estado", "in", ["pendiente", "en_proceso"]]];

/**
 * El dominio de cada chip. Son excluyentes entre sí: cada uno reemplaza la consulta.
 *
 * No hay chip de urgencia: x_urgencia vale `baja` en las 1003 OTs. El campo existe y
 * nadie lo usa, así que un filtro por urgencia devolvería siempre cero o todo.
 */
export const DOMINIOS: Record<FiltroOrdenes, unknown[]> = {
  abiertas: ACTIVAS,
  critica: [...ACTIVAS, ["x_hab_alerta", "=", "critica"]],
  proxima: [...ACTIVAS, ["x_hab_alerta", "=", "proxima"]],
  sin_fecha: [...ACTIVAS, ["x_grupo_prog", "=", "b_sin"]],
  en_curso: [...ACTIVAS, ["x_dias_obra", ">", 0]],
  cerradas: [["x_estado", "=", "completada"]],
};

const CAMPOS = [
  "x_name", "x_estado", "x_tipo", "x_order_id", "x_fecha_programada", "x_fecha_firmeza",
  "x_fecha_comprometida", "x_hab_semaforo", "x_hab_alerta", "x_grupo_prog",
  "x_cuadrilla_prevista_id", "x_jornadas_num", "x_personal_por_jornada", "x_dias_obra",
  "x_cant_docs", "x_es_adicional", "x_aprobada_comercial", "x_urgencia", "x_fecha_desde",
];

type FilaOt = {
  id: number;
  x_name: string | false;
  x_estado: string | false;
  x_tipo: string | false;
  x_order_id: M2O;
  x_fecha_programada: string | false;
  x_fecha_firmeza: string | false;
  x_fecha_comprometida: string | false;
  x_hab_semaforo: string | false;
  x_hab_alerta: string | false;
  x_grupo_prog: string | false;
  x_cuadrilla_prevista_id: M2O;
  x_jornadas_num: number | false;
  x_personal_por_jornada: number | false;
  x_dias_obra: number | false;
  x_cant_docs: number | false;
  x_es_adicional: boolean;
  x_aprobada_comercial: boolean;
  x_urgencia: string | false;
  x_fecha_desde: string | false;
};

// El id de la acción se resuelve una vez: es estable y evita un RPC por request.
let cachedActionId: number | null = null;
async function otActionId(): Promise<number | null> {
  if (cachedActionId !== null) return cachedActionId;
  const rows = await searchRead<{ id: number }>(
    "ir.actions.act_window",
    [["res_model", "=", "x_aba_orden_trabajo"]],
    ["id"],
    { limit: 1, order: "id" },
  );
  cachedActionId = rows[0]?.id ?? null;
  return cachedActionId;
}

function mapOt(r: FilaOt, base: string, actionId: number | null): OrdenListado {
  const root = base.replace(/\/+$/, "");
  return {
    id: r.id,
    titulo: str(r.x_name) ?? `OT #${r.id}`,
    tipo: str(r.x_tipo) ?? "otro",
    estado: str(r.x_estado) ?? "pendiente",
    ordenVenta: m2oName(r.x_order_id),
    fechaProgramada: str(r.x_fecha_programada),
    fechaComprometida: str(r.x_fecha_comprometida),
    fechaDesde: str(r.x_fecha_desde),
    fechaFirmeza: str(r.x_fecha_firmeza),
    habSemaforo: str(r.x_hab_semaforo) ?? "rojo",
    habAlerta: str(r.x_hab_alerta),
    // El vacío se lee como `baja`, igual que en el tablero: Odoo deja el selection sin
    // valor en las OTs viejas y "sin marcar" y "baja" significan lo mismo.
    urgencia: (str(r.x_urgencia) as Urgencia | null) ?? "baja",
    grupoProg: str(r.x_grupo_prog),
    cuadrillaPrevista: m2oName(r.x_cuadrilla_prevista_id),
    jornadas: num(r.x_jornadas_num),
    personalPorJornada: num(r.x_personal_por_jornada),
    diasObra: num(r.x_dias_obra),
    cantDocs: num(r.x_cant_docs),
    esAdicional: r.x_es_adicional === true,
    aprobadaComercial: r.x_aprobada_comercial === true,
    url: actionId ? `${root}/odoo/action-${actionId}/${r.id}` : `${root}/odoo/${r.id}`,
  };
}

/**
 * Listado + contadores de los chips.
 *
 * Los contadores salen de `search_count` y no de contar en el cliente: con 1003 OTs, traer
 * todo para contar seis números sería absurdo. Son seis llamadas baratas que la cola del
 * cliente Odoo reparte de a cuatro.
 */
export async function fetchOrdenes(filtro: FiltroOrdenes): Promise<ListadoOrdenes> {
  const base = process.env.ODOO_URL ?? "";
  const actionId = await otActionId();

  const claves = Object.keys(DOMINIOS) as FiltroOrdenes[];
  const [filas, ...cuentas] = await Promise.all([
    searchRead<FilaOt>(
      "x_aba_orden_trabajo",
      DOMINIOS[filtro],
      CAMPOS,
      // Las sin fecha al final: es el orden en que hay que actuar. Odoo pone los NULL
      // primero en un ASC, así que se ordena por el agrupador antes que por la fecha.
      { order: "x_grupo_prog, x_fecha_programada, id", limit: 400 },
    ),
    ...claves.map((k) => searchCount("x_aba_orden_trabajo", DOMINIOS[k])),
  ]);

  const conteos = Object.fromEntries(claves.map((k, i) => [k, cuentas[i]])) as ConteosOrdenes;
  return { ordenes: filas.map((f) => mapOt(f, base, actionId)), conteos };
}

const CAMPOS_FICHA = [
  ...CAMPOS,
  "x_desvio", "x_horas_hombre", "x_jornadas_hombre_estimadas",
  "x_costo_mano_obra", "x_costo_fletes", "x_costo_total",
  "x_hab_etapa", "x_hab_vencimiento", "x_motivo_urgencia",
  "x_contacto_obra", "x_tel_obra", "x_observaciones", "x_detalle_tecnico",
];

/**
 * La ficha. Todo lo que muestra YA está calculado en Odoo: no se computa nada nuevo acá.
 *
 * x_desvio es el número que dice si la obra se fue de lo estimado y no se veía en ninguna
 * pantalla de la app. Está cargado en 942 de las 1003.
 */
export async function fetchOrdenDetalle(id: number): Promise<OrdenDetalle | null> {
  const base = process.env.ODOO_URL ?? "";
  const actionId = await otActionId();

  const [filas, asignaciones] = await Promise.all([
    read<FilaOt & Record<string, unknown>>("x_aba_orden_trabajo", [id], CAMPOS_FICHA),
    searchRead<{
      id: number;
      x_fecha: string | false;
      x_cuadrilla_id: M2O;
      x_estado: string | false;
      x_parte_id: M2O;
    }>(
      "x_aba_asignacion",
      [["x_ot_id", "=", id]],
      ["x_fecha", "x_cuadrilla_id", "x_estado", "x_parte_id"],
      { order: "x_fecha, id" },
    ),
  ]);
  const fila = filas[0];
  if (!fila) return null;

  // Los partes de esas jornadas, para mostrar personal y horas del día.
  const parteIds = asignaciones
    .map((a) => m2oId(a.x_parte_id))
    .filter((x): x is number => x !== null);
  const partes = parteIds.length
    ? await read<{ id: number; x_horas_hombre: number | false; x_estado: string | false }>(
        "x_aba_parte_diario", parteIds, ["x_horas_hombre", "x_estado"],
      )
    : [];
  const lineas = parteIds.length
    ? await searchRead<{ x_parte_diario_id: M2O; x_personas: number | false; x_hora_desde: number | false; x_hora_hasta: number | false }>(
        "x_aba_mano_obra",
        [["x_parte_diario_id", "in", parteIds]],
        ["x_parte_diario_id", "x_personas", "x_hora_desde", "x_hora_hasta"],
      )
    : [];

  const partePorId = new Map(partes.map((p) => [p.id, p]));
  const lineaPorParte = new Map<number, (typeof lineas)[number]>();
  for (const l of lineas) {
    const pid = m2oId(l.x_parte_diario_id);
    // Se toma la primera línea: 1225 de 1247 partes tienen una sola.
    if (pid && !lineaPorParte.has(pid)) lineaPorParte.set(pid, l);
  }

  const jornadasPlanificadas: JornadaDeOrden[] = asignaciones.map((a) => {
    const pid = m2oId(a.x_parte_id);
    const parte = pid ? partePorId.get(pid) : undefined;
    const linea = pid ? lineaPorParte.get(pid) : undefined;
    return {
      asignacionId: a.id,
      fecha: str(a.x_fecha) ?? "",
      cuadrilla: m2oName(a.x_cuadrilla_id),
      estado: a.x_estado === "confirmada" ? "confirmada" : "tentativa",
      parteId: pid,
      personas: linea ? num(linea.x_personas) : null,
      horaDesde: linea ? num(linea.x_hora_desde) : null,
      horaHasta: linea ? num(linea.x_hora_hasta) : null,
      horasHombre: parte ? num(parte.x_horas_hombre) : null,
      parteEstado: parte ? str(parte.x_estado) : null,
    };
  });

  const desvioTexto = str(fila.x_desvio as string | false);
  const ordenVentaId = m2oId(fila.x_order_id);
  const root = base.replace(/\/+$/, "");

  return {
    ...mapOt(fila, base, actionId),
    desvioTexto,
    desvioPct: parseDesvio(desvioTexto),
    horasHombre: num(fila.x_horas_hombre as number | false),
    jornadasHombreEstimadas: num(fila.x_jornadas_hombre_estimadas as number | false),
    costoManoObra: num(fila.x_costo_mano_obra as number | false),
    costoFletes: num(fila.x_costo_fletes as number | false),
    costoTotal: num(fila.x_costo_total as number | false),
    habEtapa: str(fila.x_hab_etapa as string | false),
    habVencimiento: str(fila.x_hab_vencimiento as string | false),
    motivoUrgencia: str(fila.x_motivo_urgencia as string | false),
    contactoObra: str(fila.x_contacto_obra as string | false),
    telObra: str(fila.x_tel_obra as string | false),
    observaciones: str(fila.x_observaciones as string | false),
    detalleTecnico: str(fila.x_detalle_tecnico as string | false),
    // La venta es de Comercial y no se gestiona desde esta app: acá el enlace externo a
    // Odoo sí corresponde.
    urlVenta: ordenVentaId ? `${root}/odoo/sale.order/${ordenVentaId}` : null,
    ventaId: ordenVentaId,
    jornadasPlanificadas,
  };
}

/**
 * Marca la urgencia de una OT. Es la ÚNICA escritura de este módulo a Odoo.
 *
 * Existe porque hasta ahora la urgencia sólo se podía marcar entrando a Odoo, y por eso
 * no la marcó nadie: 0 de 64 OTs activas en `alta`. El tablero ya sabía pintarla —borde
 * rojo, grupo de urgentes— y la maquinaria estaba esperando un dato que nadie podía
 * cargar desde donde trabaja.
 *
 * El motivo se borra al bajar de `alta`: un "se lo prometí al cliente para el jueves"
 * colgado de una OT que ya no es urgente miente sobre por qué está donde está.
 */
export async function marcarUrgencia(
  otId: number,
  urgencia: Urgencia,
  motivo: string | null,
): Promise<void> {
  await write("x_aba_orden_trabajo", [otId], {
    x_urgencia: urgencia,
    x_motivo_urgencia: urgencia === "alta" ? (motivo ?? "") : "",
  });
}

/** Las OTs activas marcadas como urgentes. Para el barrido de notificaciones. */
export async function fetchOtsUrgentes(): Promise<{ id: number; titulo: string; motivo: string | null }[]> {
  const filas = await searchRead<{ id: number; x_name: string | false; x_motivo_urgencia: string | false }>(
    "x_aba_orden_trabajo",
    [...ACTIVAS, ["x_urgencia", "=", "alta"]],
    ["x_name", "x_motivo_urgencia"],
    { limit: 200 },
  );
  return filas.map((f) => ({
    id: f.id,
    titulo: str(f.x_name) ?? `OT #${f.id}`,
    motivo: str(f.x_motivo_urgencia),
  }));
}

/** Cuántas OTs hay por estado, para el encabezado. Barato y sirve de control. */
export function contarPorEstado(): Promise<{ x_estado: string; __count: number }[]> {
  return executeKw("x_aba_orden_trabajo", "read_group", [[], ["x_estado"], ["x_estado"]], {
    lazy: false,
  });
}
