// Lectura de Odoo para el Informe de Obra.
//
// SOLO server-side. Se consume desde /api/informes-obra/*.
//
// ─────────────────────────────────────────────────────────────────────────────
// TODO SE LEE POR LOTE, NUNCA POR OBRA.
//
// Cada RPC a Odoo Online tarda ~800 ms sin importar la concurrencia (ver el comentario
// de rate limiting en client.ts). Resolver 278 obras de a una serían ~1400 llamadas: 18
// minutos y 429 garantizado. Acá se traen las ventas y TODAS sus dependencias en 6
// searchRead con dominios `in`, y los informes se arman en memoria.
//
// El costo de eso es que hay que hacer los joins a mano con Maps. Vale la pena.
// ─────────────────────────────────────────────────────────────────────────────
//
// EL MÓDULO NO ESCRIBE NADA EN ODOO. Los campos económicos son computados y store=true,
// encadenados hasta las facturas: escribir uno lo pisa hasta el próximo recálculo y deja
// el número inconsistente con la facturación. Este archivo no exporta ningún write.

import { searchRead, read } from "./client";
import type { EstadoCosteo } from "@/lib/informes-obra/tipos";

type M2O = [number, string] | false;

const m2oId = (v: M2O | undefined) => (Array.isArray(v) ? v[0] : null);
const m2oName = (v: M2O | undefined) => (Array.isArray(v) ? v[1] : null);
const str = (v: string | false | null | undefined) =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const num = (v: number | false | null | undefined) => (typeof v === "number" ? v : 0);

const VENTA = "sale.order";
const OT = "x_aba_orden_trabajo";
const PARTE = "x_aba_parte_diario";

/**
 * El disparador. Las dos condiciones del diseño más el estado de la venta.
 *
 * `'Obra '` VA CON EL ESPACIO AL FINAL: es el valor real del selection en Odoo, y
 * comparar contra `'Obra'` no matchea ninguna de las 611. Odoo no tiene `trim` en los
 * dominios, así que la normalización es literal acá.
 *
 * `state in ('sale','done')`: una cotización en borrador no tiene obra que analizar.
 */
export const DOMINIO_CERRADAS = [
  ["state", "in", ["sale", "done"]],
  ["x_studio_estado_de_obra", "=", "Desarmado"],
  ["x_studio_tipo_de_contrato", "=", "Obra "],
];

const CAMPOS_VENTA = [
  "name", "partner_id", "state", "x_studio_estado_de_obra", "x_studio_tipo_de_contrato",
  "x_estado_costeo", "x_studio_tcnico",
  "x_facturado_neto", "x_costo_mano_obra", "x_costo_fletes", "x_costo_operativo",
  "x_margen_contribucion", "x_margen_pct",
];

const CAMPOS_OT = [
  "x_name", "x_tipo", "x_order_id", "x_duracion_est", "x_hab_etapa", "x_hab_semaforo",
];

const CAMPOS_PARTE = [
  "x_fecha", "x_orden_trabajo_id", "x_cuadrilla_id", "x_horas_hombre", "x_sector",
  "x_notas", "x_cant_fotos", "x_estado",
];

export type VentaCerrada = {
  id: number;
  nombre: string;
  cliente: string | null;
  tecnico: string | null;
  estadoCosteo: EstadoCosteo;
  facturadoNeto: number;
  costoManoObra: number;
  costoFletes: number;
  costoOperativo: number;
  margenContribucion: number;
  margenPct: number;
};

export type OtCerrada = {
  id: number;
  ventaId: number | null;
  titulo: string;
  tipo: string;
  duracionEst: string | null;
  habEtapa: string | null;
  habSemaforo: string | null;
};

export type ParteCerrado = {
  id: number;
  otId: number | null;
  fecha: string | null;
  cuadrilla: string | null;
  horasHombre: number;
  sector: string | null;
  notas: string | null;
  fotos: number;
  estado: string | null;
};

/** Todo lo que hace falta para armar N informes, ya joineado por venta. */
export type LoteCierre = {
  ventas: VentaCerrada[];
  otsPorVenta: Map<number, OtCerrada[]>;
  partesPorOt: Map<number, ParteCerrado[]>;
  fletesPorParte: Map<number, number>;
  incidenciasPorParte: Map<number, { tipo: string; descripcion: string }[]>;
  /** Asignaciones del tablero ya vencidas y sin parte, por OT. */
  asignacionesSinParte: Map<number, number>;
};

function mapVenta(v: Record<string, unknown>): VentaCerrada {
  return {
    id: v.id as number,
    nombre: str(v.name as string | false) ?? `Venta ${v.id}`,
    cliente: m2oName(v.partner_id as M2O),
    tecnico: m2oName(v.x_studio_tcnico as M2O),
    estadoCosteo: (str(v.x_estado_costeo as string | false) ?? "pendiente") as EstadoCosteo,
    facturadoNeto: num(v.x_facturado_neto as number | false),
    costoManoObra: num(v.x_costo_mano_obra as number | false),
    costoFletes: num(v.x_costo_fletes as number | false),
    costoOperativo: num(v.x_costo_operativo as number | false),
    margenContribucion: num(v.x_margen_contribucion as number | false),
    margenPct: num(v.x_margen_pct as number | false),
  };
}

/** Las ventas que cumplen el disparador. Sin `ids` trae todas. */
export async function fetchVentasCerradas(ids?: number[]): Promise<VentaCerrada[]> {
  const dominio = ids?.length ? [...DOMINIO_CERRADAS, ["id", "in", ids]] : DOMINIO_CERRADAS;
  const filas = await searchRead<Record<string, unknown>>(VENTA, dominio, CAMPOS_VENTA, {
    order: "id desc",
    limit: 2000,
  });
  return filas.map(mapVenta);
}

/**
 * Una venta puntual, SIN el filtro del disparador.
 *
 * La usa la regeneración manual: si alguien corrige los datos de una obra y pide
 * regenerar, tiene que poder hacerlo aunque la venta ya no esté en `Desarmado` — por
 * ejemplo mientras está reabierta.
 */
export async function fetchVenta(id: number): Promise<VentaCerrada | null> {
  const filas = await read<Record<string, unknown>>(VENTA, [id], CAMPOS_VENTA);
  return filas[0] ? mapVenta(filas[0]) : null;
}

/** Los ids de venta que YA NO cumplen el disparador, de un conjunto dado. */
export async function ventasReabiertas(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const siguen = await searchRead<{ id: number }>(
    VENTA, [...DOMINIO_CERRADAS, ["id", "in", ids]], ["id"], { limit: ids.length },
  );
  const vigentes = new Set(siguen.map((v) => v.id));
  return new Set(ids.filter((id) => !vigentes.has(id)));
}

/**
 * El lote completo para un conjunto de ventas: 5 lecturas, no 5 × N.
 *
 * El orden importa: cada paso necesita los ids del anterior para armar su dominio `in`.
 * Dentro de cada paso no hay nada que paralelizar porque es una sola llamada.
 */
export async function fetchLote(ventas: VentaCerrada[]): Promise<LoteCierre> {
  const vacio: LoteCierre = {
    ventas, otsPorVenta: new Map(), partesPorOt: new Map(), fletesPorParte: new Map(),
    incidenciasPorParte: new Map(), asignacionesSinParte: new Map(),
  };
  if (ventas.length === 0) return vacio;

  // 1) Todas las OTs de todas las ventas.
  const ventaIds = ventas.map((v) => v.id);
  const otsRaw = await searchRead<Record<string, unknown>>(
    OT, [["x_order_id", "in", ventaIds]], CAMPOS_OT, { limit: 5000 },
  );
  const ots: OtCerrada[] = otsRaw.map((o) => ({
    id: o.id as number,
    ventaId: m2oId(o.x_order_id as M2O),
    titulo: str(o.x_name as string | false) ?? `OT ${o.id}`,
    tipo: str(o.x_tipo as string | false) ?? "otro",
    duracionEst: str(o.x_duracion_est as string | false),
    habEtapa: str(o.x_hab_etapa as string | false),
    habSemaforo: str(o.x_hab_semaforo as string | false),
  }));

  const otsPorVenta = new Map<number, OtCerrada[]>();
  for (const o of ots) {
    if (!o.ventaId) continue;
    otsPorVenta.set(o.ventaId, [...(otsPorVenta.get(o.ventaId) ?? []), o]);
  }

  const otIds = ots.map((o) => o.id);
  if (otIds.length === 0) return { ...vacio, otsPorVenta };

  // 2) Todos los partes de todas esas OTs. El vínculo es x_orden_trabajo_id, cargado en
  //    los 1276 partes — no x_aba_asignacion, que sólo cubre lo planificado desde el
  //    tablero y deja afuera todo el histórico importado.
  const partesRaw = await searchRead<Record<string, unknown>>(
    PARTE, [["x_orden_trabajo_id", "in", otIds]], CAMPOS_PARTE,
    { order: "x_fecha, id", limit: 5000 },
  );
  const partes: ParteCerrado[] = partesRaw.map((p) => ({
    id: p.id as number,
    otId: m2oId(p.x_orden_trabajo_id as M2O),
    fecha: str(p.x_fecha as string | false),
    cuadrilla: m2oName(p.x_cuadrilla_id as M2O),
    horasHombre: num(p.x_horas_hombre as number | false),
    sector: str(p.x_sector as string | false),
    notas: str(p.x_notas as string | false),
    fotos: num(p.x_cant_fotos as number | false),
    estado: str(p.x_estado as string | false),
  }));

  const partesPorOt = new Map<number, ParteCerrado[]>();
  for (const p of partes) {
    if (!p.otId) continue;
    partesPorOt.set(p.otId, [...(partesPorOt.get(p.otId) ?? []), p]);
  }

  const parteIds = partes.map((p) => p.id);

  // 3, 4, 5) Fletes, incidencias y asignaciones huérfanas. Independientes entre sí, así
  //    que van juntas — la cola de client.ts las serializa según el límite de Odoo.
  const [fletes, incidencias, asignaciones] = await Promise.all([
    parteIds.length
      ? searchRead<{ x_parte_diario_id: M2O; x_cantidad: number | false }>(
          "x_aba_flete", [["x_parte_diario_id", "in", parteIds]],
          ["x_parte_diario_id", "x_cantidad"], { limit: 5000 },
        )
      : Promise.resolve([]),
    parteIds.length
      ? searchRead<{ x_parte_diario_id: M2O; x_tipo: string | false; x_descripcion: string | false }>(
          "x_aba_incidencia", [["x_parte_diario_id", "in", parteIds]],
          ["x_parte_diario_id", "x_tipo", "x_descripcion"], { limit: 5000 },
        )
      : Promise.resolve([]),
    searchRead<{ x_ot_id: M2O; x_parte_id: M2O; x_fecha: string | false }>(
      "x_aba_asignacion", [["x_ot_id", "in", otIds], ["x_parte_id", "=", false]],
      ["x_ot_id", "x_parte_id", "x_fecha"], { limit: 5000 },
    ),
  ]);

  const fletesPorParte = new Map<number, number>();
  for (const f of fletes) {
    const pid = m2oId(f.x_parte_diario_id);
    if (!pid) continue;
    fletesPorParte.set(pid, (fletesPorParte.get(pid) ?? 0) + (num(f.x_cantidad) || 1));
  }

  const incidenciasPorParte = new Map<number, { tipo: string; descripcion: string }[]>();
  for (const i of incidencias) {
    const pid = m2oId(i.x_parte_diario_id);
    if (!pid) continue;
    incidenciasPorParte.set(pid, [
      ...(incidenciasPorParte.get(pid) ?? []),
      { tipo: str(i.x_tipo) ?? "otro", descripcion: str(i.x_descripcion) ?? "" },
    ]);
  }

  // Jornadas que se planificaron, ya pasaron y nunca recibieron parte: esas horas se
  // trabajaron y no entraron al costo. Es la inconsistencia que más plata mueve.
  const asignacionesSinParte = new Map<number, number>();
  for (const a of asignaciones) {
    const otId = m2oId(a.x_ot_id);
    if (!otId) continue;
    asignacionesSinParte.set(otId, (asignacionesSinParte.get(otId) ?? 0) + 1);
  }

  return { ventas, otsPorVenta, partesPorOt, fletesPorParte, incidenciasPorParte, asignacionesSinParte };
}
