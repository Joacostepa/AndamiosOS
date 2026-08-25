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
import type {
  AsignacionTablero,
  CambioAsignacion,
  DocumentoOt,
  MovimientoAsignacion,
  NuevaAsignacion,
  OtTablero,
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
  "x_doc_ids", "x_fecha_programada", "x_fecha_comprometida",
];

const ASIG_FIELDS = ["id", "x_ot_id", "x_fecha", "x_cuadrilla_id", "x_fraccion", "x_estado", "x_orden_dia", "x_notas", "x_parte_id"];

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
 */
const DOM_TOMADAS = ["|", ["x_parte_id", "=", false], ["x_parte_id.x_estado", "!=", "no_ejecutado"]];
const DOM_HECHAS = [["x_parte_id", "!=", false], ["x_parte_id.x_estado", "!=", "no_ejecutado"]];

/** Las dos consultas de avance, juntas para que el tablero y el listado no diverjan. */
export function consultasDeAvance() {
  const porOt = (dominio: unknown[]) =>
    executeKw<{ x_ot_id: M2O; __count: number }[]>(
      "x_aba_asignacion", "read_group", [dominio, ["x_ot_id"], ["x_ot_id"]], { lazy: false },
    );
  return [porOt(DOM_TOMADAS), porOt(DOM_HECHAS)] as const;
}

const DOMINIO_OTS_CANDIDATAS = [
  ["x_estado", "in", ["pendiente", "en_proceso"]],
  ["x_order_id.x_studio_tipo_de_contrato", "=", "Obra "],
];

function mapOt(row: OdooOtRow, base: string, actionId: number | null): OtTablero {
  // x_duracion_est es el dato fino (0.10…15) y manda cuando está cargado; si viene
  // vacío —el campo es nuevo y la mayoría de las OTs no lo tiene— cae a x_jornadas_num.
  const dur = Number(row.x_duracion_est);
  const jornadas = Number.isFinite(dur) && dur > 0 ? dur : num(row.x_jornadas_num) || 1;
  return {
    id: row.id,
    titulo: str(row.x_name) ?? `OT #${row.id}`,
    tipo: str(row.x_tipo) ?? "otro",
    estado: str(row.x_estado) ?? "pendiente",
    urgencia: str(row.x_urgencia) ?? "baja",
    motivoUrgencia: str(row.x_motivo_urgencia),
    jornadas,
    personalPorJornada: num(row.x_personal_por_jornada),
    cuadrillaPrevistaId: m2oId(row.x_cuadrilla_prevista_id),
    habSemaforo: str(row.x_hab_semaforo) ?? "gris",
    habAlerta: str(row.x_hab_alerta),
    habVencimiento: str(row.x_hab_vencimiento),
    tecnico: str(row.x_tecnico),
    contactoObra: str(row.x_contacto_obra),
    telObra: str(row.x_tel_obra),
    observaciones: str(row.x_observaciones),
    diasObra: num(row.x_dias_obra),
    horasHombre: num(row.x_horas_hombre),
    cantDocs: num(row.x_cant_docs),
    docIds: Array.isArray(row.x_doc_ids) ? row.x_doc_ids : [],
    ordenVenta: m2oName(row.x_order_id),
    fechaProgramada: str(row.x_fecha_programada),
    fechaComprometida: str(row.x_fecha_comprometida),
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
  };
}

/** Trae todo lo que el tablero necesita para el rango [desde, hasta] en una sola pasada. */
export async function fetchTablero(desde: string, hasta: string): Promise<TableroPayload> {
  const base = process.env.ODOO_URL ?? "";
  // Se resuelve el login ANTES del lote: si no, las lecturas en paralelo arrancan todas
  // pidiendo autenticación y Odoo las limita (ver la cola en client.ts).
  await authenticate();
  const actionId = await otActionId();

  const [cuadrillasRaw, asigsRaw, otsCandidatas, partesRaw, gruposAsignadas, gruposCerradas] = await Promise.all([
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

  return {
    cuadrillas: cuadrillasRaw.map((c) => ({
      id: c.id,
      nombre: str(c.x_name) ?? `Cuadrilla #${c.id}`,
      tercerizada: c.x_tercerizada === true,
    })),
    asignaciones,
    ots: [...otsCandidatas, ...otsExtra].map((o) => mapOt(o, base, actionId)),
    partes: partesRaw.map((p) => ({
      id: p.id,
      otId: m2oId(p.x_orden_trabajo_id) ?? 0,
      fecha: str(p.x_fecha) ?? "",
      cuadrillaId: m2oId(p.x_cuadrilla_id),
      estado: str(p.x_estado) ?? "previsto",
      motivoNoEjec: str(p.x_motivo_no_ejec),
    })),
    progreso: (() => {
      const cerradasPorOt = new Map(
        gruposCerradas.map((g) => [m2oId(g.x_ot_id) ?? 0, g.__count]),
      );
      return gruposAsignadas
        .map((g) => {
          const otId = m2oId(g.x_ot_id) ?? 0;
          return { otId, asignadas: g.__count, cerradas: cerradasPorOt.get(otId) ?? 0 };
        })
        .filter((p) => p.otId);
    })(),
  };
}

/** Adjuntos de una OT, para la vista previa del panel lateral. */
export async function fetchDocumentosOt(otId: number): Promise<DocumentoOt[]> {
  const base = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  const [ot] = await read<{ x_doc_ids: number[] | false }>("x_aba_orden_trabajo", [otId], ["x_doc_ids"]);
  const ids = Array.isArray(ot?.x_doc_ids) ? ot.x_doc_ids : [];
  if (ids.length === 0) return [];

  const adjuntos = await read<{ id: number; name: string | false; mimetype: string | false }>(
    "ir.attachment",
    ids,
    ["name", "mimetype"],
  );
  return adjuntos.map((a) => ({
    id: a.id,
    nombre: str(a.name) ?? `Adjunto #${a.id}`,
    mimetype: str(a.mimetype) ?? "",
    // /web/content sirve el archivo con la sesión de Odoo del usuario en el browser.
    url: `${base}/web/content/${a.id}?download=false`,
  }));
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
  const rows = await read<{ id: number; x_name: string | false }>("x_aba_orden_trabajo", otIds, ["x_name"]);
  for (const r of rows) titulos.set(r.id, str(r.x_name) ?? `OT #${r.id}`);

  const ids = await executeKw<number | number[]>("x_aba_asignacion", "create", [
    nuevas.map((n) => valoresAsignacion(n, titulos.get(n.otId) ?? `OT #${n.otId}`)),
  ]);
  return Array.isArray(ids) ? ids : [ids];
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
  if (Object.keys(values).length === 0) return;
  await write("x_aba_asignacion", ids, values);
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
      [["x_ot_id", "in", ids], ["x_parte_id", "=", false]],
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
