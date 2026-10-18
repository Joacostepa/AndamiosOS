// Guardias del tablero, del lado del servidor: leerlas, ponerlas, usarlas, correrlas,
// sacarlas, los pedidos a JS y los avisos. SÓLO SERVIDOR (usa la service role y Odoo).
//
// Contrato: docs/tablero-planificacion/guardias-contrato.md (manda). Plan técnico:
// guardias-plan-tecnico.md §2–§6. Las REGLAS (dónde van, qué deja el candado, qué es un
// comodín) no están acá: están en src/lib/tablero/guardias.ts y comodines.ts, que son puras
// y las usa también el tablero. Este archivo junta los datos, llama a la regla y escribe.
//
// QUIÉN ESCRIBE QUÉ, y por qué con dos clientes distintos:
//   · las guardias, su historia (plan_guardia_eventos) y los pedidos (plan_guardia_solicitudes)
//     se escriben con la SERVICE ROLE y SIEMPRE DESPUÉS de validar: la migración deja a
//     `authenticated` sin escribirlas (políticas RESTRICTIVE), justamente para que el candado
//     no se pueda saltear desde el navegador. La regla la aplica este archivo, no la RLS;
//   · plan_movimientos (el historial del tablero) se escribe con la SESIÓN de quien hizo el
//     gesto, como en /api/planificacion/asignaciones: el autor sale de auth.uid() y no hay
//     forma de firmarlo con otro nombre.
//
// LO QUE VA A ODOO SE AGRUPA EN UN LOTE: usar una guardia crea o mueve las jornadas de la
// obra y marca la guardia con el mismo `lote_id`; deshacer devuelve el lote entero o no
// devuelve nada (si la celda ya no está libre, 409 y no se toca nada).
//
// LOS ERRORES SON ErrorGuardia: llevan el status y el cuerpo listos para la ruta (409 con
// RechazoCandado cuando el candado frena, 409 cuando algo cambió en el medio, 400/404). Un
// error de Odoo sale como OdooError y la ruta lo contesta 502.

import { after, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearAlertas, type NuevaAlerta, type Prioridad, type TipoAlerta } from "@/lib/alertas/servicio";
import { feriadosDelRango } from "@/lib/feriados/argentina";
import { OdooError, read } from "@/lib/odoo/client";
import {
  asignacionesEnCeldas,
  avanceDeOts,
  borrarAsignaciones,
  celdasDeAsignaciones,
  crearAsignaciones,
  fetchGrillaLiviana,
  fetchTablero,
  leerOts,
  moverAsignaciones,
  sincronizarFechaProgramada,
  validarRoles,
  type CeldaAsignacion,
} from "@/lib/odoo/asignaciones";
import { jornadasPlanTodas } from "@/lib/planificacion/jornadas-plan";
import { suspensionesEnRango } from "@/lib/planificacion/suspensiones";
import { textoConflicto } from "@/lib/tablero/apoyo";
import { comodinDe, comodinPuedeIr } from "@/lib/tablero/comodines";
import { hoyBA, lunesDe, sumarDias } from "@/lib/tablero/dias-habiles";
import {
  claveCelda,
  destinoValidoGuardia,
  diaCorto,
  duracionParaCandado,
  evaluarCandado,
  otParaCandado,
  siglaCuadrilla,
  type GrillaGuardias,
} from "@/lib/tablero/guardias";
import {
  ESTADO_POR_USO,
  ETIQUETA_SOLICITUD,
  ETIQUETA_USO,
  type AccionGuardia,
  type DeshacerGuardado,
  type DeshacerUsoGuardia,
  type EstadoGuardia,
  type EstadoSolicitud,
  type EventoGuardia,
  type Guardia,
  type GuardiaAPoner,
  type GuardiaResumen,
  type GuardiasPayload,
  type MoverGuardia,
  type NuevaSolicitud,
  type PedidoUsoGuardia,
  type RanuraGuardia,
  type RechazoCandado,
  type RespuestaSolicitud,
  type RespuestaUsoGuardia,
  type ResultadoAutorizacion,
  type ResultadoColocacion,
  type SacarGuardia,
  type SolicitudGuardia,
  type TipoSolicitud,
  type UsoGuardia,
} from "@/lib/tablero/guardias-tipos";
import { VALORES_FRACCION } from "@/lib/tablero/fracciones";
import { tareasEnRango } from "@/lib/tablero/tareas";
import type { MovimientoAsignacion, NuevaAsignacion, OtTablero, ProgresoOt } from "@/lib/tablero/tipos";

type DB = SupabaseClient;

/** Quién hace el gesto: su sesión (para plan_movimientos) y su id (para la historia). */
export type Sesion = { db: DB; userId: string };

/** Un error con su respuesta HTTP ya armada. Ver el encabezado. */
export class ErrorGuardia extends Error {
  readonly status: number;
  readonly cuerpo: { error: string } & Record<string, unknown>;
  constructor(status: number, cuerpo: { error: string } & Record<string, unknown>) {
    super(cuerpo.error);
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

const conflicto = (error: string, extra: Record<string, unknown> = {}) => new ErrorGuardia(409, { error, ...extra });

const TABLA = "tablero_tareas";
const EVENTOS = "plan_guardia_eventos";
const SOLICITUDES = "plan_guardia_solicitudes";

const COLUMNAS =
  "id, fecha, cuadrilla_odoo_id, guardia_semana, guardia_ranura, guardia_estado, guardia_origen, guardia_uso, " +
  "guardia_ot_id, guardia_asignacion_ids, guardia_por_que, guardia_lote_id, created_at, guardia_estado_por, " +
  "guardia_estado_at, guardia_estado_motivo, guardia_deshacer";

type FilaGuardia = {
  id: number;
  fecha: string;
  cuadrilla_odoo_id: number;
  guardia_semana: string;
  guardia_ranura: number;
  guardia_estado: EstadoGuardia;
  guardia_origen: "sistema" | "persona";
  guardia_uso: UsoGuardia | null;
  guardia_ot_id: number | null;
  guardia_asignacion_ids: (number | string)[] | null;
  guardia_por_que: string | null;
  guardia_lote_id: string | null;
  created_at: string;
  guardia_estado_por: string | null;
  guardia_estado_at: string | null;
  guardia_estado_motivo: string | null;
  /** Lo que deshace el uso (ver DeshacerGuardado). Sólo en usadas y rellenadas por /usar. */
  guardia_deshacer: DeshacerGuardado | null;
};

/** Los BIGINT pueden volver como texto del driver: se normalizan acá, en un solo lugar. */
function normalizar(f: FilaGuardia): FilaGuardia {
  return {
    ...f,
    id: Number(f.id),
    cuadrilla_odoo_id: Number(f.cuadrilla_odoo_id),
    guardia_ranura: Number(f.guardia_ranura),
    guardia_ot_id: f.guardia_ot_id == null ? null : Number(f.guardia_ot_id),
    guardia_asignacion_ids: (f.guardia_asignacion_ids ?? []).map(Number),
  };
}

function aResumen(f: FilaGuardia): GuardiaResumen {
  return {
    id: f.id,
    fecha: f.fecha,
    cuadrillaId: f.cuadrilla_odoo_id,
    semana: f.guardia_semana,
    ranura: f.guardia_ranura as RanuraGuardia,
    estado: f.guardia_estado,
  };
}

function aGuardia(f: FilaGuardia, nombres: ReadonlyMap<string, string>): Guardia {
  return {
    ...aResumen(f),
    origen: f.guardia_origen,
    uso: f.guardia_uso,
    otId: f.guardia_ot_id,
    asignacionIds: (f.guardia_asignacion_ids ?? []).map(Number),
    porQue: f.guardia_por_que,
    loteId: f.guardia_lote_id,
    creadaAt: f.created_at,
    estadoAt: f.guardia_estado_at,
    estadoPorNombre: f.guardia_estado_por ? (nombres.get(f.guardia_estado_por) ?? null) : null,
    estadoMotivo: f.guardia_estado_motivo,
  };
}

/** Los nombres de unas personas, para la historia. Sin nombre, el id no se muestra. */
async function nombresDe(db: DB, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await db.from("user_profiles").select("id, nombre").in("id", unicos);
  if (error) {
    console.error("[guardias] no se pudieron leer los nombres", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.id as string, (p.nombre as string) ?? ""]));
}

async function guardiasPorIds(db: DB, ids: number[]): Promise<FilaGuardia[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from(TABLA).select(COLUMNAS).eq("tipo", "guardia").in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaGuardia[]).map(normalizar);
}

/** El grupo_id que se guarda (ver ponerGuardias). Negativo para no chocar con ningún id real. */
function grupoDeGuardia(semana: string, ranura: number): number {
  return -(Number(semana.replaceAll("-", "")) * 10 + ranura);
}

const esDuplicado = (e: { code?: string } | null) => e?.code === "23505";

// ─── La historia ───────────────────────────────────────────────────────────────────────

type NuevoEvento = {
  guardiaId: number;
  accion: AccionGuardia;
  estadoAntes?: EstadoGuardia | null;
  estadoDespues?: EstadoGuardia | null;
  uso?: UsoGuardia | null;
  otId?: number | null;
  otTitulo?: string | null;
  de?: { fecha: string; cuadrillaId: number } | null;
  a?: { fecha: string; cuadrillaId: number } | null;
  motivo?: string | null;
  loteId?: string | null;
  solicitudId?: string | null;
  /** null = el sistema. */
  autorId: string | null;
};

/**
 * Anota en la historia. NO TIRA: cuando se llama, la guardia (y Odoo) ya cambiaron, que es lo
 * que la persona pidió. Perder una línea de historia se loguea; voltear un uso que ya está
 * escrito en Odoo dejaría las dos bases diciendo cosas distintas.
 */
async function anotar(adm: DB, eventos: NuevoEvento[]): Promise<void> {
  if (eventos.length === 0) return;
  const { error } = await adm.from(EVENTOS).insert(
    eventos.map((e) => ({
      guardia_id: e.guardiaId,
      accion: e.accion,
      estado_antes: e.estadoAntes ?? null,
      estado_despues: e.estadoDespues ?? null,
      uso: e.uso ?? null,
      ot_id: e.otId ?? null,
      ot_titulo: e.otTitulo ?? null,
      de_fecha: e.de?.fecha ?? null,
      de_cuadrilla: e.de?.cuadrillaId ?? null,
      a_fecha: e.a?.fecha ?? null,
      a_cuadrilla: e.a?.cuadrillaId ?? null,
      motivo: e.motivo ?? null,
      lote_id: e.loteId ?? null,
      solicitud_id: e.solicitudId ?? null,
      autor_id: e.autorId,
    })),
  );
  if (error) console.error("[guardias] no se pudo anotar la historia", error.message);
}

// ─── Leer ──────────────────────────────────────────────────────────────────────────────

type FilaEvento = {
  id: string;
  guardia_id: number;
  accion: AccionGuardia;
  estado_antes: EstadoGuardia | null;
  estado_despues: EstadoGuardia | null;
  uso: UsoGuardia | null;
  ot_id: number | null;
  ot_titulo: string | null;
  de_fecha: string | null;
  de_cuadrilla: number | null;
  a_fecha: string | null;
  a_cuadrilla: number | null;
  motivo: string | null;
  lote_id: string | null;
  solicitud_id: string | null;
  autor_id: string | null;
  created_at: string;
};

type FilaSolicitud = {
  id: string;
  guardia_id: number;
  tipo: TipoSolicitud;
  ot_id: number | null;
  ot_titulo: string | null;
  motivo: string;
  pedido: PedidoUsoGuardia | null;
  estado: EstadoSolicitud;
  pedido_por: string;
  pedido_at: string;
  respondido_por: string | null;
  respondido_at: string | null;
  respuesta: string | null;
  ejecutada_at: string | null;
  error_ejecucion: string | null;
};

const COLUMNAS_SOLICITUD =
  "id, guardia_id, tipo, ot_id, ot_titulo, motivo, pedido, estado, pedido_por, pedido_at, respondido_por, " +
  "respondido_at, respuesta, ejecutada_at, error_ejecucion";

function aEvento(f: FilaEvento, nombres: ReadonlyMap<string, string>): EventoGuardia {
  return {
    id: f.id,
    guardiaId: Number(f.guardia_id),
    accion: f.accion,
    estadoAntes: f.estado_antes,
    estadoDespues: f.estado_despues,
    uso: f.uso,
    otId: f.ot_id == null ? null : Number(f.ot_id),
    otTitulo: f.ot_titulo,
    de: f.de_fecha && f.de_cuadrilla != null ? { fecha: f.de_fecha, cuadrillaId: Number(f.de_cuadrilla) } : null,
    a: f.a_fecha && f.a_cuadrilla != null ? { fecha: f.a_fecha, cuadrillaId: Number(f.a_cuadrilla) } : null,
    motivo: f.motivo,
    loteId: f.lote_id,
    solicitudId: f.solicitud_id,
    autorNombre: f.autor_id ? (nombres.get(f.autor_id) ?? null) : null,
    at: f.created_at,
  };
}

function aSolicitud(
  f: FilaSolicitud,
  guardias: ReadonlyMap<number, FilaGuardia>,
  nombres: ReadonlyMap<string, string>,
  cuadrillas: ReadonlyMap<number, string>,
): SolicitudGuardia {
  const g = guardias.get(Number(f.guardia_id));
  return {
    id: f.id,
    guardiaId: Number(f.guardia_id),
    guardia: g
      ? {
          fecha: g.fecha,
          cuadrillaId: g.cuadrilla_odoo_id,
          cuadrillaNombre: cuadrillas.get(g.cuadrilla_odoo_id) ?? null,
          estado: g.guardia_estado,
        }
      : { fecha: "", cuadrillaId: 0, cuadrillaNombre: null, estado: "sacada" },
    tipo: f.tipo,
    otId: f.ot_id == null ? null : Number(f.ot_id),
    otTitulo: f.ot_titulo,
    motivo: f.motivo,
    pedido: f.pedido,
    estado: f.estado,
    pedidoPorId: f.pedido_por,
    pedidoPorNombre: nombres.get(f.pedido_por) ?? null,
    pedidoAt: f.pedido_at,
    respondidoPorNombre: f.respondido_por ? (nombres.get(f.respondido_por) ?? null) : null,
    respondidoAt: f.respondido_at,
    respuesta: f.respuesta,
    ejecutadaAt: f.ejecutada_at,
    errorEjecucion: f.error_ejecucion,
  };
}

/** Las solicitudes con su guardia y los nombres resueltos (personas y cuadrillas). */
async function conGuardiasYNombres(db: DB, filas: FilaSolicitud[], conocidas?: FilaGuardia[]): Promise<SolicitudGuardia[]> {
  const porId = new Map((conocidas ?? []).map((g) => [g.id, g]));
  const faltan = [...new Set(filas.map((f) => Number(f.guardia_id)))].filter((id) => !porId.has(id));
  for (const g of await guardiasPorIds(db, faltan)) porId.set(g.id, g);
  const [nombres, cuadrillas] = await Promise.all([
    nombresDe(db, filas.flatMap((f) => [f.pedido_por, f.respondido_por])),
    nombresDeCuadrillas(filas.map((f) => porId.get(Number(f.guardia_id))?.cuadrilla_odoo_id)),
  ]);
  return filas.map((f) => aSolicitud(f, porId, nombres, cuadrillas));
}

/**
 * El nombre de Odoo de unas cuadrillas ("CUADRILLA 3"). NO TIRA: es para los textos, y un
 * pedido a JS sin el nombre de la cuadrilla se sigue pudiendo aprobar; con Odoo caído vuelve
 * un mapa vacío y quien lo muestra dice "cuadrilla".
 */
async function nombresDeCuadrillas(ids: readonly (number | null | undefined)[]): Promise<Map<number, string>> {
  const unicos = [...new Set(ids.filter((x): x is number => x != null && x > 0))];
  const mapa = new Map<number, string>();
  if (unicos.length === 0) return mapa;
  try {
    const filas = await read<{ id: number; x_name: string | false }>("x_aba_cuadrilla", unicos, ["x_name"]);
    for (const f of filas) mapa.set(f.id, f.x_name || "");
  } catch (e) {
    console.error("[guardias] no se pudieron leer los nombres de las cuadrillas", e);
  }
  return mapa;
}

/**
 * GET /api/planificacion/guardias: las guardias del rango en TODOS los estados, su historia y
 * sus pedidos. Con la sesión de quien mira (la RLS de la historia y los pedidos pide ver la
 * planificación).
 */
export async function leerGuardias(db: DB, desde: string, hasta: string): Promise<GuardiasPayload> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .eq("tipo", "guardia")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("cuadrilla_odoo_id");
  if (error) throw new Error(error.message);
  const filas = ((data ?? []) as unknown as FilaGuardia[]).map(normalizar);
  if (filas.length === 0) return { guardias: [], eventos: [], solicitudes: [] };
  const ids = filas.map((f) => f.id);

  const [ev, sol] = await Promise.all([
    db.from(EVENTOS).select("*").in("guardia_id", ids).order("created_at", { ascending: false }),
    db.from(SOLICITUDES).select(COLUMNAS_SOLICITUD).in("guardia_id", ids).order("pedido_at", { ascending: false }),
  ]);
  if (ev.error) throw new Error(ev.error.message);
  if (sol.error) throw new Error(sol.error.message);
  const eventos = (ev.data ?? []) as FilaEvento[];
  const solicitudes = (sol.data ?? []) as unknown as FilaSolicitud[];
  const porId = new Map(filas.map((f) => [f.id, f]));
  const [nombres, cuadrillas] = await Promise.all([
    nombresDe(db, [
      ...filas.map((f) => f.guardia_estado_por),
      ...eventos.map((e) => e.autor_id),
      ...solicitudes.flatMap((s) => [s.pedido_por, s.respondido_por]),
    ]),
    // Odoo sólo si hay pedidos o sacadas: el tablero refresca esta lectura seguido y ya tiene
    // los nombres de las cuadrillas en su payload. Las sacadas los necesitan porque la
    // bandeja de JS las lista sin tablero.
    nombresDeCuadrillas([
      ...solicitudes.map((s) => porId.get(Number(s.guardia_id))?.cuadrilla_odoo_id),
      ...filas.filter((f) => f.guardia_estado === "sacada").map((f) => f.cuadrilla_odoo_id),
    ]),
  ]);
  return {
    guardias: filas.map((f) => {
      const g = aGuardia(f, nombres);
      return f.guardia_estado === "sacada" ? { ...g, cuadrillaNombre: cuadrillas.get(f.cuadrilla_odoo_id) ?? null } : g;
    }),
    eventos: eventos.map((e) => aEvento(e, nombres)),
    solicitudes: solicitudes.map((s) => aSolicitud(s, porId, nombres, cuadrillas)),
  };
}

/** Las guardias ACTIVAS que caen exactamente en estas celdas, de `desdeFecha` en adelante. */
export async function activasEnCeldas(
  db: DB,
  celdas: readonly { cuadrillaId: number; fecha: string }[],
  desdeFecha: string,
): Promise<GuardiaResumen[]> {
  const utiles = celdas.filter((c) => c.fecha >= desdeFecha);
  if (utiles.length === 0) return [];
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .eq("tipo", "guardia")
    .eq("guardia_estado", "activa")
    .in("fecha", [...new Set(utiles.map((c) => c.fecha))])
    .in("cuadrilla_odoo_id", [...new Set(utiles.map((c) => c.cuadrillaId))]);
  if (error) throw new Error(error.message);
  const claves = new Set(utiles.map((c) => claveCelda(c.cuadrillaId, c.fecha)));
  return ((data ?? []) as unknown as FilaGuardia[])
    .map(normalizar)
    .filter((f) => claves.has(claveCelda(f.cuadrilla_odoo_id, f.fecha)))
    .map(aResumen);
}

/** Las guardias de unas semanas (cualquier estado), por su lunes. */
export async function guardiasDeSemanas(db: DB, semanas: string[]): Promise<GuardiaResumen[]> {
  if (semanas.length === 0) return [];
  const { data, error } = await db.from(TABLA).select(COLUMNAS).eq("tipo", "guardia").in("guardia_semana", semanas);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaGuardia[]).map(normalizar).map(aResumen);
}

/** Las guardias activas de un día (la corrida de las 13 h mira las de mañana). */
export async function activasDelDia(db: DB, fecha: string): Promise<GuardiaResumen[]> {
  const { data, error } = await db
    .from(TABLA)
    .select(COLUMNAS)
    .eq("tipo", "guardia")
    .eq("guardia_estado", "activa")
    .eq("fecha", fecha);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaGuardia[]).map(normalizar).map(aResumen);
}

/**
 * La grilla como la necesitan las reglas de lugar, en el rango pedido: cuadrillas y jornadas
 * de Odoo (lectura liviana), tareas y guardias activas de Supabase, días suspendidos,
 * feriados y hoy. Sin OTs ni avance: para eso, leerGrilla.
 */
export async function leerGrillaLiviana(adm: DB, desde: string, hasta: string): Promise<GrillaGuardias> {
  const [odoo, tareas, suspensiones, feriados] = await Promise.all([
    fetchGrillaLiviana(desde, hasta),
    tareasEnRango(adm, desde, hasta),
    suspensionesEnRango(adm, desde, hasta),
    feriadosDelRango(desde, hasta),
  ]);
  return {
    asignaciones: [...odoo.asignaciones, ...tareas],
    cuadrillas: odoo.cuadrillas,
    feriados: new Set(feriados.map((f) => f.fecha)),
    suspendidas: new Set(suspensiones.map((s) => claveCelda(s.cuadrillaId, s.fecha))),
    hoy: hoyBA(),
  };
}

/**
 * La grilla completa, con las OTs y su avance: la usa la corrida de las 13 h (candidatos para
 * rellenar: armados atrasados, comodines, tentativas). Lee con la service role: la corre un
 * cron, sin sesión.
 */
export async function leerGrilla(
  desde: string,
  hasta: string,
): Promise<GrillaGuardias & { ots: Map<number, OtTablero>; progreso: Map<number, ProgresoOt>; duracionDe: (ot: OtTablero) => number }> {
  const adm = createAdminClient();
  const [tablero, tareas, suspensiones, feriados, planes] = await Promise.all([
    fetchTablero(desde, hasta),
    tareasEnRango(adm, desde, hasta),
    suspensionesEnRango(adm, desde, hasta),
    feriadosDelRango(desde, hasta),
    jornadasPlanTodas(adm),
  ]);
  const plan = new Map(planes.map((p) => [p.otId, p.jornadas]));
  return {
    asignaciones: [...tablero.asignaciones, ...tareas],
    cuadrillas: tablero.cuadrillas,
    feriados: new Set(feriados.map((f) => f.fecha)),
    suspendidas: new Set(suspensiones.map((s) => claveCelda(s.cuadrillaId, s.fecha))),
    hoy: hoyBA(),
    ots: new Map(tablero.ots.map((o) => [o.id, o])),
    progreso: new Map(tablero.progreso.map((p) => [p.otId, p])),
    // La del CANDADO (la mayor entre Odoo y el plan), porque esta grilla la usa la corrida de
    // las 13 h para decir qué es comodín y qué armado está atrasado: lo mismo que decide si
    // se puede usar la guardia (duracionParaCandado).
    duracionDe: (ot) => duracionParaCandado(ot, plan.get(ot.id)),
  };
}

/** "C3" de cada cuadrilla, para los textos. Si Odoo no contesta, "cuadrilla #id": el texto sale igual. */
export async function siglasDe(cuadrillaIds: number[]): Promise<(id: number) => string> {
  const nombres = await nombresDeCuadrillas(cuadrillaIds);
  return (id) => {
    const nombre = nombres.get(id);
    return nombre != null ? siglaCuadrilla({ id, nombre }) : `cuadrilla #${id}`;
  };
}

// ─── Poner (la corrida del viernes) ────────────────────────────────────────────────────

/**
 * Escribe las guardias que decidió planearGuardiasSemana. Devuelve los ids que se crearon de
 * verdad y cuáles de las decididas eran (las que ya estaban no cuentan: el aviso dice lo que
 * se escribió, no lo que se quiso escribir).
 *
 * IDEMPOTENTE POR LA BASE: (guardia_semana, guardia_ranura) es único, así que correrla dos
 * veces —o dos corridas a la vez— no duplica nada. No se usa ON CONFLICT porque el índice es
 * PARCIAL (WHERE tipo = 'guardia') y PostgREST no sabe nombrar el predicado: se inserta de a
 * una y un 23505 es "ya estaba", que es exactamente lo que hace ON CONFLICT DO NOTHING. Lo
 * mismo si la celda ya tiene otra guardia activa (el otro índice único).
 *
 * EL grupo_id: la tabla lo pide NOT NULL y único por fecha. crearTarea lo resuelve con un 0
 * provisorio y un UPDATE, pero acá dos corridas en paralelo podrían chocar en ese 0 y el
 * choque se leería como "ya estaba". Va uno propio y fijo por semana y ranura, negativo para
 * no pisar ningún id real; el tablero igual agrupa cada guardia por su id (tareas.ts).
 */
export async function ponerGuardias(
  adm: DB,
  semana: string,
  resultado: ResultadoColocacion,
): Promise<{ creadas: number[]; puestas: GuardiaAPoner[] }> {
  const creadas: number[] = [];
  const puestas: GuardiaAPoner[] = [];
  for (const g of resultado.poner) {
    const { data, error } = await adm
      .from(TABLA)
      .insert({
        grupo_id: grupoDeGuardia(semana, g.ranura),
        titulo: "Guardia",
        tipo: "guardia",
        notas: null,
        cuadrilla_odoo_id: g.cuadrillaId,
        fecha: g.fecha,
        fraccion: 1,
        orden_dia: 0,
        hecha: false,
        autor_id: null,
        guardia_estado: "activa",
        guardia_origen: "sistema",
        guardia_semana: semana,
        guardia_ranura: g.ranura,
        guardia_por_que: g.porQue,
      })
      .select("id")
      .single();
    if (esDuplicado(error)) continue;
    if (error) throw new Error(error.message);
    const id = Number((data as { id: number }).id);
    creadas.push(id);
    puestas.push(g);
    await anotar(adm, [{
      guardiaId: id,
      accion: "poner",
      estadoDespues: "activa",
      a: { fecha: g.fecha, cuadrillaId: g.cuadrillaId },
      motivo: g.porQue,
      autorId: null,
    }]);
  }
  return { creadas, puestas };
}

// ─── Usar (una obra reemplaza a la guardia) ────────────────────────────────────────────

/** Una jornada del pedido, con la celda donde termina. */
type Destino = { indiceCrear: number | null; id: number | null; cuadrillaId: number | null; fecha: string; apoyo: boolean };

/** Resincroniza la fecha programada de la OT después de responder (como asignaciones). */
function sincronizarLuego(otIds: number[]): void {
  const tarea = async () => {
    try {
      await sincronizarFechaProgramada(otIds);
    } catch (e) {
      console.error("[guardias] no se pudo sincronizar la fecha de la OT", e);
    }
  };
  try {
    after(tarea);
  } catch {
    void tarea();
  }
}

/** Anota el gesto en plan_movimientos con la sesión (el autor sale de auth.uid()). No tira. */
async function anotarMovimiento(
  db: DB,
  pedido: PedidoUsoGuardia,
  asignacionIds: number[],
  loteId: string,
  uso: UsoGuardia,
): Promise<string | null> {
  if (!pedido.registro) return null;
  const r = pedido.registro;
  try {
    const { data, error } = await db
      .from("plan_movimientos")
      .insert({
        odoo_ot_id: r.otId,
        ot_titulo: r.otTitulo,
        accion: r.accion,
        asignacion_ids: asignacionIds,
        antes: r.antes,
        despues: r.despues,
        lote_id: loteId,
        motivo: `De guardia (${ETIQUETA_USO[uso]})`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[guardias] no se pudo registrar el movimiento", e);
    return null;
  }
}

/** Todo lo que hace falta saber de un pedido de uso antes de decidir nada. */
type UsoPreparado = {
  filas: FilaGuardia[];
  crear: NuevaAsignacion[];
  mover: MovimientoAsignacion[];
  destinos: Destino[];
  /** Dónde estaba cada jornada de `mover` según Odoo, ANTES de escribir (para el deshacer). */
  actuales: Map<number, CeldaAsignacion>;
  ot: OtTablero;
  duracion: number;
  avance: ProgresoOt | null;
  feriados: Set<string>;
  comodin: ReturnType<typeof comodinDe>;
  ahora: string;
};

/**
 * Lee y valida un pedido de uso contra la BASE, no contra el tablero: las guardias se releen,
 * las jornadas que se mueven se leen de Odoo (de qué obra son, en qué cuadrilla están), las
 * guardias que pisan las jornadas se buscan en la base y la OT se lee recién. Lo usan "usar"
 * y "pedir autorización": las dos puertas tienen que ver lo mismo, o JS podría aprobar algo
 * que "usar" no hubiera aceptado.
 */
async function prepararUso(adm: DB, pedido: PedidoUsoGuardia): Promise<UsoPreparado> {
  const hoy = hoyBA();
  const ahora = new Date().toISOString();
  const pedidas = new Set(pedido.guardiaIds);

  // Las guardias: todas activas y de hoy en adelante.
  const filas = await guardiasPorIds(adm, [...pedidas]);
  if (filas.length !== pedidas.size || filas.some((f) => f.guardia_estado !== "activa" || f.fecha < hoy)) {
    throw conflicto("La guardia ya no está activa: refrescá el tablero.");
  }

  // Las jornadas y dónde caen. Todas de la misma obra: el lote es de UNA obra.
  const crear = pedido.crear ?? [];
  const mover = pedido.mover ?? [];
  if (crear.length + mover.length === 0) {
    throw new ErrorGuardia(400, { error: "No hay ninguna jornada para poner en la guardia." });
  }
  if (crear.some((c) => c.otId !== pedido.otId)) {
    throw new ErrorGuardia(400, { error: "Todas las jornadas tienen que ser de la misma obra." });
  }
  const actuales = new Map((await celdasDeAsignaciones(mover.map((m) => m.id))).map((c) => [c.id, c]));
  const destinos: Destino[] = crear.map((c, i) => ({
    indiceCrear: i, id: null, cuadrillaId: c.cuadrillaId, fecha: c.fecha, apoyo: c.apoyo === true,
  }));
  for (const m of mover) {
    const actual = actuales.get(m.id);
    if (!actual) throw conflicto("Una de las jornadas ya no existe: refrescá el tablero.");
    if (actual.otId !== pedido.otId) throw new ErrorGuardia(400, { error: "Todas las jornadas tienen que ser de la misma obra." });
    if (actual.parteId != null) throw conflicto("Una de las jornadas ya tiene el parte cargado: no se puede mover.");
    destinos.push({
      indiceCrear: null,
      id: m.id,
      cuadrillaId: m.cuadrillaId !== undefined ? m.cuadrillaId : actual.cuadrillaId,
      fecha: m.fecha,
      apoyo: actual.apoyo,
    });
  }

  // Las guardias que pisan esas jornadas, según la base: tienen que ser EXACTAMENTE las
  // pedidas. Si pisa otra, esa otra también tendría que pasar por el candado; si no pisa una
  // de las pedidas, se marcaría usada una guardia que sigue libre.
  const conCuadrilla = destinos.filter((d): d is Destino & { cuadrillaId: number } => d.cuadrillaId != null);
  const pisadas = await activasEnCeldas(adm, conCuadrilla, hoy);
  const idsPisadas = new Set(pisadas.map((g) => g.id));
  if (idsPisadas.size !== pedidas.size || [...idsPisadas].some((id) => !pedidas.has(id))) {
    throw conflicto("Las jornadas no caen justo en esas guardias: refrescá el tablero y volvé a soltar la obra.");
  }

  // La OT, su avance y si es comodín.
  const maxFecha = destinos.map((d) => d.fecha).sort().at(-1) ?? hoy;
  const [ots, avances, planes, feriadosLista] = await Promise.all([
    leerOts([pedido.otId]),
    avanceDeOts([pedido.otId]),
    jornadasPlanTodas(adm),
    // 45 días para atrás alcanzan para "creada hace 3 días hábiles" y "espera 7 días
    // hábiles": más viejo que eso ya no cumple ni con todos los feriados del mundo.
    feriadosDelRango(sumarDias(hoy, -45), sumarDias(maxFecha, 1)),
  ]);
  const ot = ots[0];
  if (!ot) throw new ErrorGuardia(404, { error: "La OT ya no existe en Odoo." });
  // La duración del CANDADO (la mayor entre Odoo y el plan): ver duracionParaCandado.
  const duracion = duracionParaCandado(ot, planes.find((p) => p.otId === ot.id)?.jornadas);
  const avance = avances.get(ot.id) ?? null;
  const feriados = new Set(feriadosLista.map((f) => f.fecha));
  const comodin = comodinDe(ot, {
    asignaciones: [],
    progreso: avance ? [avance] : [],
    hoy,
    feriados,
    duracionDe: () => duracion,
  });
  return { filas, crear, mover, destinos, actuales, ot, duracion, avance, feriados, comodin, ahora };
}

/** El candado, guardia por guardia. `aprobadas`: las guardias que abre una autorización de JS. */
function decidirUso(p: UsoPreparado, aprobada: { guardiaIds: ReadonlySet<number>; tipo: TipoSolicitud } | null) {
  return p.filas.map((f) => {
    const g = aResumen(f);
    const sobre = p.destinos.filter((d) => d.cuadrillaId === g.cuadrillaId && d.fecha === g.fecha);
    const decision = evaluarCandado({
      guardia: g,
      ot: otParaCandado(p.ot, p.duracion),
      esApoyo: sobre.length > 0 && sobre.every((d) => d.apoyo),
      avance: p.avance,
      ahora: p.ahora,
      feriados: p.feriados,
      esComodin: !!p.comodin && comodinPuedeIr(p.comodin, g.fecha),
      aprobada: aprobada?.guardiaIds.has(g.id) ? aprobada.tipo : null,
    });
    return { fila: f, g, sobre, decision };
  });
}

/**
 * ¿El pedido que llega es el MISMO que aprobó JS? Misma obra, mismas guardias y las mismas
 * jornadas en las mismas celdas. El orden dentro del día y las notas no cuentan: al volver a
 * soltar la obra el tablero puede apilarla distinto, y eso no cambia lo que JS autorizó. Sin
 * esto, una autorización para "la Thames en la guardia del jueves" serviría para mandar con
 * ella sesenta jornadas de esa obra a cualquier otra celda.
 */
function mismoPedido(aprobado: PedidoUsoGuardia, llega: PedidoUsoGuardia): boolean {
  const lista = (xs: string[]) => [...xs].sort().join(";");
  const forma = (p: PedidoUsoGuardia) => ({
    guardias: lista(p.guardiaIds.map(String)),
    crear: lista((p.crear ?? []).map((c) => `${c.fecha}|${c.cuadrillaId ?? "-"}|${c.apoyo === true ? 1 : 0}|${c.fraccion}`)),
    mover: lista((p.mover ?? []).map((m) => `${m.id}|${m.fecha}|${m.cuadrillaId === undefined ? "=" : (m.cuadrillaId ?? "-")}`)),
  });
  const a = forma(aprobado);
  const b = forma(llega);
  return aprobado.otId === llega.otId && a.guardias === b.guardias && a.crear === b.crear && a.mover === b.mover;
}

/**
 * Devuelve a "activa" unas guardias que este mismo gesto tomó y no llegó a usar (Odoo falló,
 * u otra guardia del lote cambió en el medio). Sin historia: para quien mira, el uso nunca
 * pasó. Condicionado al lote, para no pisar nada que haya pasado después.
 */
async function soltarTomadas(adm: DB, ids: number[], loteId: string): Promise<number[]> {
  if (ids.length === 0) return [];
  const { data, error } = await adm
    .from(TABLA)
    .update({
      guardia_estado: "activa",
      guardia_uso: null,
      guardia_ot_id: null,
      guardia_asignacion_ids: [],
      guardia_lote_id: null,
      guardia_deshacer: null,
      guardia_estado_motivo: null,
    })
    .in("id", ids)
    .eq("guardia_lote_id", loteId)
    .select("id");
  if (error) {
    console.error("[guardias] no se pudieron devolver las guardias tomadas", error.message);
    return [];
  }
  return (data ?? []).map((f) => Number((f as { id: number }).id));
}

/**
 * Los pedidos PENDIENTES de unas guardias que dejaron de estar activas (se usaron, se
 * sacaron, la lluvia las consumió, se cerraron a depósito) o que se corrieron de celda: ya no
 * se pueden ejecutar, y dejarlos en la bandeja de JS sólo sirve para que los apruebe y
 * terminen en "aprobada con error". Quedan cancelados con el porqué y la historia lo anota.
 * `soloUsos`: al correrla, un pedido de SACAR sigue valiendo (la guardia es la misma); uno de
 * poner una obra no (sus jornadas apuntaban a la celda vieja). NO TIRA.
 */
async function cerrarPedidosDe(
  adm: DB,
  guardiaIds: number[],
  motivo: string,
  opts: { exceptoId?: string | null; soloUsos?: boolean } = {},
): Promise<void> {
  if (guardiaIds.length === 0) return;
  try {
    let q = adm
      .from(SOLICITUDES)
      .update({ estado: "cancelada", respuesta: motivo })
      .in("guardia_id", guardiaIds)
      .eq("estado", "pendiente");
    if (opts.exceptoId) q = q.neq("id", opts.exceptoId);
    if (opts.soloUsos) q = q.neq("tipo", "sacar");
    const { data, error } = await q.select("id, guardia_id, ot_id, ot_titulo");
    if (error) throw new Error(error.message);
    await anotar(adm, ((data ?? []) as { id: string; guardia_id: number; ot_id: number | null; ot_titulo: string | null }[]).map((f) => ({
      guardiaId: Number(f.guardia_id),
      accion: "cancelar" as const,
      otId: f.ot_id == null ? null : Number(f.ot_id),
      otTitulo: f.ot_titulo,
      motivo,
      solicitudId: f.id,
      autorId: null,
    })));
  } catch (e) {
    console.error("[guardias] no se pudieron cerrar los pedidos de la guardia", e);
  }
}

/**
 * POST /api/planificacion/guardias/usar (y "Aprobar" de JS): la obra REEMPLAZA a la guardia,
 * en un lote. Ver guardias-plan-tecnico.md §3, "usar paso a paso".
 *
 * PRIMERO SE TOMA LA GUARDIA, DESPUÉS SE ESCRIBE ODOO (revisión del 18/10). Antes era al
 * revés: se escribía Odoo y recién después se marcaba la guardia, y si la marca no se
 * aplicaba —dos personas soltando obras distintas sobre la misma guardia casi a la vez— la
 * segunda obra quedaba apilada encima de una guardia que la primera ya había usado, con un
 * lote que no estaba en ninguna guardia y un deshacer que contestaba 409. Ahora el UPDATE
 * `activa → usada ... WHERE guardia_estado = 'activa' RETURNING` es la traba: el que no
 * consigue la fila contesta 409 sin haber tocado Odoo. Si Odoo falla después, las guardias
 * vuelven a "activa" (si su celda quedó libre: ver devolverSiFalla).
 *
 * `ejecutaJS`: lo llama responderSolicitud al aprobar. La autorización vale para QUIEN LA
 * PIDIÓ (contrato §1.3: "queda habilitada para quien la pidió") y para JS al aprobarla.
 */
export async function usarGuardias(
  sesion: Sesion,
  pedido: PedidoUsoGuardia,
  opts: { motivo?: string | null; ejecutaJS?: boolean } = {},
): Promise<RespuestaUsoGuardia> {
  const adm = createAdminClient();
  const p = await prepararUso(adm, pedido);
  const { crear, mover, destinos, actuales, ot, avance } = p;

  // La autorización de JS, si la trae.
  let aprobada: { guardiaIds: Set<number>; tipo: TipoSolicitud } | null = null;
  if (pedido.solicitudId) {
    const { data: sol, error } = await adm
      .from(SOLICITUDES)
      .select("id, guardia_id, tipo, ot_id, estado, ejecutada_at, pedido_por, pedido")
      .eq("id", pedido.solicitudId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const aprobado = (sol?.pedido ?? null) as PedidoUsoGuardia | null;
    const valida =
      sol && sol.estado === "aprobada" && !sol.ejecutada_at && sol.tipo !== "sacar" &&
      Number(sol.ot_id) === pedido.otId &&
      (opts.ejecutaJS === true || sol.pedido_por === sesion.userId) &&
      !!aprobado && mismoPedido(aprobado, pedido);
    if (!valida) throw conflicto("Esa autorización ya no sirve para este uso: pedila de nuevo.");
    // Abre TODAS las guardias del pedido aprobado: una obra de varios días que pisa dos se
    // aprueba de una vez, no se rechaza al ejecutarla por la segunda.
    aprobada = { guardiaIds: new Set(aprobado!.guardiaIds), tipo: sol.tipo as TipoSolicitud };
  }

  // El candado, guardia por guardia.
  const decisiones = decidirUso(p, aprobada);
  for (const d of decisiones) {
    if (!d.decision.libre) {
      const rechazo: RechazoCandado = { error: d.decision.mensaje, codigo: "guardia", guardiaId: d.g.id, pide: d.decision.pide };
      throw new ErrorGuardia(409, rechazo);
    }
  }

  // EL COMODÍN SE MUEVE, NO SE COPIA (contrato §2.3). Si la obra ya tiene jornadas principales
  // por hacer en la grilla y el pedido CREA una principal nueva, se estaría duplicando: el
  // tablero manda `mover`, y esto ataja a una pantalla vieja o a una llamada a mano.
  const usaComoComodin = decisiones.some((d) => d.decision.libre && d.decision.uso === "comodin");
  const pendientes = avance ? avance.asignadas - avance.cerradas : 0;
  if (usaComoComodin && pendientes > 0 && crear.some((c) => c.apoyo !== true)) {
    throw conflicto("Ese comodín ya está en el tablero: se mueve a la guardia, no se copia. Refrescá y volvé a soltarlo.");
  }

  // Los roles de la obra (apoyo sin principal, dos principales…), como en asignaciones. Si
  // la lectura falla no se frena: la escritura que sigue fallaría igual con Odoo caído.
  try {
    const conflictos = await validarRoles({ crear: crear.length ? crear : undefined, mover: mover.length ? mover : undefined });
    if (conflictos.length > 0) {
      throw conflicto([...new Set(conflictos.map((c) => textoConflicto(c)))].join(" "), { conflictos });
    }
  } catch (e) {
    if (e instanceof ErrorGuardia) throw e;
    console.error("[guardias] no se pudieron validar los roles de apoyo", e);
  }

  // La autorización se GASTA antes de escribir, de forma atómica: dos pestañas con el mismo
  // pedido aprobado no lo ejecutan dos veces.
  if (pedido.solicitudId) {
    const { data, error } = await adm
      .from(SOLICITUDES)
      .update({ ejecutada_at: new Date().toISOString(), error_ejecucion: null })
      .eq("id", pedido.solicitudId)
      .eq("estado", "aprobada")
      .is("ejecutada_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) throw conflicto("Esa autorización ya se usó: refrescá el tablero.");
  }
  const devolverAutorizacion = async () => {
    if (!pedido.solicitudId) return;
    const { error } = await adm.from(SOLICITUDES).update({ ejecutada_at: null }).eq("id", pedido.solicitudId);
    if (error) console.error("[guardias] no se pudo devolver la autorización", error.message);
  };

  // Se TOMAN las guardias (ver el comentario de arriba). Ninguna se puede quedar a mitad:
  // si una no se consigue, las que sí vuelven y no se toca Odoo.
  const loteId = crypto.randomUUID();
  const tomadas: { fila: FilaGuardia; g: GuardiaResumen; sobre: Destino[]; uso: UsoGuardia; motivo: string }[] = [];
  for (const { g, sobre, decision } of decisiones) {
    if (!decision.libre) continue;
    const motivo = opts.motivo ?? decision.razon;
    const { data, error } = await adm
      .from(TABLA)
      .update({
        guardia_estado: ESTADO_POR_USO[decision.uso],
        guardia_uso: decision.uso,
        guardia_ot_id: ot.id,
        guardia_asignacion_ids: [],
        guardia_lote_id: loteId,
        guardia_deshacer: null,
        guardia_estado_por: sesion.userId,
        guardia_estado_at: new Date().toISOString(),
        guardia_estado_motivo: motivo,
      })
      .eq("id", g.id)
      .eq("guardia_estado", "activa")
      .select(COLUMNAS);
    const fila = ((data ?? []) as unknown as FilaGuardia[]).map(normalizar)[0];
    if (error || !fila) {
      await soltarTomadas(adm, tomadas.map((t) => t.g.id), loteId);
      await devolverAutorizacion();
      if (error) throw new Error(error.message);
      throw conflicto("Otra persona usó esa guardia recién: refrescá el tablero.");
    }
    tomadas.push({ fila, g, sobre, uso: decision.uso, motivo });
  }

  // Odoo. Si falla, se deshace lo que se pueda y las guardias vuelven (devolverSiFalla).
  let idsCreados: number[] | null = null;
  let movioAlgo = false;
  try {
    idsCreados = await crearAsignaciones(crear);
    if (mover.length > 0) {
      movioAlgo = true;
      await moverAsignaciones(mover);
    }
  } catch (e) {
    await devolverSiFalla(adm, { tomadas: tomadas.map((t) => t.fila), loteId, idsCreados, mover: movioAlgo ? mover : [], actuales, userId: sesion.userId });
    const quedaron = await guardiasPorIds(adm, tomadas.map((t) => t.g.id)).catch(() => []);
    if (quedaron.every((f) => f.guardia_estado === "activa")) await devolverAutorizacion();
    throw e;
  }
  sincronizarLuego([ot.id]);

  // Las guardias, con las jornadas que las ocupan y lo que deshace el lote. El deshacer sale
  // de ACÁ (leído de Odoo antes de escribir), no de lo que mande el navegador.
  const creados = idsCreados ?? [];
  const idDe = (d: Destino) => (d.indiceCrear != null ? creados[d.indiceCrear] : d.id);
  const deshacer: DeshacerGuardado = {
    borrar: creados,
    volver: mover.map((m) => {
      const a = actuales.get(m.id)!;
      return { id: m.id, fecha: a.fecha ?? m.fecha, cuadrillaId: a.cuadrillaId };
    }),
  };
  const eventos: NuevoEvento[] = [];
  for (const t of tomadas) {
    const estado = ESTADO_POR_USO[t.uso];
    const { error } = await adm
      .from(TABLA)
      .update({
        guardia_asignacion_ids: t.sobre.map(idDe).filter((x): x is number => x != null),
        guardia_deshacer: deshacer,
      })
      .eq("id", t.g.id)
      .eq("guardia_lote_id", loteId);
    // La obra ya está en Odoo y la guardia ya está tomada: perder esto deja sin chip y sin
    // deshacer solo (contesta 409 y se corre a mano), pero no apila nada.
    if (error) console.error(`[guardias] la guardia ${t.g.id} quedó usada sin sus jornadas`, error.message);
    eventos.push({
      guardiaId: t.g.id,
      accion: estado === "rellenada" ? "rellenar" : "usar",
      estadoAntes: "activa",
      estadoDespues: estado,
      uso: t.uso,
      otId: ot.id,
      otTitulo: ot.titulo,
      motivo: t.motivo,
      loteId,
      solicitudId: pedido.solicitudId ?? null,
      autorId: sesion.userId,
    });
  }
  await anotar(adm, eventos);
  await cerrarPedidosDe(adm, tomadas.map((t) => t.g.id), "La guardia ya se usó", { exceptoId: pedido.solicitudId });

  // El historial del tablero, con la sesión.
  const uso = tomadas[0].uso;
  const asignacionIds = destinos.map(idDe).filter((x): x is number => x != null);
  const movimientoId = await anotarMovimiento(sesion.db, pedido, asignacionIds, loteId, uso);
  return { ok: true, uso, ids: creados, loteId, movimientoId };
}

/**
 * Odoo falló a mitad de un uso: se deshace lo que se pueda (lo creado se borra, lo movido
 * vuelve a donde estaba) y las guardias tomadas vuelven a "activa" SI SU CELDA QUEDÓ LIBRE.
 *
 *   · Si falló el `create` no se escribió nada (es una sola llamada a Odoo): vuelven sin
 *     preguntar.
 *   · Si algo llegó a escribirse, se mira la celda. Una guardia con algo de la obra encima
 *     (la compensación también falló) se queda "usada" y la historia lo dice: volverla activa
 *     la apilaría sobre trabajo real, que es justo lo que el candado no deja. Si ni siquiera
 *     se puede mirar (Odoo caído), también se queda usada: se ve en la ficha y se corrige a
 *     mano, mientras que una guardia activa debajo de una obra no se ve en ningún lado.
 */
async function devolverSiFalla(
  adm: DB,
  e: {
    tomadas: FilaGuardia[];
    loteId: string;
    idsCreados: number[] | null;
    mover: MovimientoAsignacion[];
    actuales: ReadonlyMap<number, CeldaAsignacion>;
    userId: string;
  },
): Promise<void> {
  const ids = e.tomadas.map((g) => g.id);
  if (e.idsCreados == null) {
    await soltarTomadas(adm, ids, e.loteId);
    return;
  }
  try {
    if (e.idsCreados.length > 0) await borrarAsignaciones(e.idsCreados);
    if (e.mover.length > 0) {
      await moverAsignaciones(
        e.mover.flatMap((m) => {
          const a = e.actuales.get(m.id);
          return a?.fecha ? [{ id: m.id, fecha: a.fecha, cuadrillaId: a.cuadrillaId }] : [];
        }),
      );
    }
  } catch (err) {
    console.error("[guardias] Odoo falló y tampoco se pudo deshacer lo escrito", err);
  }
  let libres: Set<number>;
  try {
    libres = await celdasLibres(adm, e.tomadas);
  } catch (err) {
    console.error("[guardias] no se pudo mirar si la celda quedó libre", err);
    libres = new Set();
  }
  await soltarTomadas(adm, ids.filter((id) => libres.has(id)), e.loteId);
  const quedan = e.tomadas.filter((g) => !libres.has(g.id));
  for (const g of quedan) console.error(`[guardias] la guardia ${g.id} queda usada: Odoo falló a mitad del uso y quedó algo en su jornada`);
  await anotar(adm, quedan.map((g) => ({
    guardiaId: g.id,
    accion: g.guardia_estado === "rellenada" ? ("rellenar" as const) : ("usar" as const),
    estadoAntes: "activa" as const,
    estadoDespues: g.guardia_estado,
    uso: g.guardia_uso,
    otId: g.guardia_ot_id,
    motivo: "Odoo falló a mitad del uso y quedó algo de la obra en la jornada: la guardia queda usada. Revisá la celda.",
    loteId: e.loteId,
    autorId: e.userId,
  })));
}

// ─── Que la celda esté libre ───────────────────────────────────────────────────────────

/** Las tareas (y guardias visibles) de Supabase en estas celdas. */
async function tareasEnCeldas(adm: DB, celdas: readonly { cuadrillaId: number; fecha: string }[]) {
  if (celdas.length === 0) return [];
  const { data, error } = await adm
    .from(TABLA)
    .select("id, tipo, guardia_estado, guardia_uso, cuadrilla_odoo_id, fecha")
    .in("fecha", [...new Set(celdas.map((c) => c.fecha))])
    .in("cuadrilla_odoo_id", [...new Set(celdas.map((c) => c.cuadrillaId))]);
  if (error) throw new Error(error.message);
  const claves = new Set(celdas.map((c) => claveCelda(c.cuadrillaId, c.fecha)));
  return ((data ?? []) as { id: number; tipo: string; guardia_estado: string | null; guardia_uso: string | null; cuadrilla_odoo_id: number; fecha: string }[])
    .map((t) => ({ ...t, id: Number(t.id), cuadrilla_odoo_id: Number(t.cuadrilla_odoo_id) }))
    // Una guardia usada, sacada o rellenada con un comodín ya no ocupa la celda.
    .filter((t) => t.tipo !== "guardia" || t.guardia_estado === "activa" || (t.guardia_estado === "rellenada" && t.guardia_uso === "deposito"))
    .filter((t) => claves.has(claveCelda(t.cuadrilla_odoo_id, t.fecha)));
}

/**
 * Qué guardias pueden volver a "activa" porque su celda está totalmente libre. `seVan` son
 * jornadas de Odoo que este mismo gesto saca de ahí (todavía figuran en Odoo cuando se
 * pregunta antes de escribir).
 */
async function celdasLibres(
  adm: DB,
  guardias: readonly FilaGuardia[],
  seVan: ReadonlySet<number> = new Set(),
): Promise<Set<number>> {
  const celdas = guardias.map((g) => ({ cuadrillaId: g.cuadrilla_odoo_id, fecha: g.fecha }));
  const [enOdoo, tareas] = await Promise.all([asignacionesEnCeldas(celdas), tareasEnCeldas(adm, celdas)]);
  const libres = new Set<number>();
  for (const g of guardias) {
    const k = claveCelda(g.cuadrilla_odoo_id, g.fecha);
    const obras = enOdoo.filter((a) => claveCelda(a.cuadrillaId, a.fecha ?? "") === k && !seVan.has(a.id));
    const otras = tareas.filter((t) => claveCelda(t.cuadrilla_odoo_id, t.fecha) === k && t.id !== g.id);
    if (obras.length === 0 && otras.length === 0) libres.add(g.id);
  }
  return libres;
}

/** Vuelve unas guardias a "activa" y anota por qué. Devuelve las que cambiaron. */
async function reactivar(
  adm: DB,
  guardias: readonly FilaGuardia[],
  motivo: string,
  autorId: string | null,
  condicion: { loteId?: string } = {},
): Promise<number[]> {
  const hechas: number[] = [];
  const eventos: NuevoEvento[] = [];
  for (const g of guardias) {
    let q = adm
      .from(TABLA)
      .update({
        guardia_estado: "activa",
        guardia_uso: null,
        guardia_ot_id: null,
        guardia_asignacion_ids: [],
        guardia_lote_id: null,
        guardia_deshacer: null,
        guardia_estado_por: autorId,
        guardia_estado_at: new Date().toISOString(),
        guardia_estado_motivo: motivo,
      })
      .eq("id", g.id)
      .eq("guardia_estado", g.guardia_estado);
    if (condicion.loteId) q = q.eq("guardia_lote_id", condicion.loteId);
    const { data, error } = await q.select("id");
    if (esDuplicado(error)) {
      // Ya hay otra guardia activa en esa celda (alguien corrió otra ahí): ésta no vuelve.
      console.error(`[guardias] la guardia ${g.id} no vuelve: ya hay otra activa en su jornada`);
      continue;
    }
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) continue;
    hechas.push(g.id);
    eventos.push({
      guardiaId: g.id,
      accion: "reactivar",
      estadoAntes: g.guardia_estado,
      estadoDespues: "activa",
      uso: g.guardia_uso,
      otId: g.guardia_ot_id,
      motivo,
      loteId: g.guardia_lote_id,
      autorId,
    });
  }
  await anotar(adm, eventos);
  return hechas;
}

// ─── Deshacer un uso ───────────────────────────────────────────────────────────────────

/**
 * POST /api/planificacion/guardias/deshacer: el lote entero o nada. Se comprueba TODO antes
 * de escribir: que las guardias sigan usadas por ese lote, que las jornadas sigan existiendo,
 * sean de esa obra y estén sin parte, que la celda de cada guardia quede totalmente libre
 * cuando se vayan, y que adonde vuelve cada jornada no haya ahora una guardia activa. Si algo
 * no cierra, 409 y no se toca nada: devolver la mitad dejaría una obra a medias o una guardia
 * encima de otra cosa.
 *
 * QUÉ SE BORRA Y ADÓNDE VUELVE SALE DE LA GUARDIA (`guardia_deshacer`), no del pedido
 * (revisión del 18/10). Con un lote propio cualquiera, `borrar` y `volver` del navegador
 * dejaban borrar o mover cualquier jornada sin pasar por ningún candado; y aun con el tablero
 * honesto, un comodín que volvía a su celda vieja podía caer encima de la guardia que la
 * corrida del viernes había puesto ahí mientras tanto.
 */
export async function deshacerUso(sesion: Sesion, d: DeshacerUsoGuardia): Promise<{ otIds: number[] }> {
  const adm = createAdminClient();
  const { data, error } = await adm.from(TABLA).select(COLUMNAS).eq("tipo", "guardia").eq("guardia_lote_id", d.loteId);
  if (error) throw new Error(error.message);
  const delLote = ((data ?? []) as unknown as FilaGuardia[]).map(normalizar);
  const pedidas = new Set(d.guardiaIds);
  if (
    delLote.length === 0 ||
    delLote.length !== pedidas.size ||
    delLote.some((g) => !pedidas.has(g.id) || (g.guardia_estado !== "usada" && g.guardia_estado !== "rellenada"))
  ) {
    throw conflicto("Ese uso ya se deshizo o la guardia cambió: refrescá el tablero.");
  }
  if (delLote.some((g) => g.guardia_uso === "lluvia")) {
    throw conflicto("Esa guardia la usó el corrimiento del día: se deshace deshaciendo el corrimiento.");
  }
  const guardado = delLote.find((g) => g.guardia_deshacer)?.guardia_deshacer ?? null;
  if (!guardado) {
    throw conflicto("Ese uso no se puede deshacer solo: corré la obra a mano y la guardia vuelve sola si la jornada queda libre.");
  }

  const borrar = [...new Set(guardado.borrar.map(Number))];
  const volver = [...new Map(guardado.volver.map((v) => [Number(v.id), { ...v, id: Number(v.id) }])).values()];
  const tocadas = [...new Set([...borrar, ...volver.map((v) => v.id)])];
  const otIds = new Set(delLote.map((g) => g.guardia_ot_id).filter((x): x is number => x != null));
  const actuales = await celdasDeAsignaciones(tocadas);
  if (actuales.length !== tocadas.length) throw conflicto("Alguna jornada de ese uso ya no existe: refrescá el tablero.");
  if (actuales.some((a) => a.parteId != null)) throw conflicto("Alguna jornada de ese uso ya tiene el parte cargado: no se puede deshacer.");
  if (actuales.some((a) => a.otId == null || !otIds.has(a.otId))) {
    throw conflicto("Alguna jornada de ese uso ya no es de esa obra: refrescá el tablero.");
  }

  const libres = await celdasLibres(adm, delLote, new Set(tocadas));
  if (delLote.some((g) => !libres.has(g.id))) {
    throw conflicto("En esa jornada ya hay otra cosa: la guardia no puede volver. Refrescá el tablero.");
  }
  // Adonde vuelve cada jornada: si ahora hay una guardia activa (la puso la corrida del
  // viernes en la celda que el comodín había dejado), volver la apilaría. Lo mismo que
  // frenoParaMover, con un texto que habla del deshacer.
  const vuelven = volver.filter((v): v is typeof v & { cuadrillaId: number } => v.cuadrillaId != null);
  if ((await activasEnCeldas(adm, vuelven, hoyBA())).length > 0) {
    throw conflicto("Donde estaba la obra ahora hay una guardia: no se puede deshacer solo. Corré la obra a mano.");
  }
  // Los roles, como en cualquier gesto que borra o mueve (un apoyo que se quedaría sin su
  // principal). Si la lectura falla no se frena, igual que en asignaciones.
  try {
    const conflictos = await validarRoles({ borrar: borrar.length ? borrar : undefined, mover: volver.length ? volver : undefined });
    if (conflictos.length > 0) {
      throw conflicto([...new Set(conflictos.map((c) => textoConflicto(c)))].join(" "), { conflictos });
    }
  } catch (e) {
    if (e instanceof ErrorGuardia) throw e;
    console.error("[guardias] no se pudieron validar los roles al deshacer", e);
  }

  if (borrar.length > 0) await borrarAsignaciones(borrar);
  if (volver.length > 0) await moverAsignaciones(volver);
  await reactivar(adm, delLote, "Deshizo el uso", sesion.userId, { loteId: d.loteId });
  await anotarDeshacerMovimiento(sesion.db, d.loteId);

  sincronizarLuego([...otIds]);
  return { otIds: [...otIds] };
}

/**
 * El deshacer también queda en plan_movimientos, como el de cualquier gesto del tablero: una
 * fila que apunta (`deshace_a`) a la del uso, con el antes y el después dados vuelta. Así el
 * panel de actividad marca el uso como deshecho y nadie ve una obra "puesta" que ya no está.
 *
 * Sale de la fila del uso (mismo lote) y no del cuerpo del pedido: el deshacer viaja sin
 * registro, y lo que hay que invertir ya está escrito. Con la sesión (el autor es quien
 * deshace). NO TIRA: Odoo y la guardia ya volvieron, que es lo que se pidió.
 */
async function anotarDeshacerMovimiento(db: DB, loteId: string): Promise<void> {
  try {
    const { data, error } = await db
      .from("plan_movimientos")
      .select("id, odoo_ot_id, ot_titulo, accion, asignacion_ids, antes, despues")
      .eq("lote_id", loteId)
      .is("deshace_a", null);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as {
      id: string; odoo_ot_id: number; ot_titulo: string | null; accion: string;
      asignacion_ids: number[] | null; antes: unknown; despues: unknown;
    }[];
    if (filas.length === 0) return;
    const { error: e2 } = await db.from("plan_movimientos").insert(
      filas.map((f) => ({
        odoo_ot_id: f.odoo_ot_id,
        ot_titulo: f.ot_titulo,
        // Deshacer un "crear" es sacar lo creado; deshacer un "mover" es volverlo.
        accion: f.accion === "crear" ? "quitar" : "mover",
        asignacion_ids: f.asignacion_ids ?? [],
        antes: f.despues,
        despues: f.accion === "crear" ? null : f.antes,
        deshace_a: f.id,
        motivo: "Deshizo el uso de la guardia",
      })),
    );
    if (e2) throw new Error(e2.message);
  } catch (e) {
    console.error("[guardias] no se pudo registrar el deshacer en el historial", e);
  }
}

// ─── Correrla dentro de la semana ──────────────────────────────────────────────────────

/** POST /api/planificacion/guardias/mover: con las mismas reglas que la corrida (destinoValidoGuardia). */
export async function moverGuardia(sesion: Sesion, m: MoverGuardia): Promise<Guardia> {
  const adm = createAdminClient();
  const [f] = await guardiasPorIds(adm, [m.guardiaId]);
  if (!f) throw new ErrorGuardia(404, { error: "Esa guardia no existe." });
  const g = aResumen(f);
  const [semana, grilla] = await Promise.all([
    guardiasDeSemanas(adm, [g.semana]),
    // Una semana para cada lado: alcanza para ver el día hábil anterior y el siguiente aunque
    // haya un feriado largo en el medio ("en medio de una obra de varios días").
    leerGrillaLiviana(adm, sumarDias(m.fecha, -7), sumarDias(m.fecha, 7)),
  ]);
  const motivo = destinoValidoGuardia(grilla, g, { cuadrillaId: m.cuadrillaId, fecha: m.fecha }, semana);
  if (motivo) throw conflicto(motivo);

  // EL PORQUÉ CAMBIA CON LA CELDA (revisión del 18/10). "El jueves le tocaba a la C3 por
  // rotación" es falso una vez que la guardia está el miércoles en la C2, y la ficha lo
  // muestra arriba de todo. La razón original no se pierde: queda en el evento "poner" de la
  // historia, con el motivo de la corrida.
  const [nombres, sigla] = await Promise.all([nombresDe(adm, [sesion.userId]), siglasDe([g.cuadrillaId, m.cuadrillaId])]);
  const quien = nombres.get(sesion.userId) || "Planificación";
  const porQue =
    `La corrió ${quien} del ${diaCorto(g.fecha)} (${sigla(g.cuadrillaId)}) ` +
    `al ${diaCorto(m.fecha)} (${sigla(m.cuadrillaId)}).`;

  const { data, error } = await adm
    .from(TABLA)
    .update({
      fecha: m.fecha,
      cuadrilla_odoo_id: m.cuadrillaId,
      guardia_por_que: porQue,
      guardia_estado_por: sesion.userId,
      guardia_estado_at: new Date().toISOString(),
    })
    .eq("id", g.id)
    .eq("guardia_estado", "activa")
    .eq("fecha", g.fecha)
    .eq("cuadrilla_odoo_id", g.cuadrillaId)
    .select(COLUMNAS);
  if (esDuplicado(error)) throw conflicto("En esa jornada ya hay otra guardia.");
  if (error) throw new Error(error.message);
  const fila = ((data ?? []) as unknown as FilaGuardia[]).map(normalizar)[0];
  if (!fila) throw conflicto("La guardia cambió mientras la corrías: refrescá el tablero.");
  await anotar(adm, [{
    guardiaId: g.id,
    accion: "mover",
    estadoAntes: "activa",
    estadoDespues: "activa",
    de: { fecha: g.fecha, cuadrillaId: g.cuadrillaId },
    a: { fecha: m.fecha, cuadrillaId: m.cuadrillaId },
    motivo: f.guardia_por_que ? `Antes: ${f.guardia_por_que}` : null,
    autorId: sesion.userId,
  }]);
  // Un pedido de poner una obra apuntaba a la celda vieja: ya no se puede ejecutar. Uno de
  // sacarla sigue valiendo (es la misma guardia).
  await cerrarPedidosDe(adm, [g.id], "La guardia se corrió de jornada: si hace falta, pedilo de nuevo", { soloUsos: true });
  return aGuardia(fila, nombres);
}

// ─── Sacarla (sólo JS) ─────────────────────────────────────────────────────────────────

/**
 * POST /api/planificacion/guardias/sacar, o "Aprobar" un pedido de sacar. La guardia queda
 * "sacada": no se ve en la grilla, conserva su ranura (esa semana no se repone) y queda en la
 * historia con el motivo.
 */
export async function sacarGuardia(sesion: Sesion, s: SacarGuardia, solicitudId?: string): Promise<void> {
  const adm = createAdminClient();
  const [f] = await guardiasPorIds(adm, [s.guardiaId]);
  if (!f) throw new ErrorGuardia(404, { error: "Esa guardia no existe." });
  const { data, error } = await adm
    .from(TABLA)
    .update({
      guardia_estado: "sacada",
      guardia_estado_por: sesion.userId,
      guardia_estado_at: new Date().toISOString(),
      guardia_estado_motivo: s.motivo,
    })
    .eq("id", s.guardiaId)
    .eq("guardia_estado", "activa")
    .select("id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw conflicto("Esa guardia ya no está activa: no hay nada que sacar.");
  await anotar(adm, [{
    guardiaId: s.guardiaId,
    accion: "sacar",
    estadoAntes: "activa",
    estadoDespues: "sacada",
    de: { fecha: f.fecha, cuadrillaId: f.cuadrilla_odoo_id },
    motivo: s.motivo,
    solicitudId: solicitudId ?? null,
    autorId: sesion.userId,
  }]);
  await cerrarPedidosDe(adm, [s.guardiaId], "JS sacó la guardia", { exceptoId: solicitudId });
}

// ─── El corrimiento y las obras que se van ─────────────────────────────────────────────

/**
 * El corrimiento del día consume las guardias donde cae algo (contrato §1.4): "usada
 * (lluvia)", con el lote del corrimiento (su deshacer las reactiva). `asignacionesPor` dice
 * qué jornadas cayeron en cada una (para el chip "de guardia" y para liberarla si después se
 * van). Devuelve las que cambiaron.
 */
export async function consumirPorLluvia(
  adm: DB,
  guardiaIds: number[],
  loteId: string | null,
  autorId: string | null,
  asignacionesPor: ReadonlyMap<number, number[]> = new Map(),
): Promise<number[]> {
  if (guardiaIds.length === 0) return [];
  const hechas: number[] = [];
  const eventos: NuevoEvento[] = [];
  const motivo = "La usó el corrimiento del día";
  for (const id of [...new Set(guardiaIds)]) {
    const { data, error } = await adm
      .from(TABLA)
      .update({
        guardia_estado: "usada",
        guardia_uso: "lluvia",
        guardia_asignacion_ids: asignacionesPor.get(id) ?? [],
        guardia_lote_id: loteId,
        guardia_estado_por: autorId,
        guardia_estado_at: new Date().toISOString(),
        guardia_estado_motivo: motivo,
      })
      .eq("id", id)
      .eq("tipo", "guardia")
      .eq("guardia_estado", "activa")
      .select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) continue;
    hechas.push(id);
    eventos.push({ guardiaId: id, accion: "usar", estadoAntes: "activa", estadoDespues: "usada", uso: "lluvia", motivo, loteId, autorId });
  }
  await anotar(adm, eventos);
  await cerrarPedidosDe(adm, hechas, "La usó el corrimiento del día");
  return hechas;
}

/**
 * El deshacer del corrimiento: las guardias que consumió ese lote vuelven a "activa", si su
 * celda quedó libre (las obras ya volvieron a su día). Una que tiene otra cosa encima se
 * queda usada: volverla activa apilaría la guardia sobre trabajo real.
 */
export async function reactivarDeLote(adm: DB, loteId: string, guardiaIds: number[] | null, autorId: string | null): Promise<number[]> {
  let q = adm.from(TABLA).select(COLUMNAS).eq("tipo", "guardia").eq("guardia_lote_id", loteId).eq("guardia_estado", "usada").eq("guardia_uso", "lluvia");
  if (guardiaIds && guardiaIds.length > 0) q = q.in("id", guardiaIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const filas = ((data ?? []) as unknown as FilaGuardia[]).map(normalizar);
  if (filas.length === 0) return [];
  const libres = await celdasLibres(adm, filas);
  return reactivar(adm, filas.filter((f) => libres.has(f.id)), "Se deshizo el corrimiento del día", autorId, { loteId });
}

/**
 * LIBERACIÓN POR SALIDA (plan técnico §0, decisión 8): si la obra que usó una guardia se va de
 * su celda (se mueve o se quita) y la celda queda totalmente libre, la guardia vuelve a
 * "activa". Sin esto, "usarla con una urgencia y después mover la urgencia" achicaría el
 * lugar protegido sin pedir nada. Sólo de hoy en adelante: el pasado es historia.
 */
export async function liberarPorSalida(adm: DB, asignacionIds: number[], autorId: string | null): Promise<number[]> {
  if (asignacionIds.length === 0) return [];
  const { data, error } = await adm
    .from(TABLA)
    .select(COLUMNAS)
    .eq("tipo", "guardia")
    .in("guardia_estado", ["usada", "rellenada"])
    .gte("fecha", hoyBA())
    .overlaps("guardia_asignacion_ids", asignacionIds);
  if (error) throw new Error(error.message);
  const filas = ((data ?? []) as unknown as FilaGuardia[]).map(normalizar);
  if (filas.length === 0) return [];
  const libres = await celdasLibres(adm, filas);
  return reactivar(adm, filas.filter((f) => libres.has(f.id)), "La obra que la usaba se fue de la jornada", autorId);
}

/**
 * La corrida de las 13 h, paso 1: las guardias activas de días que ya pasaron no las usó
 * nadie, y la cuadrilla fue al depósito. Quedan "rellenada · depósito" (en el tablero, como la
 * tarea "Depósito" que fue). Devuelve cuántas cerró.
 */
export async function cerrarPasadasComoDeposito(adm: DB, hoy: string): Promise<number> {
  const motivo = "Nadie la usó: la cuadrilla fue al depósito";
  const { data, error } = await adm
    .from(TABLA)
    .update({
      guardia_estado: "rellenada",
      guardia_uso: "deposito",
      guardia_estado_por: null,
      guardia_estado_at: new Date().toISOString(),
      guardia_estado_motivo: motivo,
    })
    .eq("tipo", "guardia")
    .eq("guardia_estado", "activa")
    .lt("fecha", hoy)
    .select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((f) => Number((f as { id: number }).id));
  await anotar(adm, ids.map((id) => ({
    guardiaId: id, accion: "rellenar" as const, estadoAntes: "activa" as const, estadoDespues: "rellenada" as const,
    uso: "deposito" as const, motivo, autorId: null,
  })));
  await cerrarPedidosDe(adm, ids, "El día pasó y la guardia se cerró como depósito");
  return ids.length;
}

// ─── Los pedidos a JS ──────────────────────────────────────────────────────────────────

async function solicitudPorId(adm: DB, id: string): Promise<FilaSolicitud | null> {
  const { data, error } = await adm.from(SOLICITUDES).select(COLUMNAS_SOLICITUD).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FilaSolicitud) ?? null;
}

async function solicitudCompleta(adm: DB, id: string): Promise<SolicitudGuardia> {
  const f = await solicitudPorId(adm, id);
  if (!f) throw new ErrorGuardia(404, { error: "Ese pedido no existe." });
  return (await conGuardiasYNombres(adm, [f]))[0];
}

/** GET /api/planificacion/guardias/solicitudes: la bandeja de JS (y de quien pidió). */
export async function listarSolicitudes(db: DB, filtro: { estado?: EstadoSolicitud | "todas" }): Promise<SolicitudGuardia[]> {
  let q = db.from(SOLICITUDES).select(COLUMNAS_SOLICITUD).order("pedido_at", { ascending: false }).limit(200);
  const estado = filtro.estado ?? "pendiente";
  if (estado !== "todas") q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return conGuardiasYNombres(db, (data ?? []) as unknown as FilaSolicitud[]);
}

/**
 * POST /api/planificacion/guardias/solicitudes: "Pedir autorización". La guardia SIGUE
 * PUESTA hasta que JS responda. Un pedido igual pendiente (misma guardia, tipo y obra) no se
 * duplica: el índice único lo ataja y se devuelve el que ya estaba, con 409.
 *
 * QUÉ SE PIDE LO DECIDE EL SERVIDOR (revisión del 18/10). Para un uso, el pedido se prepara y
 * se evalúa con el mismo candado que "usar" (prepararUso + decidirUso) y el tipo que se guarda
 * es el `pide` de ESA evaluación, no el que mandó el navegador: JS lee esa etiqueta para
 * decidir ("comodín antes de las 13 h" no es lo mismo que "obra común") y, si aprueba, la
 * guardia queda con el uso que le corresponde a ese tipo. Si la obra no necesita permiso, no
 * hay nada que pedir (409: que la suelte de nuevo).
 *
 * `autoaprobar` (sólo JS, lo controla la ruta): pide y aprueba en la misma llamada, sin
 * avisarse a sí mismo ni publicar en #planificacion un pedido que ya está resuelto.
 */
export async function crearSolicitud(
  sesion: Sesion,
  s: NuevaSolicitud,
): Promise<{ solicitud: SolicitudGuardia; autorizacion: ResultadoAutorizacion | null }> {
  const adm = createAdminClient();
  const [f] = await guardiasPorIds(adm, [s.guardiaId]);
  if (!f) throw new ErrorGuardia(404, { error: "Esa guardia no existe." });
  if (f.guardia_estado !== "activa") throw conflicto("Esa guardia ya no está activa: no hay nada que pedir.");
  if (f.fecha < hoyBA()) throw conflicto("Esa guardia es de un día que ya pasó: no hay nada que pedir.");
  let tipo: TipoSolicitud = s.tipo;
  let otTitulo: string | null = null;
  if (s.tipo !== "sacar") {
    if (!s.pedido) throw new ErrorGuardia(400, { error: "Falta qué obra se quiere poner en la guardia." });
    if (!s.pedido.guardiaIds.includes(s.guardiaId)) {
      throw new ErrorGuardia(400, { error: "El pedido no incluye esa guardia." });
    }
    const prep = await prepararUso(adm, { ...s.pedido, solicitudId: undefined });
    const trabada = decidirUso(prep, null).find((d) => !d.decision.libre)?.decision;
    if (!trabada) throw conflicto("Esta obra puede usar la guardia sin pedir nada: soltala de nuevo con el tablero actualizado.");
    if (trabada.libre || trabada.pide == null) throw conflicto(trabada.libre ? "No hay nada que pedir." : trabada.mensaje);
    if (trabada.pide !== s.tipo) {
      console.warn(`[guardias] el tablero pidió "${s.tipo}" y el candado dice "${trabada.pide}": se guarda el del servidor`);
    }
    tipo = trabada.pide;
    otTitulo = prep.ot.titulo;
  }
  const otId = tipo === "sacar" ? null : (s.pedido?.otId ?? null);
  const { data, error } = await adm
    .from(SOLICITUDES)
    .insert({
      guardia_id: s.guardiaId,
      tipo,
      ot_id: otId,
      ot_titulo: otTitulo,
      motivo: s.motivo.trim(),
      pedido: tipo === "sacar" ? null : { ...s.pedido, solicitudId: undefined },
      pedido_por: sesion.userId,
    })
    .select("id")
    .single();
  if (esDuplicado(error)) {
    let q = adm.from(SOLICITUDES).select("id").eq("guardia_id", s.guardiaId).eq("tipo", tipo).eq("estado", "pendiente");
    q = otId ? q.eq("ot_id", otId) : q.is("ot_id", null);
    const { data: ya } = await q.maybeSingle();
    const existente = ya ? await solicitudCompleta(adm, (ya as { id: string }).id) : null;
    throw conflicto("Ya hay un pedido igual esperando a JS.", { solicitud: existente });
  }
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  await anotar(adm, [{
    guardiaId: s.guardiaId, accion: "pedir", estadoAntes: "activa", estadoDespues: "activa",
    otId, otTitulo, motivo: s.motivo.trim(), solicitudId: id, autorId: sesion.userId,
  }]);

  // JS se autoriza a sí mismo: sin aviso (ni a la campanita ni al canal) y aprobado en el acto.
  if (s.autoaprobar) {
    const autorizacion = await responderSolicitud(sesion, { solicitudId: id, aprobar: true, respuesta: s.motivo.trim() });
    return { solicitud: autorizacion.solicitud, autorizacion };
  }

  // El aviso a JS: en la app siempre; a #planificacion si hay webhook (destacado).
  try {
    const [destinatarios, nombres, sigla] = await Promise.all([
      destinatariosAutoriza(adm),
      nombresDe(adm, [sesion.userId]),
      siglasDe([f.cuadrilla_odoo_id]),
    ]);
    const quien = nombres.get(sesion.userId) || "Planificación";
    const donde = `${diaCorto(f.fecha)} ${sigla(f.cuadrilla_odoo_id)}`;
    await avisarA(adm, "guardia_solicitud", destinatarios, {
      claveBase: `guardia_solicitud:${id}`,
      titulo: `Pedido de autorización: ${ETIQUETA_SOLICITUD[tipo].toLowerCase()} (${donde})`,
      descripcion: `${quien} pide: ${ETIQUETA_SOLICITUD[tipo].toLowerCase()} en la guardia del ${donde}${otTitulo ? ` para ${otTitulo}` : ""}${resumenPedido(s.pedido, tipo)}. Motivo: "${s.motivo.trim()}". Hasta que respondas, la guardia sigue puesta.`,
      enlace: "/planificacion/autorizaciones",
      prioridad: "alta",
    });
  } catch (e) {
    console.error("[guardias] no se pudo avisar el pedido", e);
  }
  return { solicitud: await solicitudCompleta(adm, id), autorizacion: null };
}

/**
 * " (3 jornadas: 1 en la guardia)": lo que JS aprueba además de la guardia. Un pedido puede
 * traer una obra de varios días, y aprobarlo sin saber que se lleva otras dos jornadas a otras
 * celdas es aprobar a ciegas.
 */
function resumenPedido(pedido: PedidoUsoGuardia | undefined, tipo: TipoSolicitud): string {
  if (tipo === "sacar" || !pedido) return "";
  const total = (pedido.crear?.length ?? 0) + (pedido.mover?.length ?? 0);
  if (total <= pedido.guardiaIds.length) return "";
  return ` (${total} jornadas; ${pedido.guardiaIds.length} en guardia${pedido.guardiaIds.length === 1 ? "" : "s"})`;
}

/** DELETE /api/planificacion/guardias/solicitudes: sólo quien pidió y sólo si sigue pendiente. */
export async function cancelarSolicitud(sesion: Sesion, solicitudId: string): Promise<void> {
  const adm = createAdminClient();
  const f = await solicitudPorId(adm, solicitudId);
  if (!f) throw new ErrorGuardia(404, { error: "Ese pedido no existe." });
  if (f.pedido_por !== sesion.userId) throw new ErrorGuardia(403, { error: "Sólo quien hizo el pedido lo puede cancelar." });
  const { data, error } = await adm
    .from(SOLICITUDES)
    .update({ estado: "cancelada" })
    .eq("id", solicitudId)
    .eq("estado", "pendiente")
    .select("id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw conflicto("Ese pedido ya no está pendiente.");
  await anotar(adm, [{ guardiaId: Number(f.guardia_id), accion: "cancelar", otId: f.ot_id, otTitulo: f.ot_titulo, solicitudId, autorId: sesion.userId }]);
}

/**
 * POST /api/planificacion/guardias/autorizar (sólo JS). Rechazar: no pasa nada y quien pidió
 * se entera. Aprobar: se ejecuta lo pedido con la sesión de JS (sacar, o usar la guardia con
 * el pedido guardado). Si no se puede ejecutar solo —la grilla cambió desde que se pidió—, el
 * pedido queda APROBADO Y HABILITADO (`error_ejecucion`) y quien pidió lo usa después
 * soltando la obra de nuevo: el tablero manda el `solicitudId` y el candado lo deja pasar.
 */
export async function responderSolicitud(sesion: Sesion, r: RespuestaSolicitud): Promise<ResultadoAutorizacion> {
  const adm = createAdminClient();
  const f = await solicitudPorId(adm, r.solicitudId);
  if (!f) throw new ErrorGuardia(404, { error: "Ese pedido no existe." });
  if (f.estado !== "pendiente") throw conflicto("Ese pedido ya no está pendiente.");
  const respuesta = r.respuesta?.trim() || null;
  const ahora = new Date().toISOString();
  const { data, error } = await adm
    .from(SOLICITUDES)
    .update({
      estado: r.aprobar ? "aprobada" : "rechazada",
      respondido_por: sesion.userId,
      respondido_at: ahora,
      respuesta,
    })
    .eq("id", f.id)
    .eq("estado", "pendiente")
    .select("id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw conflicto("Ese pedido ya no está pendiente.");
  const guardiaId = Number(f.guardia_id);
  await anotar(adm, [{
    guardiaId, accion: r.aprobar ? "aprobar" : "rechazar", otId: f.ot_id, otTitulo: f.ot_titulo,
    motivo: respuesta, solicitudId: f.id, autorId: sesion.userId,
  }]);

  let ejecutada = false;
  let falla: string | null = null;
  let uso: ResultadoAutorizacion["uso"] = null;
  if (r.aprobar) {
    try {
      if (f.tipo === "sacar") {
        await sacarGuardia(sesion, { guardiaId, motivo: f.motivo }, f.id);
        await adm.from(SOLICITUDES).update({ ejecutada_at: new Date().toISOString() }).eq("id", f.id);
      } else if (f.pedido) {
        const hecho = await usarGuardias(sesion, { ...f.pedido, solicitudId: f.id }, { motivo: `Autorizado por JS: ${f.motivo}`, ejecutaJS: true });
        uso = { ...hecho, guardiaIds: f.pedido.guardiaIds };
      } else {
        throw new Error("El pedido no tiene qué ejecutar.");
      }
      ejecutada = true;
    } catch (e) {
      falla = e instanceof Error ? e.message : String(e);
      const { error: e2 } = await adm.from(SOLICITUDES).update({ error_ejecucion: falla }).eq("id", f.id);
      if (e2) console.error("[guardias] no se pudo anotar por qué no se ejecutó", e2.message);
    }
  }

  // Quien pidió se entera, pase lo que pase. Salvo que sea quien responde (JS autorizando
  // lo suyo): avisarle a JS lo que JS acaba de hacer es ruido en su campanita.
  if (f.pedido_por !== sesion.userId) {
    try {
      const [g] = await guardiasPorIds(adm, [guardiaId]);
      const sigla = await siglasDe(g ? [g.cuadrilla_odoo_id] : []);
      const donde = g ? ` (${diaCorto(g.fecha)} ${sigla(g.cuadrilla_odoo_id)})` : "";
      const que = ETIQUETA_SOLICITUD[f.tipo].toLowerCase();
      const titulo = !r.aprobar
        ? `JS rechazó: ${que}${donde}`
        : ejecutada
          ? `JS aprobó: ${que}${donde}. Ya está hecho`
          : `JS aprobó: ${que}${donde}. Soltala de nuevo`;
      const descripcion = [
        respuesta ? `Respuesta: "${respuesta}".` : null,
        r.aprobar && !ejecutada ? `No se pudo hacer solo (${falla}). Quedó autorizado: volvé a soltar la obra en la guardia.` : null,
        !r.aprobar ? "La guardia sigue puesta." : null,
      ].filter(Boolean).join(" ") || null;
      await avisarA(adm, "guardia_respuesta", [f.pedido_por], {
        claveBase: `guardia_respuesta:${f.id}`,
        titulo,
        descripcion,
        enlace: g ? `/planificacion?fecha=${g.fecha}` : "/planificacion",
        prioridad: r.aprobar && !ejecutada ? "alta" : "media",
      });
    } catch (e) {
      console.error("[guardias] no se pudo avisar la respuesta", e);
    }
  }

  return { solicitud: await solicitudCompleta(adm, f.id), ejecutada, uso };
}

// ─── A quién se avisa ──────────────────────────────────────────────────────────────────

async function perfilesActivos(adm: DB): Promise<{ id: string; permisos: Record<string, string> | null }[]> {
  const { data, error } = await adm.from("user_profiles").select("id, permisos").eq("activo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; permisos: Record<string, string> | null }[];
}

/**
 * "Planificación": las personas activas con planificacion = editar. NO los admin por rol:
 * ellos ya ven todas las alertas, y sumarlos duplicaría la campanita.
 */
export async function destinatariosPlanificacion(adm: DB): Promise<string[]> {
  return (await perfilesActivos(adm)).filter((p) => p.permisos?.planificacion === "editar").map((p) => p.id);
}

/** "JS": las personas activas con el módulo explícito planificacion-autoriza = editar. */
export async function destinatariosAutoriza(adm: DB): Promise<string[]> {
  return (await perfilesActivos(adm)).filter((p) => p.permisos?.["planificacion-autoriza"] === "editar").map((p) => p.id);
}

/**
 * Un aviso a varias personas: UNA FILA POR PERSONA (cada una lo marca leído por su cuenta) y
 * Slack sólo en la primera, para que el canal no reciba el mismo mensaje cinco veces. Sin
 * nadie a quien mandarlo, va a los administradores (ven todas las alertas igual) para que no
 * se pierda. Con la service role: la RLS de `alertas` no deja insertar a cualquiera.
 */
export async function avisarA(
  adm: DB,
  tipo: TipoAlerta,
  destinatarios: readonly string[],
  a: { claveBase: string; titulo: string; descripcion?: string | null; enlace?: string | null; prioridad?: Prioridad },
): Promise<number> {
  const unicos = [...new Set(destinatarios)];
  const comun = { tipo, titulo: a.titulo, descripcion: a.descripcion ?? null, enlace: a.enlace ?? null, prioridad: a.prioridad ?? "media" };
  const alertas: NuevaAlerta[] =
    unicos.length > 0
      ? unicos.map((id, i) => ({ ...comun, clave: `${a.claveBase}:${id}`, destinatarioId: id, espejoSlack: i === 0 }))
      : [{ ...comun, clave: `${a.claveBase}:admin`, destinatarioRol: "admin" }];
  return crearAlertas(adm, alertas);
}

// ─── La semana que viene, para la corrida ──────────────────────────────────────────────

/** Las guardias no sacadas por cuadrilla en las semanas [desde, hasta) (la rotación). */
export async function rotacionEntre(adm: DB, desde: string, hasta: string): Promise<Map<number, number>> {
  const { data, error } = await adm
    .from(TABLA)
    .select("cuadrilla_odoo_id, guardia_estado")
    .eq("tipo", "guardia")
    .gte("guardia_semana", desde)
    .lt("guardia_semana", hasta)
    .neq("guardia_estado", "sacada");
  if (error) throw new Error(error.message);
  const cuenta = new Map<number, number>();
  for (const f of (data ?? []) as { cuadrilla_odoo_id: number }[]) {
    const c = Number(f.cuadrilla_odoo_id);
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return cuenta;
}

/** El lunes de la semana de `hoy` más n semanas. */
export const semanaMas = (hoy: string, n: number) => sumarDias(lunesDe(hoy), 7 * n);

// ─── Lo que comparten las rutas ────────────────────────────────────────────────────────
//
// Los esquemas van acá y no en cada route.ts porque el mismo PedidoUsoGuardia entra por dos
// puertas (usar y pedir autorización) y se ejecuta por una tercera (autorizar): si cada una
// lo validara a su manera, JS podría aprobar algo que "usar" no hubiera aceptado.

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va como AAAA-MM-DD");
const idSchema = z.number().int().positive();

const estadoBloqueSchema = z.object({
  fechas: z.array(fechaSchema),
  cuadrillaId: idSchema.nullable(),
  cuadrillaNombre: z.string().nullable(),
  fraccion: z.number().positive().optional(),
  motivoFija: z.string().nullable().optional(),
  apoyo: z.boolean().optional(),
  intercambio: z.boolean().optional(),
});

export const pedidoUsoSchema = z
  .object({
    guardiaIds: z.array(idSchema).min(1, "falta la guardia").max(6),
    otId: idSchema,
    crear: z
      .array(
        z.object({
          otId: idSchema,
          fecha: fechaSchema,
          cuadrillaId: idSchema.nullable(),
          fraccion: z.enum(VALORES_FRACCION),
          estado: z.enum(["tentativa", "confirmada"]),
          ordenDia: z.number().int().min(0),
          notas: z.string().nullable().optional(),
          apoyo: z.boolean().optional(),
        }),
      )
      .max(60)
      .optional(),
    mover: z
      .array(
        z.object({
          id: idSchema,
          fecha: fechaSchema,
          cuadrillaId: idSchema.nullable().optional(),
          ordenDia: z.number().int().min(0).optional(),
        }),
      )
      .max(60)
      .optional(),
    registro: z
      .object({
        otId: idSchema,
        otTitulo: z.string().nullable(),
        accion: z.enum(["crear", "mover"]),
        antes: estadoBloqueSchema.nullable(),
        despues: estadoBloqueSchema.nullable(),
      })
      .optional(),
    solicitudId: z.string().uuid("la autorización no es válida").optional(),
  })
  .refine((p) => (p.crear?.length ?? 0) + (p.mover?.length ?? 0) > 0, "No hay ninguna jornada para poner en la guardia");

export const motivoSchema = z
  .string()
  .trim()
  .min(3, "Falta el motivo (una línea)")
  .max(300, "El motivo va en una línea (300 caracteres como mucho)");

/** 400 con el campo adelante, como en asignaciones: "Invalid input" a secas no le dice nada a nadie. */
export function cuerpoInvalido(issues: readonly z.core.$ZodIssue[]): NextResponse {
  const detalle = issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message));
  return NextResponse.json({ error: detalle.join(" · ") }, { status: 400 });
}

/** El error de cualquier función de acá, como respuesta. Odoo caído es 502; lo desconocido, 500. */
export function respuestaDeError(e: unknown, donde: string): NextResponse {
  if (e instanceof ErrorGuardia) return NextResponse.json(e.cuerpo, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[guardias] ${donde}`, msg);
  if (e instanceof OdooError) return NextResponse.json({ error: msg }, { status: 502 });
  return NextResponse.json({ error: `No se pudo completar: ${msg}` }, { status: 500 });
}
