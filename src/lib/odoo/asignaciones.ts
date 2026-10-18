// Capa de datos del Tablero de Planificación contra Odoo.
//
// SOLO server-side (usa src/lib/odoo/client.ts, que lee ODOO_API_KEY). Se consume
// desde los route handlers de /api/planificacion.
//
// REGLA DE NEGOCIO: el tablero NO tiene base de datos propia. Las asignaciones viven
// en x_aba_asignacion (Odoo) y la app es la única que las escribe; en Odoo se ven en
// solo lectura (ver scripts/odoo-create-asignacion-model.mjs).
//
// DECISIÓN (rendimiento): el tablero se consulta muchas veces por día y se edita en
// ráfagas. `fetchTablero` trae la semana completa en un solo request al route handler
// (varias llamadas RPC en paralelo) y las escrituras son de a un registro.

import { searchRead, write, executeKw, read, authenticate } from "./client";
import { CAMPOS_TRABAJO, leerTrabajo, type FilaTrabajo } from "./trabajo";
import { alertaDe, semaforoHoy } from "@/lib/habilitaciones/derivacion";
import {
  claveDia,
  conflictosDeApoyo,
  diasPorOt,
  estadoDespues,
  type CambiosDeRol,
  type ConflictoApoyo,
  type FilaRol,
} from "@/lib/tablero/apoyo";
import type { HabSemaforo } from "@/lib/habilitaciones/tipos";
import type {
  AsignacionTablero,
  CambioAsignacion,
  DetalleOt,
  DocumentoOt,
  MovimientoAsignacion,
  NuevaAsignacion,
  OtTablero,
  ProgresoOt,
  TableroPayload,
} from "@/lib/tablero/tipos";

export type * from "@/lib/tablero/tipos";

// ── Helpers de normalización de los valores crudos de Odoo ──────────────────

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

/** Fracción cruda ("0.50" | false) → número. Sin valor = jornada completa. */
export function parseFraccion(v: string | false | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ── Enlace a Odoo ────────────────────────────────────────────────────────────

// El id de la acción de OTs se resuelve una vez y se cachea a nivel módulo: es
// estable y evita un RPC extra por request. Odoo 17+ enruta /odoo/action-<id>/<resId>.
let cachedOtActionId: number | null = null;

async function otActionId(): Promise<number | null> {
  if (cachedOtActionId !== null) return cachedOtActionId;
  const rows = await searchRead<{ id: number }>(
    "ir.actions.act_window",
    [["res_model", "=", "x_aba_orden_trabajo"]],
    ["id"],
    { limit: 1, order: "id" },
  );
  cachedOtActionId = rows[0]?.id ?? null;
  return cachedOtActionId;
}

function urlOt(base: string, actionId: number | null, otId: number): string {
  const root = base.replace(/\/+$/, "");
  return actionId ? `${root}/odoo/action-${actionId}/${otId}` : `${root}/odoo/${otId}`;
}

// ── Lectura del tablero ──────────────────────────────────────────────────────

const OT_FIELDS = [
  "id", "x_name", "x_order_id", "x_tipo", "x_estado", "x_urgencia", "x_motivo_urgencia",
  "x_duracion_est", "x_jornadas_num", "x_personal_por_jornada", "x_cuadrilla_prevista_id",
  "x_hab_semaforo", "x_hab_alerta", "x_hab_vencimiento", "x_tecnico", "x_contacto_obra",
  "x_tel_obra", "x_observaciones", "x_dias_obra", "x_horas_hombre", "x_cant_docs",
  "x_doc_ids", "x_fecha_programada", "x_fecha_comprometida", "x_fecha_desde", "x_fecha_antes_de",
  // Related a la venta: la dirección de obra sin pasar por el truncado de x_name.
  "x_direccion_obra", "x_obra_referencia",
  // QUÉ HAY QUE EJECUTAR, en el payload del tablero y no sólo en la ficha.
  //
  // Viaja con las ~52 OTs de la consulta que más se repite del módulo, así que se midió
  // antes de sumarlo (2026-09-12, 65 OTs activas): lo tienen las 65, es texto plano, la
  // mediana son 205 caracteres y el total ~14 KB sobre un payload de ~49 KB. El 29% de más
  // es transferencia sobre una consulta que es casi toda latencia.
  //
  // SE PIDE SIEMPRE, aunque el toggle de la topbar esté apagado: traerlo condicionalmente
  // partiría la caché del tablero en dos formas distintas del mismo rango, y obligaría a
  // recargar todo al prender el toggle — que es justo cuando el usuario quiere verlo ya.
  "x_detalle_tecnico",
  // Fotos y croquis que Comercial sube EN LA OT. Distinto de x_doc_ids, que espeja los
  // adjuntos de la venta y es de sólo lectura.
  "x_instrucciones_ids",
  // Cuándo se cargó la OT (guardias-contrato.md): una urgencia usa la guardia sin pedir nada
  // sólo si la OT es de los últimos 3 días hábiles, y un desarme sin "a partir de" es comodín
  // desde que se creó. Es un campo de todo modelo de Odoo: no hay script que correr.
  "create_date",
];

// x_apoyo lo agrega scripts/odoo-add-apoyo-a-asignacion.mjs: sin correrlo antes, esta
// lectura falla entera ("Invalid field"). Es a propósito: el apoyo tiene que salir todo
// junto, y un tablero que no supiera de apoyos contaría jornadas de más. El error llega
// traducido ("Falta correr scripts/odoo-add-apoyo-a-asignacion.mjs", ver
// campoDeApoyoFaltante en client.ts), no como el "Invalid field" crudo de Odoo.
const ASIG_FIELDS = ["id", "x_ot_id", "x_fecha", "x_cuadrilla_id", "x_fraccion", "x_estado", "x_orden_dia", "x_notas", "x_parte_id", "x_motivo_fija", "x_apoyo"];

type OdooOtRow = {
  id: number;
  x_name: string | false;
  x_order_id: M2O;
  x_tipo: string | false;
  x_estado: string | false;
  x_urgencia: string | false;
  x_motivo_urgencia: string | false;
  x_duracion_est: string | false;
  x_jornadas_num: number | false;
  x_personal_por_jornada: number | false;
  x_cuadrilla_prevista_id: M2O;
  x_hab_semaforo: string | false;
  x_hab_alerta: string | false;
  x_hab_vencimiento: string | false;
  x_tecnico: string | false;
  x_contacto_obra: string | false;
  x_tel_obra: string | false;
  x_observaciones: string | false;
  x_dias_obra: number | false;
  x_horas_hombre: number | false;
  x_cant_docs: number | false;
  x_doc_ids: number[] | false;
  x_fecha_programada: string | false;
  x_fecha_comprometida: string | false;
  x_fecha_desde: string | false;
  x_fecha_antes_de: string | false;
  x_direccion_obra: string | false;
  x_obra_referencia: string | false;
  x_detalle_tecnico: string | false;
  x_instrucciones_ids: number[] | false;
  create_date: string | false;
};

type OdooAsigRow = {
  id: number;
  x_ot_id: M2O;
  x_fecha: string | false;
  x_cuadrilla_id: M2O;
  x_fraccion: string | false;
  x_estado: string | false;
  x_orden_dia: number | false;
  x_notas: string | false;
  x_parte_id: M2O;
  x_motivo_fija: string | false;
  x_apoyo: boolean;
};

/**
 * REGLA DE NEGOCIO (spec §5): entran al tablero las OTs pendientes o en proceso cuya
 * orden de venta sea de tipo contrato "Obra " (con espacio final, así está en la base).
 * Quedan afuera "Simple" (módulos hogareños) y "Alquiler Sin Montaje".
 * Las obras sin habilitar entran igual: el semáforo advierte, no bloquea.
 */
/**
 * Avance de una obra: cuántas de sus jornadas están TOMADAS y cuántas ya se HICIERON.
 * De esa resta sale lo que la bandeja muestra como pendiente.
 *
 * REGLA DE NEGOCIO: una jornada con parte NO EJECUTADO no cuenta para ninguna de las dos.
 * El día no produjo trabajo —llovió, el cliente no habilitó, faltó el permiso: son los
 * motivos de x_motivo_no_ejec— así que la obra sigue necesitando esa jornada y tiene que
 * volver a la bandeja para replanificarse. La tarjeta roja se queda en la grilla como
 * registro de lo que pasó ese día; una cosa es la historia y otra el trabajo que falta.
 *
 * Antes se contaba "tiene parte" a secas, y un día de lluvia se descontaba como hecho:
 * la obra salía de la bandeja con una jornada menos de trabajo real y nadie la miraba
 * más, porque a la bandeja nadie va a buscar una obra que ya se fue de ahí.
 *
 * El dominio va con el OR explícito: en Odoo, una condición sobre `x_parte_id.x_estado`
 * se resuelve como subconsulta y deja afuera las asignaciones que todavía no tienen
 * parte, que son justamente las que más cuentan como tomadas.
 *
 * LOS APOYOS NO CUENTAN (docs/tablero-planificacion/apoyo.md). Una obra de 3 días con la
 * C3 de apoyo el martes sigue siendo una obra de 3 días: si el apoyo sumara, la bandeja
 * pediría una jornada que no falta y el listado nunca llegaría a la "última de la OT".
 */
const SIN_APOYOS = ["x_apoyo", "=", false];
const DOM_TOMADAS = [SIN_APOYOS, "|", ["x_parte_id", "=", false], ["x_parte_id.x_estado", "!=", "no_ejecutado"]];
const DOM_HECHAS = [SIN_APOYOS, ["x_parte_id", "!=", false], ["x_parte_id.x_estado", "!=", "no_ejecutado"]];

/**
 * Las dos consultas de avance, juntas para que el tablero y el listado no diverjan.
 * Devuelven DÍAS DISTINTOS por OT: `Map<otId, días>`.
 *
 * POR DÍAS Y NO POR REGISTROS: es la protección extra del apoyo para lo que el dominio no
 * ataja —dos principales el mismo día cargadas a mano en Odoo, los partes duplicados
 * viejos—, que igual son un solo día de obra. Ver diasPorOt en lib/tablero/apoyo.ts.
 *
 * Se agrupa en Odoo por (OT, día) en vez de traer las asignaciones: vuelve un grupo por
 * día de obra (337 al 17/10/2026, igual que las asignaciones, porque hasta hoy no hay
 * dos el mismo día), sin los demás campos de cada fila. La fecha sale de `__range`, que
 * es ISO; la etiqueta ("18 ago 2026") depende del idioma del usuario de la API.
 */
export function consultasDeAvance(): readonly [Promise<Map<number, number>>, Promise<Map<number, number>>] {
  const porOt = (dominio: unknown[]) =>
    executeKw<{ x_ot_id: M2O; "x_fecha:day"?: string | false; __range?: { "x_fecha:day"?: { from?: string } }; __count: number }[]>(
      "x_aba_asignacion", "read_group", [dominio, ["x_ot_id"], ["x_ot_id", "x_fecha:day"]], { lazy: false },
    ).then((grupos) =>
      diasPorOt(
        grupos.map((g) => ({
          otId: m2oId(g.x_ot_id),
          fecha: g.__range?.["x_fecha:day"]?.from?.slice(0, 10) ?? str(g["x_fecha:day"] ?? false),
        })),
      ),
    );
  return [porOt(DOM_TOMADAS), porOt(DOM_HECHAS)] as const;
}

const DOMINIO_OTS_CANDIDATAS = [
  ["x_estado", "in", ["pendiente", "en_proceso"]],
  ["x_order_id.x_studio_tipo_de_contrato", "=", "Obra "],
];

function mapOt(row: OdooOtRow, base: string, actionId: number | null, conSyh: ReadonlySet<number>): OtTablero {
  // x_duracion_est es el dato fino (0.10…15) y manda cuando está cargado; si viene
  // vacío —el campo es nuevo y la mayoría de las OTs no lo tiene— cae a x_jornadas_num.
  const dur = Number(row.x_duracion_est);
  const jornadas = Number.isFinite(dur) && dur > 0 ? dur : num(row.x_jornadas_num) || 1;
  // Semáforo y alerta CALCULADOS HOY, con la misma fórmula que Odoo: los de Odoo se
  // guardan y no se recalculan cuando pasa el día (ver "Lo que depende de HOY" en
  // lib/habilitaciones/derivacion.ts). Así el tablero dice lo mismo que la bandeja.
  const estadoOt = str(row.x_estado) ?? "pendiente";
  const habSemaforo = semaforoHoy({
    semaforo: (str(row.x_hab_semaforo) ?? "rojo") as HabSemaforo,
    vencimiento: str(row.x_hab_vencimiento),
    estadoOt,
  });
  return {
    id: row.id,
    titulo: str(row.x_name) ?? `OT #${row.id}`,
    direccionObra: str(row.x_direccion_obra),
    referenciaObra: str(row.x_obra_referencia),
    detalleTecnico: str(row.x_detalle_tecnico),
    tipo: str(row.x_tipo) ?? "otro",
    estado: estadoOt,
    urgencia: str(row.x_urgencia) ?? "baja",
    motivoUrgencia: str(row.x_motivo_urgencia),
    jornadas,
    // El fallback ya se aplicó arriba, así que `jornadas` no dice si alguien estimó o no.
    // Esto sí: es la marca que la bandeja usa para no restar contra un número inventado.
    sinEstimar: !str(row.x_duracion_est),
    personalPorJornada: num(row.x_personal_por_jornada),
    cuadrillaPrevistaId: m2oId(row.x_cuadrilla_prevista_id),
    habSemaforo,
    habAlerta: alertaDe({ semaforo: habSemaforo, fechaProgramada: str(row.x_fecha_programada), estadoOt }),
    habVencimiento: str(row.x_hab_vencimiento),
    tecnico: str(row.x_tecnico),
    contactoObra: str(row.x_contacto_obra),
    telObra: str(row.x_tel_obra),
    observaciones: str(row.x_observaciones),
    diasObra: num(row.x_dias_obra),
    horasHombre: num(row.x_horas_hombre),
    cantDocs: num(row.x_cant_docs),
    docIds: Array.isArray(row.x_doc_ids) ? row.x_doc_ids : [],
    cantInstrucciones: Array.isArray(row.x_instrucciones_ids) ? row.x_instrucciones_ids.length : 0,
    ordenVenta: m2oName(row.x_order_id),
    fechaProgramada: str(row.x_fecha_programada),
    fechaComprometida: str(row.x_fecha_comprometida),
    fechaDesde: str(row.x_fecha_desde),
    fechaAntesDe: str(row.x_fecha_antes_de),
    syh: conSyh.has(row.id),
    creadaEl: str(row.create_date),
    url: urlOt(base, actionId, row.id),
  };
}

function mapAsig(row: OdooAsigRow): AsignacionTablero {
  return {
    id: row.id,
    otId: m2oId(row.x_ot_id) ?? 0,
    fecha: str(row.x_fecha) ?? "",
    cuadrillaId: m2oId(row.x_cuadrilla_id),
    fraccion: parseFraccion(row.x_fraccion),
    estado: row.x_estado === "confirmada" ? "confirmada" : "tentativa",
    ordenDia: num(row.x_orden_dia),
    notas: str(row.x_notas),
    parteId: m2oId(row.x_parte_id),
    motivoFija: str(row.x_motivo_fija),
    apoyo: row.x_apoyo === true,
  };
}

/** Trae todo lo que el tablero necesita para el rango [desde, hasta] en una sola pasada. */
export async function fetchTablero(desde: string, hasta: string): Promise<TableroPayload> {
  const base = process.env.ODOO_URL ?? "";
  // Se resuelve el login ANTES del lote: si no, las lecturas en paralelo arrancan todas
  // pidiendo autenticación y Odoo las limita (ver la cola en client.ts). Con ODOO_UID
  // seteado esto no sale a la red.
  await authenticate();

  // otActionId va ADENTRO del lote, no antes. Es cacheado a nivel módulo, pero en un
  // lambda frío se pedía igual y en serie: un round trip entero de espera para armar una
  // URL que no depende de nada. Es el mismo arreglo que en fetchOrdenes.
  const [actionId, cuadrillasRaw, asigsRaw, otsCandidatas, partesRaw, otsConSyh, gruposAsignadas, gruposCerradas] = await Promise.all([
    otActionId(),
    searchRead<{ id: number; x_name: string | false; x_tercerizada: boolean }>(
      "x_aba_cuadrilla",
      [["x_activa", "=", true]],
      ["id", "x_name", "x_tercerizada"],
      { order: "x_name" },
    ),
    searchRead<OdooAsigRow>(
      "x_aba_asignacion",
      [["x_fecha", ">=", desde], ["x_fecha", "<=", hasta]],
      ASIG_FIELDS,
      { order: "x_fecha, x_orden_dia, id" },
    ),
    searchRead<OdooOtRow>("x_aba_orden_trabajo", DOMINIO_OTS_CANDIDATAS, OT_FIELDS, { order: "id" }),
    // Partes de la semana: marcan en el tablero las jornadas ya ejecutadas.
    searchRead<{ id: number; x_orden_trabajo_id: M2O; x_fecha: string | false; x_cuadrilla_id: M2O; x_estado: string | false; x_motivo_no_ejec: string | false }>(
      "x_aba_parte_diario",
      [["x_fecha", ">=", desde], ["x_fecha", "<=", hasta]],
      ["x_orden_trabajo_id", "x_fecha", "x_cuadrilla_id", "x_estado", "x_motivo_no_ejec"],
    ),
    // Las OTs que llevan técnico de SyH nuestro. El campo vive en la VENTA y search_read no
    // trae campos de un many2one, así que va como dominio sobre la OT: sólo ids, sin
    // restringir a candidatas para cubrir también las completadas que siguen en la grilla.
    searchRead<{ id: number }>("x_aba_orden_trabajo", [["x_order_id.x_syh_presencial", "=", "si"]], ["id"]),
    // Avance por OT, sin traer todas las asignaciones históricas: cuántas jornadas
    // tiene tomadas y cuántas ya se hicieron. Con eso la bandeja sabe si a una obra le
    // quedan jornadas por planificar aunque parte de ella ya se haya ejecutado.
    ...consultasDeAvance(),
  ]);

  const asignaciones = asigsRaw.map(mapAsig);

  // Una asignación puede apuntar a una OT que ya no es candidata (p. ej. se completó
  // esta semana). Se traen esas OTs aparte para no dejar tarjetas huérfanas.
  const candidatasIds = new Set(otsCandidatas.map((o) => o.id));
  const faltantes = [...new Set(asignaciones.map((a) => a.otId))].filter((id) => id && !candidatasIds.has(id));
  const otsExtra = faltantes.length ? await read<OdooOtRow>("x_aba_orden_trabajo", faltantes, OT_FIELDS) : [];
  const conSyh = new Set(otsConSyh.map((o) => o.id));

  return {
    cuadrillas: cuadrillasRaw.map((c) => ({
      id: c.id,
      nombre: str(c.x_name) ?? `Cuadrilla #${c.id}`,
      tercerizada: c.x_tercerizada === true,
    })),
    asignaciones,
    ots: [...otsCandidatas, ...otsExtra].map((o) => mapOt(o, base, actionId, conSyh)),
    partes: partesRaw.map((p) => ({
      id: p.id,
      otId: m2oId(p.x_orden_trabajo_id) ?? 0,
      fecha: str(p.x_fecha) ?? "",
      cuadrillaId: m2oId(p.x_cuadrilla_id),
      estado: str(p.x_estado) ?? "previsto",
      motivoNoEjec: str(p.x_motivo_no_ejec),
    })),
    // Días distintos y sin apoyos (ver consultasDeAvance).
    progreso: [...gruposAsignadas]
      .map(([otId, asignadas]) => ({ otId, asignadas, cerradas: gruposCerradas.get(otId) ?? 0 }))
      .filter((p) => p.otId),
  };
}

/**
 * Lo que la Hoja del día necesita del tablero (docs/equipos-del-dia/modulo.md §2): las
 * asignaciones de un rango corto de días y SÓLO las OTs que aparecen en ellas, con lo que
 * la hoja muestra de cada una (dirección, tipo, contacto, coordenadas, qué jornada es).
 *
 * NO REUSA fetchTablero A PROPÓSITO: ése trae las ~52 OTs candidatas, los partes y el
 * avance de todas, que la hoja no usa. Esto son 4 llamadas (cuadrillas y asignaciones en
 * paralelo; después las OTs y sus jornadas en paralelo; al final las coordenadas de sus
 * ventas), con los mismos campos y el mismo mapeo (mapOt/mapAsig) que el tablero, para que
 * la hoja y el tablero digan lo mismo de la misma OT.
 *
 * `fechas`: las fechas de las que se quiere el tablero (el día de la hoja y el anterior con
 * hojas). Se piden por rango [min, max] y se filtran acá: una sola consulta.
 */
export async function fetchTableroDeFechas(fechas: string[]): Promise<{
  cuadrillas: { id: number; nombre: string; tercerizada: boolean }[];
  asignaciones: AsignacionTablero[];
  ots: (OtTablero & { ventaId: number | null; lat: number | null; lng: number | null; fechasJornadas: string[] })[];
}> {
  const lista = [...new Set(fechas.filter(Boolean))].sort();
  if (!lista.length) return { cuadrillas: [], asignaciones: [], ots: [] };
  const base = process.env.ODOO_URL ?? "";
  await authenticate();
  const [actionId, cuadrillasRaw, asigsRaw] = await Promise.all([
    otActionId(),
    searchRead<{ id: number; x_name: string | false; x_tercerizada: boolean }>(
      "x_aba_cuadrilla", [["x_activa", "=", true]], ["id", "x_name", "x_tercerizada"], { order: "x_name" },
    ),
    searchRead<OdooAsigRow>(
      "x_aba_asignacion",
      [["x_fecha", ">=", lista[0]], ["x_fecha", "<=", lista[lista.length - 1]], ["x_ot_id", "!=", false]],
      ASIG_FIELDS,
      { order: "x_fecha, x_orden_dia, id" },
    ),
  ]);
  const quiero = new Set(lista);
  const asignaciones = asigsRaw.map(mapAsig).filter((a) => quiero.has(a.fecha));
  const otIds = [...new Set(asignaciones.map((a) => a.otId).filter(Boolean))];
  if (!otIds.length) {
    return { cuadrillas: cuadrillasRaw.map((c) => ({ id: c.id, nombre: str(c.x_name) ?? `Cuadrilla #${c.id}`, tercerizada: c.x_tercerizada === true })), asignaciones, ots: [] };
  }
  // Las jornadas de esas OTs (sólo las fechas): de ahí sale "día 2 de 3", el primer día de un
  // armado y el último de un desarme (los sugeridos de la noche anterior).
  const [otsRaw, jornadasRaw] = await Promise.all([
    read<OdooOtRow>("x_aba_orden_trabajo", otIds, OT_FIELDS),
    // Sin apoyos: "día 2 de 3" cuenta días de la obra, y el apoyo no agrega ninguno.
    searchRead<{ x_ot_id: M2O; x_fecha: string | false }>("x_aba_asignacion", [["x_ot_id", "in", otIds], SIN_APOYOS], ["x_ot_id", "x_fecha"]),
  ]);
  const ventaIds = [...new Set(otsRaw.map((o) => m2oId(o.x_order_id)).filter((x): x is number => x != null))];
  const coords = ventaIds.length
    ? await read<{ id: number; x_obra_lat: number | false; x_obra_lng: number | false; x_syh_presencial: string | false }>(
        "sale.order", ventaIds, ["x_obra_lat", "x_obra_lng", "x_syh_presencial"],
      )
    : [];
  const coordDe = new Map(coords.map((c) => [c.id, c]));
  // SyH sale de la misma lectura de la venta que ya se hacía por las coordenadas.
  const conSyh = new Set(
    otsRaw.filter((o) => { const v = m2oId(o.x_order_id); return v != null && coordDe.get(v)?.x_syh_presencial === "si"; }).map((o) => o.id),
  );
  const jornadas = new Map<number, Set<string>>();
  for (const j of jornadasRaw) {
    const id = m2oId(j.x_ot_id);
    const f = str(j.x_fecha);
    if (id == null || !f) continue;
    const set = jornadas.get(id) ?? new Set<string>();
    set.add(f);
    jornadas.set(id, set);
  }
  return {
    cuadrillas: cuadrillasRaw.map((c) => ({ id: c.id, nombre: str(c.x_name) ?? `Cuadrilla #${c.id}`, tercerizada: c.x_tercerizada === true })),
    asignaciones,
    ots: otsRaw.map((o) => {
      const ventaId = m2oId(o.x_order_id);
      const c = ventaId != null ? coordDe.get(ventaId) : undefined;
      return {
        ...mapOt(o, base, actionId, conSyh),
        ventaId,
        lat: typeof c?.x_obra_lat === "number" && c.x_obra_lat !== 0 ? c.x_obra_lat : null,
        lng: typeof c?.x_obra_lng === "number" && c.x_obra_lng !== 0 ? c.x_obra_lng : null,
        fechasJornadas: [...(jornadas.get(o.id) ?? [])].sort(),
      };
    }),
  };
}

/**
 * Las fechas de todas las jornadas de una OT, sin límite de rango y sin repetir.
 *
 * La usa el buscador del tablero para una obra planificada fuera de las semanas cargadas:
 * `progreso` dice que la obra tiene jornadas, pero no dónde caen, y traer las asignaciones
 * de todas las fechas en cada carga del tablero sería pedir el histórico entero por una
 * pregunta que se hace de a una obra y sólo al hacer clic.
 */
export async function fechasDeOt(otId: number): Promise<string[]> {
  const filas = await searchRead<{ x_fecha: string | false }>(
    "x_aba_asignacion",
    [["x_ot_id", "=", otId]],
    ["x_fecha"],
    { order: "x_fecha" },
  );
  return [...new Set(filas.map((f) => str(f.x_fecha)).filter((f): f is string => !!f))];
}

/**
 * Jornadas de hoy en adelante por cuadrilla. La usa la página de configuración para
 * frenar el borrado o la desactivación de una cuadrilla que todavía tiene trabajo.
 *
 * Va contra Odoo y no contra Supabase por una razón concreta: hasta ahora esta cuenta
 * salía de `planificacion_asignaciones`, la tabla del tablero anterior, que dejó de
 * recibir escrituras cuando el plan se mudó a Odoo. La guarda venía respondiendo cero
 * para todas las cuadrillas, así que se podía desactivar una con la semana llena.
 *
 * Devuelve el nombre además del id porque del otro lado las cuadrillas son las de
 * Supabase, que no guardan el id de Odoo: el cruce es por nombre. Ver useFuturasPorCuadrilla.
 */
export async function fetchFuturasPorCuadrilla(
  desde: string,
): Promise<{ id: number; nombre: string; futuras: number }[]> {
  const [cuadrillas, grupos] = await Promise.all([
    searchRead<{ id: number; x_name: string | false }>("x_aba_cuadrilla", [], ["x_name"]),
    executeKw<{ x_cuadrilla_id: M2O; __count: number }[]>(
      "x_aba_asignacion",
      "read_group",
      [[["x_fecha", ">=", desde]], ["x_cuadrilla_id"], ["x_cuadrilla_id"]],
      { lazy: false },
    ),
  ]);

  const porId = new Map<number, number>();
  for (const g of grupos) {
    const id = m2oId(g.x_cuadrilla_id);
    // Las asignaciones sin cuadrilla no le suman trabajo futuro a ninguna.
    if (id != null) porId.set(id, g.__count);
  }

  return cuadrillas.map((c) => ({
    id: c.id,
    nombre: str(c.x_name) ?? `Cuadrilla #${c.id}`,
    futuras: porId.get(c.id) ?? 0,
  }));
}

/**
 * La ficha de una OT: lo que se lee al abrir el panel lateral y no antes.
 *
 * Son dos lecturas encadenadas —la OT y después su orden— porque el cliente, la
 * dirección de obra, el técnico con nombre y apellido y el vendedor viven en sale.order.
 * Encadenadas y no en paralelo: hay que leer la OT para saber cuál es su orden.
 *
 * Relevado sobre las 52 OTs candidatas: todos estos campos están cargados en el 100% de
 * los casos salvo la firmeza (37%), el desvío (21%) y la duración sugerida (25%), que
 * son justamente los que sólo tienen sentido cuando existen.
 */
export async function fetchDetalleOt(otId: number): Promise<DetalleOt> {
  const [ot] = await read<{
    x_order_id: M2O;
    x_detalle_tecnico: string | false;
    x_hab_etapa: string | false;
    x_fecha_firmeza: string | false;
    x_periodo: string | false;
    x_desvio: string | false;
    x_duracion_sugerida: string | false;
    x_direccion_obra: string | false;
    x_obra_referencia: string | false;
    x_ejecutado_real: string | false;
  }>("x_aba_orden_trabajo", [otId], [
    "x_order_id", "x_detalle_tecnico", "x_hab_etapa", "x_fecha_firmeza",
    "x_periodo", "x_desvio", "x_duracion_sugerida", "x_direccion_obra", "x_obra_referencia",
    "x_ejecutado_real",
  ]);
  if (!ot) throw new Error("La OT no existe");

  const ordenId = m2oId(ot.x_order_id);
  const [orden] = ordenId
    ? await read<{
        partner_id: M2O; partner_shipping_id: M2O; x_studio_tcnico: M2O; user_id: M2O;
        x_estructura_fecha: string | false;
        x_contactos_obra_ids: number[] | false;
      } & Partial<FilaTrabajo>>(
        "sale.order",
        [ordenId],
        // La clasificación del trabajo viaja en la MISMA lectura: la venta ya se estaba
        // leyendo para el cliente y el vendedor, así que no cuesta una llamada más.
        ["partner_id", "partner_shipping_id", "x_studio_tcnico", "user_id", "x_estructura_fecha",
         "x_contactos_obra_ids", ...CAMPOS_TRABAJO],
      )
    : [];

  // La obra vive en un contacto HIJO del cliente, de tipo "delivery", cuyo nombre ES la
  // dirección ("Av. Callao 1810 (FACHADA CALLAO)") y cuyo padre es el cliente de verdad.
  // Por eso no alcanza con el nombre que muestra el many2one —que viene con todo pegado,
  // "CLIENTE, Calle 123"—: hay que leer el contacto.
  const idEnvio = m2oId(orden?.partner_shipping_id);
  const idCliente = m2oId(orden?.partner_id);
  const ids = [...new Set([idEnvio, idCliente].filter((x): x is number => x != null))];
  const contactos = ids.length
    ? await read<{
        id: number;
        name: string | false;
        street: string | false;
        street2: string | false;
        city: string | false;
        phone: string | false;
        type: string | false;
        parent_id: M2O;
      }>("res.partner", ids, ["name", "street", "street2", "city", "phone", "type", "parent_id"])
    : [];
  const obra = contactos.find((c) => c.id === idEnvio) ?? contactos.find((c) => c.id === idCliente);

  // Los contactos de la obra. Una lectura más, y sólo cuando alguien abre el panel: no
  // viajan con el tablero, que trae medio centenar de OTs y se repite todo el día.
  const idsContactos = Array.isArray(orden?.x_contactos_obra_ids) ? orden.x_contactos_obra_ids : [];
  const contactosObra = idsContactos.length
    ? await read<{ id: number; x_name: string | false; x_rol: string | false; x_telefono: string | false; x_email: string | false }>(
        "x_aba_contacto_obra", idsContactos, ["x_name", "x_rol", "x_telefono", "x_email"],
      )
    : [];

  const calle = [str(obra?.street), str(obra?.street2), str(obra?.city)].filter(Boolean).join(", ");
  return {
    detalleTecnico: str(ot.x_detalle_tecnico),
    estructuraConfirmadaEl: str(orden?.x_estructura_fecha),
    // El cliente es el PADRE del contacto de obra. Sin padre, el contacto ya es el cliente.
    cliente: m2oName(obra?.parent_id) ?? str(obra?.name),
    // EL CAMPO PROPIO MANDA. Antes esto derivaba la dirección de los contactos por su
    // cuenta, así que el panel podía mostrar una calle distinta a la de la tarjeta —que
    // sale de x_direccion_obra— para la misma OT. Ahora las dos leen lo mismo, y la
    // derivación queda de respaldo para las ventas sin el campo cargado.
    direccionObra:
      str(ot.x_direccion_obra) ??
      calle ??
      (obra?.type === "delivery" ? str(obra?.name) : null),
    referenciaObra: str(ot.x_obra_referencia),
    // El teléfono de la ficha de obra del cliente. La OT tiene su propio contacto, pero
    // está cargado en el 12% de los casos: cuando falta, éste es el número al que se llama.
    telFichaCliente: str(obra?.phone),
    tecnicoNombre: m2oName(orden?.x_studio_tcnico),
    vendedor: m2oName(orden?.user_id),
    habEtapa: str(ot.x_hab_etapa),
    fechaFirmeza: str(ot.x_fecha_firmeza),
    periodo: str(ot.x_periodo),
    desvio: str(ot.x_desvio),
    duracionSugerida: str(ot.x_duracion_sugerida),
    trabajo: leerTrabajo(orden),
    ejecutadoReal: str(ot.x_ejecutado_real),
    ventaId: ordenId,
    contactosObra: contactosObra.map((c) => ({
      id: c.id,
      nombre: str(c.x_name) ?? "—",
      rol: str(c.x_rol),
      telefono: str(c.x_telefono),
      email: str(c.x_email),
    })),
  };
}

/** Adjuntos de una OT, para la vista previa del panel lateral. */
export async function fetchDocumentosOt(otId: number): Promise<DocumentoOt[]> {
  const base = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  // DOS FUENTES. `x_instrucciones_ids` lo sube Comercial en la propia OT —croquis, fotos
  // de lo que hay que ejecutar— y `x_doc_ids` espeja los adjuntos de la orden de venta.
  // Las instrucciones van PRIMERO: son las que la cuadrilla necesita antes de salir; la
  // propuesta y los papeles de la venta son contexto.
  const [ot] = await read<{ x_doc_ids: number[] | false; x_instrucciones_ids: number[] | false }>(
    "x_aba_orden_trabajo",
    [otId],
    ["x_doc_ids", "x_instrucciones_ids"],
  );
  const instrucciones = Array.isArray(ot?.x_instrucciones_ids) ? ot.x_instrucciones_ids : [];
  const deLaVenta = Array.isArray(ot?.x_doc_ids) ? ot.x_doc_ids : [];
  // Un mismo archivo podría estar en las dos: se muestra una vez, como instrucción.
  const ids = [...new Set([...instrucciones, ...deLaVenta])];
  if (ids.length === 0) return [];

  const adjuntos = await read<{ id: number; name: string | false; mimetype: string | false }>(
    "ir.attachment",
    ids,
    ["name", "mimetype"],
  );
  const esInstruccion = new Set(instrucciones);
  return adjuntos
    .map((a) => ({
      id: a.id,
      nombre: str(a.name) ?? `Adjunto #${a.id}`,
      mimetype: str(a.mimetype) ?? "",
      instruccion: esInstruccion.has(a.id),
      // /web/content sirve el archivo con la sesión de Odoo del usuario en el browser.
      url: `${base}/web/content/${a.id}?download=false`,
    }))
    .sort((a, b) => Number(b.instruccion) - Number(a.instruccion));
}

// ── Escritura ────────────────────────────────────────────────────────────────

/** x_name es el display name del registro en Odoo; lo escribe la app para que la lista sea legible. */
function nombreAsignacion(tituloOt: string, fecha: string): string {
  return `${tituloOt} · ${fecha}`;
}

function valoresAsignacion(a: NuevaAsignacion, tituloOt: string): Record<string, unknown> {
  return {
    x_name: nombreAsignacion(tituloOt, a.fecha),
    x_ot_id: a.otId,
    x_fecha: a.fecha,
    x_cuadrilla_id: a.cuadrillaId ?? false,
    x_fraccion: a.fraccion,
    x_estado: a.estado,
    x_orden_dia: a.ordenDia,
    x_notas: a.notas ?? false,
    // Sólo en los apoyos: la principal queda con el default de Odoo (false). Así planificar
    // una obra común no depende de que el campo exista.
    ...(a.apoyo === true ? { x_apoyo: true } : {}),
  };
}

/**
 * Crea las asignaciones de una obra (una por jornada). Devuelve los ids creados.
 * Se usa `create` de a lote: Odoo acepta una lista de valores en una sola llamada.
 */
export async function crearAsignaciones(nuevas: NuevaAsignacion[]): Promise<number[]> {
  if (nuevas.length === 0) return [];
  const otIds = [...new Set(nuevas.map((n) => n.otId))];
  const titulos = new Map<number, string>();
  const [rows, partesDelDia] = await Promise.all([
    read<{ id: number; x_name: string | false }>("x_aba_orden_trabajo", otIds, ["x_name"]),
    partesDePrincipales(nuevas.filter((n) => n.apoyo === true)),
  ]);
  for (const r of rows) titulos.set(r.id, str(r.x_name) ?? `OT #${r.id}`);

  const ids = await executeKw<number | number[]>("x_aba_asignacion", "create", [
    nuevas.map((n) => {
      const valores = valoresAsignacion(n, titulos.get(n.otId) ?? `OT #${n.otId}`);
      // SUMAR UN APOYO A UN DÍA QUE YA TIENE PARTE (apoyo.md, casos borde). El parte es uno
      // por obra y día y ya existe: el apoyo nace vinculado a él, y confirmado, como lo deja
      // el cierre. Si naciera suelto quedaría como una jornada sin parte que nadie puede
      // cargar (el apoyo no carga parte). El parte NO se toca: el listado de Partes avisa
      // "sumá la gente de C3 al parte" hasta que alguien la cargue.
      const parteId = n.apoyo === true ? partesDelDia.get(claveDia(n.otId, n.fecha)) : undefined;
      return parteId ? { ...valores, x_parte_id: parteId, x_estado: "confirmada" } : valores;
    }),
  ]);
  return Array.isArray(ids) ? ids : [ids];
}

/**
 * El parte de la principal de cada (obra, día) de los apoyos que se van a crear, por
 * `claveDia`. Una sola lectura, y ninguna si no se crea ningún apoyo (casi siempre).
 */
async function partesDePrincipales(apoyos: NuevaAsignacion[]): Promise<Map<string, number>> {
  const porDia = new Map<string, number>();
  if (apoyos.length === 0) return porDia;
  const principales = await searchRead<{ id: number; x_ot_id: M2O; x_fecha: string | false; x_parte_id: M2O }>(
    "x_aba_asignacion",
    [
      ["x_apoyo", "=", false],
      ["x_parte_id", "!=", false],
      ["x_ot_id", "in", [...new Set(apoyos.map((a) => a.otId))]],
      ["x_fecha", "in", [...new Set(apoyos.map((a) => a.fecha))]],
    ],
    ["x_ot_id", "x_fecha", "x_parte_id"],
    { order: "id" },
  );
  for (const p of principales) {
    const otId = m2oId(p.x_ot_id);
    const fecha = str(p.x_fecha);
    const parteId = m2oId(p.x_parte_id);
    // La primera que llegó, como agruparApoyos si hubiera dos principales ese día.
    if (otId && fecha && parteId && !porDia.has(claveDia(otId, fecha))) porDia.set(claveDia(otId, fecha), parteId);
  }
  return porDia;
}

/** Actualiza uno o varios registros con los mismos valores (mover un bloque = N fechas distintas → usar `moverBloque`). */
export async function actualizarAsignaciones(ids: number[], cambio: CambioAsignacion): Promise<void> {
  if (ids.length === 0) return;
  const values: Record<string, unknown> = {};
  if (cambio.fecha !== undefined) values.x_fecha = cambio.fecha;
  if (cambio.cuadrillaId !== undefined) values.x_cuadrilla_id = cambio.cuadrillaId ?? false;
  if (cambio.fraccion !== undefined) values.x_fraccion = cambio.fraccion;
  if (cambio.estado !== undefined) values.x_estado = cambio.estado;
  if (cambio.ordenDia !== undefined) values.x_orden_dia = cambio.ordenDia;
  if (cambio.notas !== undefined) values.x_notas = cambio.notas ?? false;
  // Con texto queda fija; con null se suelta. El `?? false` es el "vacío" de Odoo, que
  // para un char no es "" sino false — un "" pasaría a contar como fija.
  if (cambio.motivoFija !== undefined) values.x_motivo_fija = cambio.motivoFija || false;
  if (cambio.apoyo !== undefined) values.x_apoyo = cambio.apoyo;
  if (Object.keys(values).length === 0) return;
  await write("x_aba_asignacion", ids, values);
}

/**
 * "Hacer principal": cambia el rol de cada asignación, en UNA request.
 *
 * Dos escrituras (una por valor) y no una por id. Van juntas en la misma request porque el
 * estado intermedio —dos principales, o un apoyo sin principal— es justo lo que la
 * validación de roles no deja escribir: la ruta valida el intercambio ENTERO antes de
 * llamar acá. Primero se baja la principal a apoyo y después se sube el apoyo: si la
 * segunda escritura fallara, queda un día sin principal (se ve en rojo en el tablero y se
 * arregla con un clic) en vez de dos principales, que contarían un día de obra de más.
 */
export async function cambiarRoles(roles: { id: number; apoyo: boolean }[]): Promise<void> {
  const aApoyo = roles.filter((r) => r.apoyo).map((r) => r.id);
  const aPrincipal = roles.filter((r) => !r.apoyo).map((r) => r.id);
  if (aApoyo.length > 0) await write("x_aba_asignacion", aApoyo, { x_apoyo: true });
  if (aPrincipal.length > 0) await write("x_aba_asignacion", aPrincipal, { x_apoyo: false });
}

const CAMPOS_ROL = ["x_ot_id", "x_fecha", "x_cuadrilla_id", "x_apoyo"];
type OdooRolRow = { id: number; x_ot_id: M2O; x_fecha: string | false; x_cuadrilla_id: M2O; x_apoyo: boolean };

function filaRol(r: OdooRolRow): FilaRol {
  return {
    id: r.id,
    otId: m2oId(r.x_ot_id),
    fecha: str(r.x_fecha),
    cuadrillaId: m2oId(r.x_cuadrilla_id),
    apoyo: r.x_apoyo === true,
  };
}

/**
 * Los problemas de roles que crearía esta escritura (apoyo.md, etapa 2): apoyo sin
 * principal, dos principales el mismo día, o el apoyo en la cuadrilla de la principal.
 * Vacío = se puede escribir.
 *
 * POR QUÉ EN EL SERVIDOR, si el tablero ya lo controla: el tablero decide con lo que tiene
 * en memoria, que puede tener treinta segundos de atraso, y hay más de un camino que
 * escribe asignaciones (el editor de jornadas, la ficha, el arrastre, el deshacer). Una
 * obra con dos principales el mismo día cuenta un día de más y dos partes; un apoyo
 * huérfano es una jornada que nadie puede cerrar. Es la misma lógica que en el cliente
 * (conflictosDeApoyo, con tests), así que el servidor sólo frena lo que la pantalla ya
 * debería haber evitado.
 *
 * CUESTA HASTA DOS LECTURAS, y cero cuando el gesto no puede romper nada:
 *  - un reordenamiento dentro de la celda (mismo día, misma cuadrilla) no lee la obra;
 *  - un cambio de estado, fracción, nota o fijación no llega acá (lo filtra la ruta).
 * Primero las filas tocadas (para saber de qué obra y qué día son) y después todas las
 * de esas obras en esos días.
 */
export async function validarRoles(cambios: CambiosDeRol): Promise<ConflictoApoyo[]> {
  const idsTocados = [
    ...(cambios.mover ?? []).map((m) => m.id),
    ...(cambios.actualizar?.ids ?? []),
    ...(cambios.roles ?? []).map((r) => r.id),
    ...(cambios.borrar ?? []),
  ];
  const tocadas =
    idsTocados.length > 0
      ? (await read<OdooRolRow>("x_aba_asignacion", [...new Set(idsTocados)], CAMPOS_ROL)).map(filaRol)
      : [];

  // Mover sin cambiar de día ni de cuadrilla es reordenar la pila: no toca roles.
  if (cambios.mover && !cambios.crear && !cambios.actualizar && !cambios.roles && !cambios.borrar) {
    const porId = new Map(tocadas.map((t) => [t.id, t]));
    const cambiaAlgo = cambios.mover.some((m) => {
      const t = porId.get(m.id);
      return !t || t.fecha !== m.fecha || (m.cuadrillaId !== undefined && m.cuadrillaId !== t.cuadrillaId);
    });
    if (!cambiaAlgo) return [];
  }

  const otIds = new Set<number>();
  const fechas = new Set<string>();
  for (const t of tocadas) {
    if (t.otId) otIds.add(t.otId);
    if (t.fecha) fechas.add(t.fecha);
  }
  for (const c of cambios.crear ?? []) {
    otIds.add(c.otId);
    fechas.add(c.fecha);
  }
  for (const m of cambios.mover ?? []) fechas.add(m.fecha);
  if (cambios.actualizar?.cambio.fecha) fechas.add(cambios.actualizar.cambio.fecha);
  if (otIds.size === 0 || fechas.size === 0) return [];

  const vecinas = await searchRead<OdooRolRow>(
    "x_aba_asignacion",
    [
      ["x_ot_id", "in", [...otIds]],
      ["x_fecha", "in", [...fechas]],
    ],
    CAMPOS_ROL,
  );
  // Las tocadas van por si alguna quedó fuera del dominio (sin OT o sin fecha): su estado
  // de antes tiene que estar para poder compararlo con el de después.
  const antes = new Map<number, FilaRol>();
  for (const v of vecinas) antes.set(v.id, filaRol(v));
  for (const t of tocadas) antes.set(t.id, t);
  const lista = [...antes.values()];
  const { despues, claves } = estadoDespues(lista, cambios);
  return conflictosDeApoyo(lista, despues, claves);
}

/** Mueve un bloque multi-jornada: cada id a su nueva fecha (un write por fecha distinta). */
export async function moverAsignaciones(movimientos: MovimientoAsignacion[]): Promise<void> {
  for (const m of movimientos) {
    const values: Record<string, unknown> = { x_fecha: m.fecha };
    if (m.cuadrillaId !== undefined) values.x_cuadrilla_id = m.cuadrillaId ?? false;
    if (m.ordenDia !== undefined) values.x_orden_dia = m.ordenDia;
    await write("x_aba_asignacion", [m.id], values);
  }
}

/**
 * Correr un día: mueve muchas jornadas de una, AGRUPADAS POR FECHA DESTINO.
 *
 * moverAsignaciones escribe de a una porque cada jornada de un bloque va a un día
 * distinto. Acá no: un corrimiento manda muchas jornadas al MISMO día, y Odoo acepta
 * write(ids[], values). La cuenta cambia de "una escritura por jornada" a "una por fecha
 * destino" — treinta y cuatro jornadas de una semana pasan de 34 escrituras a 7.
 *
 * IMPORTA MÁS DE LO QUE PARECE: cada write que llega a la asignación dispara la cascada de
 * calculados que sube hasta la obra, cerca de un segundo cada uno. 34 segundos de una
 * request es un timeout; 7 es una espera.
 *
 * NO TOCA CUADRILLA NI ORDEN. Correr el día cambia CUÁNDO y nada más: el apilado dentro
 * del día es el orden previsto de las obras, y reordenarlo sería inventar información.
 *
 * EN SERIE Y NO EN PARALELO: Odoo Online limita la concurrencia, y siete requests juntas
 * se encolan igual pero con más chance de que una rebote.
 *
 * Devuelve cuántas escrituras hizo, para poder medirlo en producción.
 */
export async function correrAsignaciones(movimientos: MovimientoAsignacion[]): Promise<number> {
  const porFecha = new Map<string, number[]>();
  for (const m of movimientos) {
    const ya = porFecha.get(m.fecha);
    if (ya) ya.push(m.id);
    else porFecha.set(m.fecha, [m.id]);
  }
  for (const [fecha, ids] of porFecha) {
    await write("x_aba_asignacion", ids, { x_fecha: fecha });
  }
  return porFecha.size;
}

/**
 * Las que un corrimiento NO puede tocar: fijadas a mano o con parte ya cargado.
 *
 * ES LA ÚNICA GUARDA QUE NO PUEDE VIVIR EN EL CLIENTE. Todo lo demás del corrimiento se
 * calcula en el tablero y se manda hecho —el "antes" de los registros, las fechas
 * destino—, igual que en el resto del módulo, porque releerlo de Odoo le sumaría segundos
 * al gesto. Pero esto es la invariante entera de la función: si el tablero de quien
 * corre el día tiene treinta segundos de atraso y alguien fijó una obra en el medio, la
 * obra fija se movería igual y nadie se enteraría. Cuesta una lectura.
 */
export async function asignacionesNoMovibles(
  ids: number[],
): Promise<{ id: number; motivo: string }[]> {
  if (ids.length === 0) return [];
  const filas = await read<{ id: number; x_motivo_fija: string | false; x_parte_id: M2O }>(
    "x_aba_asignacion",
    ids,
    ["x_motivo_fija", "x_parte_id"],
  );
  return filas
    .filter((f) => f.x_motivo_fija || m2oId(f.x_parte_id) !== null)
    .map((f) => ({
      id: f.id,
      motivo: str(f.x_motivo_fija) ?? "ya tiene el parte cargado",
    }));
}

/**
 * Las que un corrimiento NO puede borrar como "apoyo quitado" (apoyo.md, etapa 3): las que
 * no son apoyo, o que ya están en un parte. Misma razón que asignacionesNoMovibles: el
 * plan llega hecho del tablero, pero borrar una principal o un día con parte por un
 * tablero con atraso no tiene vuelta. Una lectura, y sólo si el corrimiento quita algo.
 */
export async function apoyosNoBorrables(ids: number[]): Promise<{ id: number; motivo: string }[]> {
  if (ids.length === 0) return [];
  const filas = await read<{ id: number; x_apoyo: boolean; x_parte_id: M2O }>(
    "x_aba_asignacion",
    ids,
    ["x_apoyo", "x_parte_id"],
  );
  const vistas = new Set(filas.map((f) => f.id));
  return [
    ...ids.filter((id) => !vistas.has(id)).map((id) => ({ id, motivo: "ya no existe" })),
    ...filas
      .filter((f) => f.x_apoyo !== true || m2oId(f.x_parte_id) !== null)
      .map((f) => ({
        id: f.id,
        motivo: f.x_apoyo !== true ? "ya no es un apoyo" : "ya está en un parte",
      })),
  ];
}

// ── Lo que el candado de las guardias necesita leer ─────────────────────────

/** Dónde está cada jornada hoy en Odoo: lo que el candado mira para saber qué celda pisa. */
export type CeldaAsignacion = {
  id: number;
  otId: number | null;
  fecha: string | null;
  cuadrillaId: number | null;
  apoyo: boolean;
  parteId: number | null;
};

/**
 * La celda actual de cada asignación (obra, día, cuadrilla, rol). Las que ya no existen no
 * vuelven: quien llama decide qué hacer con la falta.
 *
 * LA USA EL CANDADO DE LAS GUARDIAS (src/lib/planificacion/candado-guardias.ts) para las
 * escrituras que no traen la celda entera: un PATCH que cambia sólo la fecha o sólo la
 * cuadrilla, un mover sin cuadrilla, una reprogramación. Es la misma lectura que ya hace
 * validarRoles, de a lote y sólo de los ids tocados.
 */
export async function celdasDeAsignaciones(ids: number[]): Promise<CeldaAsignacion[]> {
  const unicos = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (unicos.length === 0) return [];
  const filas = await read<{ id: number; x_ot_id: M2O; x_fecha: string | false; x_cuadrilla_id: M2O; x_apoyo: boolean; x_parte_id: M2O }>(
    "x_aba_asignacion",
    unicos,
    ["x_ot_id", "x_fecha", "x_cuadrilla_id", "x_apoyo", "x_parte_id"],
  );
  return filas.map((f) => ({
    id: f.id,
    otId: m2oId(f.x_ot_id),
    fecha: str(f.x_fecha),
    cuadrillaId: m2oId(f.x_cuadrilla_id),
    apoyo: f.x_apoyo === true,
    parteId: m2oId(f.x_parte_id),
  }));
}

/**
 * Lo que hay HOY en Odoo en estas celdas (cuadrilla y día exactos). Para saber si la celda
 * de una guardia quedó totalmente libre antes de reactivarla (deshacer un uso, una obra que
 * se fue): una sola consulta por las fechas y cuadrillas, y el cruce exacto acá.
 */
export async function asignacionesEnCeldas(
  celdas: readonly { cuadrillaId: number; fecha: string }[],
): Promise<CeldaAsignacion[]> {
  if (celdas.length === 0) return [];
  const claves = new Set(celdas.map((c) => `${c.cuadrillaId}|${c.fecha}`));
  const filas = await searchRead<{ id: number; x_ot_id: M2O; x_fecha: string | false; x_cuadrilla_id: M2O; x_apoyo: boolean; x_parte_id: M2O }>(
    "x_aba_asignacion",
    [
      ["x_fecha", "in", [...new Set(celdas.map((c) => c.fecha))]],
      ["x_cuadrilla_id", "in", [...new Set(celdas.map((c) => c.cuadrillaId))]],
    ],
    ["x_ot_id", "x_fecha", "x_cuadrilla_id", "x_apoyo", "x_parte_id"],
  );
  return filas
    .map((f) => ({
      id: f.id,
      otId: m2oId(f.x_ot_id),
      fecha: str(f.x_fecha),
      cuadrillaId: m2oId(f.x_cuadrilla_id),
      apoyo: f.x_apoyo === true,
      parteId: m2oId(f.x_parte_id),
    }))
    .filter((f) => claves.has(`${f.cuadrillaId}|${f.fecha}`));
}

/**
 * Las cuadrillas activas y las asignaciones de un rango, y nada más. Es lo que necesitan las
 * reglas de LUGAR de las guardias (¿la celda está libre?, ¿queda en medio de una obra?): la
 * corrida del viernes y "correr la guardia" no miran OTs, partes ni avance, que son la parte
 * cara de fetchTablero (las ~52 OTs candidatas y el avance de todas).
 */
export async function fetchGrillaLiviana(desde: string, hasta: string): Promise<{
  cuadrillas: { id: number; nombre: string; tercerizada: boolean }[];
  asignaciones: AsignacionTablero[];
}> {
  await authenticate();
  const [cuadrillasRaw, asigsRaw] = await Promise.all([
    searchRead<{ id: number; x_name: string | false; x_tercerizada: boolean }>(
      "x_aba_cuadrilla", [["x_activa", "=", true]], ["id", "x_name", "x_tercerizada"], { order: "x_name" },
    ),
    searchRead<OdooAsigRow>(
      "x_aba_asignacion",
      [["x_fecha", ">=", desde], ["x_fecha", "<=", hasta]],
      ASIG_FIELDS,
      { order: "x_fecha, x_orden_dia, id" },
    ),
  ]);
  return {
    cuadrillas: cuadrillasRaw.map((c) => ({ id: c.id, nombre: str(c.x_name) ?? `Cuadrilla #${c.id}`, tercerizada: c.x_tercerizada === true })),
    asignaciones: asigsRaw.map(mapAsig),
  };
}

/**
 * Algunas OTs, con el mismo mapeo que el tablero (mapOt): el candado de las guardias necesita
 * tipo, estado, urgencia, creación, piso y duración, y marcar un comodín mira el estado. Sin
 * la URL de la acción (no la necesita nadie que llame a esto) ni el dato de SyH.
 */
export async function leerOts(otIds: number[]): Promise<OtTablero[]> {
  const unicos = [...new Set(otIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (unicos.length === 0) return [];
  const filas = await read<OdooOtRow>("x_aba_orden_trabajo", unicos, OT_FIELDS);
  const base = process.env.ODOO_URL ?? "";
  return filas.map((f) => mapOt(f, base, null, new Set()));
}

/**
 * El avance de unas pocas OTs (días tomados y días hechos, sin apoyos), con la misma regla
 * que consultasDeAvance pero filtrado por OT: el candado lo pide para UNA obra ("¿este armado
 * ya se pasó de lo estimado?") y traer el avance de todas sería pagar la consulta entera.
 */
export async function avanceDeOts(otIds: number[]): Promise<Map<number, ProgresoOt>> {
  const unicos = [...new Set(otIds)].filter((id) => Number.isInteger(id) && id > 0);
  const salida = new Map<number, ProgresoOt>();
  if (unicos.length === 0) return salida;
  const porOt = (dominio: unknown[]) =>
    executeKw<{ x_ot_id: M2O; "x_fecha:day"?: string | false; __range?: { "x_fecha:day"?: { from?: string } } }[]>(
      "x_aba_asignacion", "read_group", [[["x_ot_id", "in", unicos], ...dominio], ["x_ot_id"], ["x_ot_id", "x_fecha:day"]], { lazy: false },
    ).then((grupos) =>
      diasPorOt(
        grupos.map((g) => ({
          otId: m2oId(g.x_ot_id),
          fecha: g.__range?.["x_fecha:day"]?.from?.slice(0, 10) ?? str(g["x_fecha:day"] ?? false),
        })),
      ),
    );
  const [tomadas, hechas] = await Promise.all([porOt(DOM_TOMADAS), porOt(DOM_HECHAS)]);
  for (const otId of unicos) {
    salida.set(otId, { otId, asignadas: tomadas.get(otId) ?? 0, cerradas: hechas.get(otId) ?? 0 });
  }
  return salida;
}

export async function borrarAsignaciones(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await executeKw("x_aba_asignacion", "unlink", [ids]);
}

// ── Reflejo del plan en la orden de trabajo ──────────────────────────────────
//
// EL PROBLEMA: Comercial atiende el teléfono, el cliente pregunta "¿cuándo vienen?" y la
// respuesta está en el tablero, no en Odoo. La OT tiene x_fecha_programada pero nadie la
// mantenía: quedaba con lo que se hubiera tipeado al crear la OT, aunque el plan dijera
// otra cosa.
//
// Ahora el tablero la escribe con el primer día PENDIENTE, y x_fecha_firmeza dice cuánto
// se puede confiar en ella. Se escribe siempre, no sólo al confirmar: atar el dato al
// gesto de confirmar lo dejaba vacío en la práctica (al decidirlo había 25 asignaciones
// en Odoo y cero confirmadas). Una fecha tentativa etiquetada vale más que ningún dato.

/** OTs a las que pertenecen esas asignaciones. Hay que leerlo ANTES de borrarlas. */
export async function otsDeAsignaciones(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const filas = await read<{ id: number; x_ot_id: M2O }>("x_aba_asignacion", ids, ["x_ot_id"]);
  return [...new Set(filas.map((f) => m2oId(f.x_ot_id)).filter((id): id is number => id !== null))];
}

/**
 * Refleja el plan en la OT: primer día sin parte + qué tan firme es.
 *
 * "Primer día PENDIENTE" y no el inicio de la obra: si lleva 3 jornadas hechas de 8, lo
 * que el cliente pregunta es cuándo siguen. Así el campo se corrige solo a medida que la
 * obra avanza.
 *
 * NO ES DESTRUCTIVO. Al medirlo, 22 de las 48 OTs activas tenían fecha cargada a mano en
 * Odoo. El tablero pisa esa fecha cuando hay un plan —el plan sabe mejor qué día va la
 * cuadrilla— pero si la obra se desplanifica sólo limpia lo que él mismo escribió, que es
 * justo lo que delata x_fecha_firmeza: si está vacía, la fecha la puso una persona y no
 * se toca.
 */
export async function sincronizarFechaProgramada(otIds: number[]): Promise<void> {
  const ids = [...new Set(otIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return;

  const [pendientes, ots] = await Promise.all([
    searchRead<{ x_ot_id: M2O; x_fecha: string | false; x_estado: string | false }>(
      "x_aba_asignacion",
      // Sin apoyos: la fecha y su firmeza son de la obra, y un apoyo tentativo sumado a un
      // día ya confirmado no vuelve tentativa la fecha que se le prometió al cliente.
      [["x_ot_id", "in", ids], ["x_parte_id", "=", false], SIN_APOYOS],
      ["x_ot_id", "x_fecha", "x_estado"],
      { order: "x_fecha" },
    ),
    read<{ id: number; x_fecha_programada: string | false; x_fecha_firmeza: string | false }>(
      "x_aba_orden_trabajo",
      ids,
      ["x_fecha_programada", "x_fecha_firmeza"],
    ),
  ]);

  const primeraPorOt = new Map<number, { fecha: string; confirmada: boolean }>();
  for (const a of pendientes) {
    const otId = m2oId(a.x_ot_id);
    const fecha = str(a.x_fecha);
    if (!otId || !fecha) continue;
    const actual = primeraPorOt.get(otId);
    if (!actual || fecha < actual.fecha) {
      primeraPorOt.set(otId, { fecha, confirmada: a.x_estado === "confirmada" });
    } else if (fecha === actual.fecha && a.x_estado !== "confirmada") {
      // Varias asignaciones el mismo día: alcanza con que una sea tentativa para que la
      // fecha no se pueda prometer.
      primeraPorOt.set(otId, { ...actual, confirmada: false });
    }
  }

  await Promise.all(
    ots.map(async (ot) => {
      const plan = primeraPorOt.get(ot.id);
      const fechaActual = ot.x_fecha_programada || false;
      const firmezaActual = ot.x_fecha_firmeza || false;

      // Sin plan: sólo se limpia si la fecha la había escrito el tablero.
      if (!plan) {
        if (!firmezaActual) return;
        await write("x_aba_orden_trabajo", [ot.id], {
          x_fecha_programada: false,
          x_fecha_firmeza: false,
        });
        return;
      }

      const firmeza = plan.confirmada ? "confirmada" : "tentativa";
      // Sin cambio no se escribe: cada write dispara el webhook de espejado de la OT.
      if (fechaActual === plan.fecha && firmezaActual === firmeza) return;
      await write("x_aba_orden_trabajo", [ot.id], {
        x_fecha_programada: plan.fecha,
        x_fecha_firmeza: firmeza,
      });
    }),
  );
}

// ── Contactos de la obra ─────────────────────────────────────────────────────
//
// Cuelgan de la ORDEN DE VENTA y no de la OT: el armado, el desarme y la ampliación son
// la misma obra y la misma gente, así que una OT nueva los tiene por definición. Sin esto
// cada OT arrancaba de cero — medido el 26/09, de las 8 órdenes con más de una OT, CINCO
// tenían un contacto distinto en cada una.

const CONTACTO = "x_aba_contacto_obra";

/** Agrega una persona a la obra. Devuelve el id creado. */
export async function crearContactoObra(datos: {
  ventaId: number;
  nombre: string;
  rol?: string | null;
  telefono?: string | null;
  email?: string | null;
}): Promise<number> {
  return executeKw<number>(CONTACTO, "create", [{
    x_order_id: datos.ventaId,
    x_name: datos.nombre,
    x_rol: datos.rol || false,
    x_telefono: datos.telefono || false,
    x_email: datos.email || false,
  }]);
}

/**
 * Saca una persona de la obra.
 *
 * Se borra de verdad y no se archiva: es una lista de teléfonos, no un registro contable.
 * Quien se equivocó al cargarlo quiere que desaparezca, y un contacto "inactivo" que
 * sigue apareciendo en algún lado sería peor que no tenerlo.
 */
export async function borrarContactoObra(id: number): Promise<void> {
  await executeKw(CONTACTO, "unlink", [[id]]);
}
