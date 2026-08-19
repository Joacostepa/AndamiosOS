// Servicio del Informe de Obra: arma, versiona y persiste.
//
// SOLO server-side. Es el único lugar donde Odoo y Supabase se tocan en este módulo.
//
// Odoo es dueño de los partes, las OTs y los costos; Supabase es dueño del informe, que
// es un derivado CONGELADO. Nadie lo lee desde Odoo.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchLote, fetchVenta, fetchVentasCerradas, ventasReabiertas,
  type LoteCierre, type OtCerrada, type ParteCerrado, type VentaCerrada,
} from "@/lib/odoo/informes-obra";
import { partesTitulo } from "@/lib/tablero/titulo";
import {
  estimadoDe, inconsistenciasDe, paraCotizarDe, sectoresDe, visitasDe, diasEntre,
} from "./calculo";
import type {
  DatosInforme, InformeListado, InformeObra, JornadaInforme, ListadoInformes,
} from "./tipos";

type DB = SupabaseClient;

const COLUMNAS =
  "id, odoo_sale_order_id, version, generado_en, generado_por, estado_costeo, datos, inconsistencias, reabierta_en";

// ─── Armado ─────────────────────────────────────────────────────────────────

/**
 * Arma el informe de UNA venta con datos ya traídos en lote. Pura salvo por el reloj.
 *
 * La dirección sale de parsear el título de la OT: `sale.order` no tiene campo de
 * dirección, y el título trae `Armado · S02348 · Cliente — Av. La Plata 2552, CABA`.
 */
export function armarInforme(venta: VentaCerrada, lote: LoteCierre): {
  datos: DatosInforme;
  inconsistencias: InformeObra["inconsistencias"];
} {
  const ots = lote.otsPorVenta.get(venta.id) ?? [];
  const partes = ots.flatMap((o) => lote.partesPorOt.get(o.id) ?? []);
  const tipoPorOt = new Map(ots.map((o) => [o.id, o.tipo]));

  const jornadas: JornadaInforme[] = partes
    .map((p: ParteCerrado) => ({
      parteId: p.id,
      fecha: p.fecha ?? "",
      cuadrilla: p.cuadrilla,
      tipo: (p.otId ? tipoPorOt.get(p.otId) : null) ?? "otro",
      horasHombre: p.horasHombre,
      fletes: lote.fletesPorParte.get(p.id) ?? 0,
      sector: p.sector,
      // La primera línea de las notas: el relato entero vive ahí, pero en una tabla sólo
      // entra el encabezado.
      nota: p.notas?.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? null,
      fotos: p.fotos,
      incidencias: (lote.incidenciasPorParte.get(p.id) ?? []).length,
      estado: p.estado,
    }))
    .filter((j) => j.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const visitas = visitasDe(jornadas);
  const horasHombreReales = jornadas.reduce((s, j) => s + j.horasHombre, 0);
  const fotos = jornadas.reduce((s, j) => s + j.fotos, 0);

  const economia = {
    facturadoNeto: venta.facturadoNeto,
    costoManoObra: venta.costoManoObra,
    costoFletes: venta.costoFletes,
    costoOperativo: venta.costoOperativo,
    margenContribucion: venta.margenContribucion,
    margenPct: venta.margenPct,
  };

  const desde = visitas[0]?.fecha ?? null;
  const hasta = visitas[visitas.length - 1]?.fecha ?? null;

  const datos: DatosInforme = {
    formato: 1,
    venta: {
      id: venta.id,
      nombre: venta.nombre,
      cliente: venta.cliente,
      direccion: direccionDe(ots),
      tecnico: venta.tecnico,
    },
    periodo: {
      desde,
      hasta,
      dias: desde && hasta ? diasEntre(desde, hasta) : null,
      ots: ots.length,
      partes: jornadas.length,
      visitas: visitas.length,
    },
    // null = "sin estimación previa". Ver estimadoDe: es todo o nada.
    estimado: estimadoDe(
      ots.map((o) => ({ id: o.id, duracionEst: o.duracionEst })),
      visitas.length,
      horasHombreReales,
    ),
    economia,
    jornadas,
    visitas,
    sectores: sectoresDe(jornadas),
    registro: {
      incidencias: partes.flatMap((p) =>
        (lote.incidenciasPorParte.get(p.id) ?? []).map((i) => ({ ...i, fecha: p.fecha })),
      ),
      fotos,
      habilitacionEtapa: ots.find((o) => o.habEtapa)?.habEtapa ?? null,
      habilitacionSemaforo: ots.find((o) => o.habSemaforo)?.habSemaforo ?? null,
    },
    paraCotizar: paraCotizarDe(visitas, jornadas, economia),
  };

  const inconsistencias = inconsistenciasDe({
    estadoCosteo: venta.estadoCosteo,
    jornadas,
    ots: ots.map((o) => ({ id: o.id, duracionEst: o.duracionEst })),
    asignacionesSinParte: ots.reduce((s, o) => s + (lote.asignacionesSinParte.get(o.id) ?? 0), 0),
    economia,
    fotos,
  });

  return { datos, inconsistencias };
}

/** La dirección vive en el título de la OT, no en un campo de la venta. */
function direccionDe(ots: OtCerrada[]): string | null {
  for (const o of ots) {
    const p = partesTitulo(o.titulo);
    if (p.principal?.trim()) return p.principal.trim();
  }
  return null;
}

// ─── Generación ─────────────────────────────────────────────────────────────

export type ResultadoGeneracion = {
  generados: number;
  salteados: number;
  reabiertos: number;
  fallidos: { venta: string; error: string }[];
  cortos: number;
};

/**
 * El cron y el backfill, una sola implementación.
 *
 * `backfill: true` regenera aunque ya exista informe vigente (crea versión nueva); en el
 * modo normal las que ya tienen informe se saltean, que es lo que hace al cron
 * IDEMPOTENTE: correrlo dos veces seguidas no duplica nada.
 *
 * Se escribe con un cliente de SERVICE ROLE: `informes_obra` no tiene política de insert
 * para `authenticated` a propósito — un informe congelado que cualquier sesión puede
 * insertar no es evidencia de nada.
 */
export async function generarInformes(
  db: DB,
  opts: { backfill?: boolean } = {},
): Promise<ResultadoGeneracion> {
  const res: ResultadoGeneracion = {
    generados: 0, salteados: 0, reabiertos: 0, fallidos: [], cortos: 0,
  };

  // 1) Las ventas que cumplen el disparador, hoy.
  const ventas = await fetchVentasCerradas();

  // 2) Reaperturas: informes vigentes cuya venta ya NO cumple el disparador. Se sella la
  //    versión VIEJA —"este informe fue válido hasta acá"— y no se borra nada.
  res.reabiertos = await sellarReaperturas(db, ventas.map((v) => v.id));

  // 3) Las que ya tienen informe vigente se saltean, salvo en backfill.
  const { data: existentes, error } = await db
    .from("informes_obra")
    .select("odoo_sale_order_id")
    .is("reabierta_en", null);
  if (error) throw new Error(error.message);
  const conInforme = new Set((existentes ?? []).map((f) => f.odoo_sale_order_id as number));

  const pendientes = opts.backfill ? ventas : ventas.filter((v) => !conInforme.has(v.id));
  res.salteados = ventas.length - pendientes.length;
  if (pendientes.length === 0) return res;

  // 4) UNA lectura en lote para todas. Acá está la diferencia entre 6 RPCs y 1400.
  const lote = await fetchLote(pendientes);

  for (const venta of pendientes) {
    try {
      const { datos, inconsistencias } = armarInforme(venta, lote);
      await guardarVersion(db, venta, datos, inconsistencias, null);
      res.generados++;
      if (venta.estadoCosteo !== "completo") res.cortos++;
    } catch (e) {
      res.fallidos.push({
        venta: venta.nombre,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return res;
}

/** Regeneración manual de una obra: siempre crea versión nueva, nunca pisa. */
export async function regenerarInforme(
  db: DB,
  saleOrderId: number,
  autorId: string | null,
): Promise<InformeObra> {
  const venta = await fetchVenta(saleOrderId);
  if (!venta) throw new Error(`La venta ${saleOrderId} no existe en Odoo`);

  const lote = await fetchLote([venta]);
  const { datos, inconsistencias } = armarInforme(venta, lote);
  return guardarVersion(db, venta, datos, inconsistencias, autorId);
}

async function guardarVersion(
  db: DB,
  venta: VentaCerrada,
  datos: DatosInforme,
  inconsistencias: InformeObra["inconsistencias"],
  autorId: string | null,
): Promise<InformeObra> {
  const { data: ultima, error: e0 } = await db
    .from("informes_obra")
    .select("version")
    .eq("odoo_sale_order_id", venta.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e0) throw new Error(e0.message);

  const { data, error } = await db
    .from("informes_obra")
    .insert({
      odoo_sale_order_id: venta.id,
      version: (ultima?.version ?? 0) + 1,
      generado_por: autorId,
      estado_costeo: venta.estadoCosteo,
      datos,
      inconsistencias,
    })
    .select(COLUMNAS)
    .single();
  if (error) throw new Error(error.message);
  return mapInforme(data);
}

/**
 * Sella con `reabierta_en` los informes vigentes cuya venta volvió a `Armado`.
 *
 * Va en la versión VIEJA a propósito: la fila sin sellar es siempre la vigente, así la
 * consulta de "el informe actual" es `reabierta_en is null` sin mirar versiones.
 */
async function sellarReaperturas(db: DB, ventasVigentes: number[]): Promise<number> {
  const { data, error } = await db
    .from("informes_obra")
    .select("odoo_sale_order_id")
    .is("reabierta_en", null);
  if (error) throw new Error(error.message);

  const conInforme = [...new Set((data ?? []).map((f) => f.odoo_sale_order_id as number))];
  const vigentes = new Set(ventasVigentes);
  const sospechosas = conInforme.filter((id) => !vigentes.has(id));
  if (sospechosas.length === 0) return 0;

  // Se confirma contra Odoo antes de sellar: que una venta no esté en el listado puede
  // deberse al límite de la consulta, y sellar por eso destruiría el informe vigente.
  const reabiertas = await ventasReabiertas(sospechosas);
  if (reabiertas.size === 0) return 0;

  const { error: e2 } = await db
    .from("informes_obra")
    .update({ reabierta_en: new Date().toISOString() })
    .in("odoo_sale_order_id", [...reabiertas])
    .is("reabierta_en", null);
  if (e2) throw new Error(e2.message);
  return reabiertas.size;
}

// ─── Lectura ────────────────────────────────────────────────────────────────

function mapInforme(f: Record<string, unknown>): InformeObra {
  return {
    id: f.id as string,
    odooSaleOrderId: f.odoo_sale_order_id as number,
    version: f.version as number,
    generadoEn: f.generado_en as string,
    generadoPor: (f.generado_por as string | null) ?? null,
    estadoCosteo: f.estado_costeo as InformeObra["estadoCosteo"],
    datos: f.datos as DatosInforme,
    inconsistencias: (f.inconsistencias ?? []) as InformeObra["inconsistencias"],
    reabiertaEn: (f.reabierta_en as string | null) ?? null,
  };
}

function aListado(i: InformeObra): InformeListado {
  return {
    odooSaleOrderId: i.odooSaleOrderId,
    version: i.version,
    generadoEn: i.generadoEn,
    estadoCosteo: i.estadoCosteo,
    venta: i.datos.venta.nombre,
    cliente: i.datos.venta.cliente,
    direccion: i.datos.venta.direccion,
    cierre: i.datos.periodo.hasta,
    visitas: i.datos.periodo.visitas,
    desvioVisitas: i.datos.estimado?.desvioVisitas ?? null,
    desvioHoras: i.datos.estimado?.desvioHoras ?? null,
    margenPct: i.datos.economia.margenPct,
    facturado: i.datos.economia.facturadoNeto,
    inconsistencias: i.inconsistencias.length,
  };
}

/**
 * La lista, con los contadores de los cuatro chips.
 *
 * Se traen los vigentes de una y se filtra en memoria: son ~278 filas y los contadores
 * dependen del jsonb, que no se puede contar barato con SQL sin índices de expresión.
 */
export async function fetchListado(db: DB): Promise<ListadoInformes> {
  const { data, error } = await db
    .from("informes_obra")
    .select(COLUMNAS)
    .is("reabierta_en", null)
    .order("generado_en", { ascending: false });
  if (error) throw new Error(error.message);

  const informes = (data ?? []).map(mapInforme).map(aListado);
  const desviado = (i: InformeListado) =>
    (i.desvioVisitas !== null && Math.abs(i.desvioVisitas) > 50) ||
    (i.desvioHoras !== null && Math.abs(i.desvioHoras) > 50);

  return {
    informes: informes.sort((a, b) => (b.cierre ?? "").localeCompare(a.cierre ?? "")),
    conteos: {
      todas: informes.length,
      inconsistencias: informes.filter((i) => i.inconsistencias > 0).length,
      mal_costeadas: informes.filter((i) => i.estadoCosteo !== "completo").length,
      desvio: informes.filter(desviado).length,
    },
  };
}

/** El informe vigente de una obra, más las versiones disponibles. */
export async function fetchInforme(
  db: DB,
  saleOrderId: number,
  version?: number,
): Promise<{ informe: InformeObra; versiones: number[] } | null> {
  const { data, error } = await db
    .from("informes_obra")
    .select(COLUMNAS)
    .eq("odoo_sale_order_id", saleOrderId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const todas = data.map(mapInforme);
  const informe = version ? todas.find((i) => i.version === version) : todas[0];
  if (!informe) return null;

  return { informe, versiones: todas.map((i) => i.version) };
}
