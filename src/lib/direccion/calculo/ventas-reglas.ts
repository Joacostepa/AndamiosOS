// Reglas PURAS de Ventas (sin red, sin Next): períodos del selector, facturado neto, notas de
// crédito reales, banda de ritmo, clasificación de renglones (nuevo / renovación / …),
// resultado de gestión por rubro y lo comercial (confirmaciones, cotizado vivo, conversión).
// Las usa calculo/ventas.ts y las prueba ventas-reglas.test.ts.
//
// Fuentes: Odoo-Claude/direccion/datos/comercial_definiciones.md (§1–§5) y
// finanzas_definiciones.md (§6), y la lógica de la maqueta (rango, moverPer, rangoComparado,
// bandaRitmo). Nada de cifras del snapshot: todo sale de los datos que se pasan.

import { MES_C, MES_NOM, diasEntre, finMes, flarga, fcorta, sumarDias } from "../formato.ts";
import { iibbFaltante } from "./pyg-reglas.ts";

/** La operación en Odoo empieza acá: lo anterior son asientos de apertura y pruebas. */
export const INICIO_ODOO = "2025-11-01";

const titulo = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const suma = <T,>(xs: readonly T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);

// ─── Períodos (selector de Ventas, §7.2) ────────────────────────────────────────────────

export type Gran = "semana" | "mes" | "trimestre" | "anio" | "pers";
export type Vs = "anterior" | "anioAnterior" | "promedio6";
/** ref: 'AAAA-MM' (mes), 'AAAA-Qn' (trimestre), 'AAAA' (año), lunes 'AAAA-MM-DD' (semana). */
export type Periodo = { g: Gran; ref: string; desde?: string; hasta?: string };

export type Rango = {
  desde: string;
  /** Hasta hoy si está en curso. */
  hasta: string;
  /** Fin natural del período. */
  finNat: string;
  enCurso: boolean;
  etq: string;
  transcurridos: number;
  total: number;
  recortadoInicio: boolean;
};

const esFecha = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const lunes = (s: string) => sumarDias(s, -((new Date(`${s}T12:00:00Z`).getUTCDay() + 6) % 7));

/** Período y comparación desde los parámetros de la URL. Lo inválido vuelve al mes en curso. */
export function periodoDeParams(params: Record<string, string>, hoy: string): { per: Periodo; vs: Vs } {
  const g = (["semana", "mes", "trimestre", "anio", "pers"] as const).find((x) => x === params.g) ?? "mes";
  let per: Periodo;
  const p = params.p ?? "";
  if (g === "mes") per = { g, ref: /^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? p : hoy.slice(0, 7) };
  else if (g === "trimestre") per = { g, ref: /^\d{4}-Q[1-4]$/.test(p) ? p : `${hoy.slice(0, 4)}-Q${Math.ceil(Number(hoy.slice(5, 7)) / 3)}` };
  else if (g === "anio") per = { g, ref: /^\d{4}$/.test(p) ? p : hoy.slice(0, 4) };
  else if (g === "semana") per = { g, ref: esFecha(p) ? lunes(p) : lunes(hoy) };
  else {
    const desde = esFecha(params.desde) ? params.desde : `${hoy.slice(0, 7)}-01`;
    const hasta = esFecha(params.hasta) ? params.hasta : hoy;
    per = desde <= hasta ? { g, ref: "", desde, hasta } : { g, ref: "", desde: hasta, hasta: desde };
  }
  if (!perValido(per, hoy)) per = { g: "mes", ref: hoy.slice(0, 7) };
  let vs: Vs = params.vs === "promedio6" || params.vs === "anioAnterior" ? params.vs : "anterior";
  if (vs === "promedio6" && per.g !== "mes") vs = "anterior";
  return { per, vs };
}

/** Los parámetros de URL de un período (para los links del selector y del gráfico). */
export function paramsDePeriodo(per: Periodo, vs: Vs): Record<string, string> {
  const q: Record<string, string> = { g: per.g };
  if (per.g === "pers") { q.desde = per.desde!; q.hasta = per.hasta!; } else q.p = per.ref;
  if (vs !== "anterior") q.vs = vs;
  return q;
}

export function rango(per: Periodo, hoy: string): Rango {
  let desde: string, finNat: string, etq: string;
  if (per.g === "mes") {
    desde = `${per.ref}-01`; finNat = finMes(per.ref);
    etq = `${titulo(MES_NOM[Number(per.ref.slice(5)) - 1])} ${per.ref.slice(0, 4)}`;
  } else if (per.g === "trimestre") {
    const [y, q] = per.ref.split("-Q").map(Number);
    desde = `${y}-${String(q * 3 - 2).padStart(2, "0")}-01`; finNat = finMes(`${y}-${String(q * 3).padStart(2, "0")}`);
    etq = `${q}.º trimestre ${y}`;
  } else if (per.g === "anio") {
    desde = `${per.ref}-01-01`; finNat = `${per.ref}-12-31`; etq = `Año ${per.ref}`;
  } else if (per.g === "semana") {
    desde = per.ref; finNat = sumarDias(per.ref, 6); etq = `Semana del ${fcorta(desde)} al ${fcorta(finNat)}`;
  } else {
    desde = per.desde!; finNat = per.hasta!; etq = `${flarga(desde)} → ${flarga(finNat)}`;
  }
  const hasta = finNat > hoy ? hoy : finNat;
  return {
    desde, hasta, finNat, etq,
    enCurso: finNat > hoy && desde <= hoy,
    transcurridos: diasEntre(desde, hasta) + 1,
    total: diasEntre(desde, finNat) + 1,
    recortadoInicio: desde < INICIO_ODOO,
  };
}

export function moverPer(per: Periodo, n: number): Periodo {
  const p = { ...per };
  if (p.g === "mes") {
    const [y, m] = p.ref.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    p.ref = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  } else if (p.g === "trimestre") {
    let [y, q] = p.ref.split("-Q").map(Number);
    q += n;
    while (q > 4) { q -= 4; y++; }
    while (q < 1) { q += 4; y--; }
    p.ref = `${y}-Q${q}`;
  } else if (p.g === "anio") p.ref = String(Number(p.ref) + n);
  else if (p.g === "semana") p.ref = sumarDias(p.ref, 7 * n);
  else {
    const largo = diasEntre(p.desde!, p.hasta!) + 1;
    p.desde = sumarDias(p.desde!, largo * n);
    p.hasta = sumarDias(p.hasta!, largo * n);
  }
  return p;
}

/** Un período se puede elegir si toca algún día con datos y no empieza en el futuro. */
export function perValido(per: Periodo, hoy: string): boolean {
  const r = rango(per, hoy);
  return r.finNat >= INICIO_ODOO && r.desde <= hoy;
}

export type Comparado =
  | { tipo: "sd"; motivo: string; etq: string }
  | { tipo: "promedio"; rangos: { desde: string; hasta: string }[]; etq: string }
  | { tipo: "rango"; desde: string; hasta: string; etq: string; /** Fin natural del período anterior. */ finNat: string };

/** Contra qué se compara (§7.2). Sin historia: sin dato con el motivo, nunca 0. */
export function rangoComparado(per: Periodo, vs: Vs, hoy: string): Comparado {
  const r = rango(per, hoy);
  if (vs === "anioAnterior") {
    const desdeAnio = sumarDias(r.desde, -365);
    if (desdeAnio < INICIO_ODOO) {
      const disponible = `${MES_NOM[Number(INICIO_ODOO.slice(5, 7)) - 1]} ${Number(INICIO_ODOO.slice(0, 4)) + 1}`;
      return { tipo: "sd", motivo: `Disponible desde ${disponible}: la operación en Odoo empieza en ${mesCorto(INICIO_ODOO)}.`, etq: "año anterior" };
    }
    const pa = { ...per };
    if (per.g === "mes") pa.ref = `${Number(per.ref.slice(0, 4)) - 1}${per.ref.slice(4)}`;
    else if (per.g === "trimestre") pa.ref = `${Number(per.ref.slice(0, 4)) - 1}${per.ref.slice(4)}`;
    else if (per.g === "anio") pa.ref = String(Number(per.ref) - 1);
    else if (per.g === "semana") pa.ref = sumarDias(per.ref, -364);
    else { pa.desde = sumarDias(per.desde!, -365); pa.hasta = sumarDias(per.hasta!, -365); }
    const ra = rango(pa, hoy);
    const hasta = r.enCurso ? sumarDias(ra.desde, Math.min(r.transcurridos, ra.total) - 1) : ra.finNat;
    return { tipo: "rango", desde: ra.desde, hasta, finNat: ra.finNat, etq: r.enCurso ? "a igual día del año anterior" : "vs año anterior" };
  }
  if (vs === "promedio6") {
    if (per.g !== "mes") return { tipo: "sd", motivo: "El promedio de 6 períodos está disponible para meses.", etq: "promedio 6 meses" };
    const ant: { desde: string; hasta: string }[] = [];
    for (let i = 1; i <= 6; i++) {
      const rr = rango(moverPer(per, -i), hoy);
      if (rr.desde < INICIO_ODOO) break;
      ant.push({ desde: rr.desde, hasta: r.enCurso ? sumarDias(rr.desde, Math.min(r.transcurridos, rr.total) - 1) : rr.finNat });
    }
    if (!ant.length) return { tipo: "sd", motivo: `Sin meses anteriores: la operación empieza en ${mesCorto(INICIO_ODOO)}.`, etq: "promedio 6 meses" };
    const etq = `promedio de ${ant.length === 6 ? "los últimos 6 meses" : `${ant.length} meses (hay datos desde ${mesCorto(INICIO_ODOO)})`}${r.enCurso ? " a igual día" : ""}`;
    return { tipo: "promedio", rangos: ant, etq };
  }
  const rp = rango(moverPer(per, -1), hoy);
  if (rp.desde < INICIO_ODOO) {
    return { tipo: "sd", motivo: `Sin datos de ${rp.etq.toLowerCase()}: la operación en Odoo empieza en ${mesCorto(INICIO_ODOO)}.`, etq: "período anterior" };
  }
  if (r.enCurso || per.g === "pers") {
    const hasta = sumarDias(rp.desde, Math.min(r.transcurridos, rp.total) - 1);
    const etq = per.g === "pers" ? "mismo largo inmediatamente anterior" : `a igual día ${per.g === "mes" ? MES_C[Number(rp.desde.slice(5, 7)) - 1] : "del período anterior"}`;
    return { tipo: "rango", desde: rp.desde, hasta, finNat: rp.finNat, etq };
  }
  const etq = `vs ${per.g === "mes" ? MES_C[Number(rp.desde.slice(5, 7)) - 1] : per.g === "semana" ? "semana anterior" : per.g === "trimestre" ? "trimestre anterior" : "año anterior"}`;
  return { tipo: "rango", desde: rp.desde, hasta: rp.finNat, finNat: rp.finNat, etq };
}

/** "nov-2025". */
export const mesCorto = (iso: string) => `${MES_C[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`;

/** Meses 'AAAA-MM' enteros dentro del rango [desde, finNat] (desde INICIO_ODOO). */
export function mesesCompletos(desde: string, finNat: string): string[] {
  const salida: string[] = [];
  let ym = (desde < INICIO_ODOO ? INICIO_ODOO : desde).slice(0, 7);
  while (`${ym}-01` <= finNat) {
    if (`${ym}-01` >= desde && finMes(ym) <= finNat) salida.push(ym);
    const [y, m] = ym.split("-").map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return salida;
}

/** Los meses de los últimos 12 (o desde el inicio), terminando en el de `hoy`. */
export function ultimos12(hoy: string): string[] {
  const salida: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const ref = moverPer({ g: "mes", ref: hoy.slice(0, 7) }, -i).ref;
    if (`${ref}-01` >= INICIO_ODOO.slice(0, 7) + "-01") salida.push(ref);
  }
  return salida;
}

// ─── Facturado neto ─────────────────────────────────────────────────────────────────────

/** Un comprobante de venta posteado (factura o NC), sin IVA, con su dólar. */
export type Doc = {
  id: number;
  fecha: string;
  /** amount_untaxed_signed: las NC vienen negativas. */
  ars: number;
  /** ars al dólar de su fecha; null si no hay cotización. */
  usd: number | null;
  nc: boolean;
  /** commercial_partner_id. */
  cli: number;
  nombre: string;
  /** reversed_entry_id (la factura que anula la NC). */
  rev: number | null;
};

export type Facturado = {
  ars: number;
  usd: number;
  n: number;
  nFact: number;
  nNc: number;
  brutoArs: number;
  brutoUsd: number;
  /** Positivo. */
  ncArs: number;
  ncUsd: number;
  /** Comprobantes sin cotización del dólar (no suman a usd). */
  sinTc: number;
};

export function docsEntre(docs: readonly Doc[], desde: string, hasta: string): Doc[] {
  return docs.filter((d) => d.fecha >= desde && d.fecha <= hasta);
}

export function facturado(docs: readonly Doc[], desde: string, hasta: string, sinCliente?: number): Facturado {
  const rows = docsEntre(docs, desde, hasta).filter((d) => sinCliente == null || d.cli !== sinCliente);
  const brutas = rows.filter((d) => !d.nc);
  const ncs = rows.filter((d) => d.nc);
  return {
    ars: suma(rows, (d) => d.ars),
    usd: suma(rows, (d) => d.usd),
    n: rows.length,
    nFact: brutas.length,
    nNc: ncs.length,
    brutoArs: suma(brutas, (d) => d.ars),
    brutoUsd: suma(brutas, (d) => d.usd),
    ncArs: -suma(ncs, (d) => d.ars),
    ncUsd: -suma(ncs, (d) => d.usd),
    sinTc: rows.filter((d) => d.usd == null).length,
  };
}

/** Variación % (actual − anterior) / |anterior|. null si no hay base. */
export function variacion(actual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || !Number.isFinite(anterior) || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

/** El facturado del período de comparación (un rango o el promedio de varios). */
export function facturadoComparado(docs: readonly Doc[], c: Comparado, sinCliente?: number): { ars: number; usd: number; f?: Facturado } | null {
  if (c.tipo === "sd") return null;
  if (c.tipo === "promedio") {
    const v = c.rangos.map((r) => facturado(docs, r.desde, r.hasta, sinCliente));
    return { ars: suma(v, (x) => x.ars) / v.length, usd: suma(v, (x) => x.usd) / v.length };
  }
  const f = facturado(docs, c.desde, c.hasta, sinCliente);
  return { ars: f.ars, usd: f.usd, f };
}

// ─── Cuota mensual salteada ─────────────────────────────────────────────────────────────

export type CuotaSalteada = { cli: number; mes: string; cuota: number; despues: { mes: string; facturas: number } };

/**
 * Un cliente que factura todos los meses y en un mes cerrado no tiene ninguna factura, pero en
 * los meses siguientes tiene dos o más: la cuota de ese mes se facturó después (refacturación,
 * atraso). Por la fecha, ese mes queda corto y el siguiente inflado. Se avisa, no se corrige
 * el número (como la maqueta: "septiembre queda sin la cuota del Ministerio").
 *
 * Revisa los `cuantos` últimos meses cerrados. "Factura todos los meses" = alguna factura en
 * cada uno de los 3 meses anteriores. La cuota estimada es la mediana de esos 3 meses.
 */
export function cuotasSalteadas(docs: readonly Doc[], hoy: string, cuantos = 2): CuotaSalteada[] {
  const mesActual = hoy.slice(0, 7);
  const mes = (n: number) => moverPer({ g: "mes", ref: mesActual }, n).ref;
  // cliente → mes → [cantidad de facturas, suma]
  const porCli = new Map<number, Map<string, { n: number; ars: number }>>();
  for (const d of docs) {
    if (d.nc || !(d.ars > 0) || d.fecha > hoy) continue;
    const m = d.fecha.slice(0, 7);
    const del = porCli.get(d.cli) ?? porCli.set(d.cli, new Map()).get(d.cli)!;
    const x = del.get(m) ?? { n: 0, ars: 0 };
    x.n++; x.ars += d.ars;
    del.set(m, x);
  }
  const salida: CuotaSalteada[] = [];
  for (let k = 1; k <= cuantos; k++) {
    const g = mes(-k);
    const previos = [mes(-k - 3), mes(-k - 2), mes(-k - 1)];
    const despues = Array.from({ length: k }, (_, i) => mes(-k + 1 + i));
    for (const [cli, del] of porCli) {
      if (del.has(g) || !previos.every((m) => (del.get(m)?.n ?? 0) > 0)) continue;
      const n = despues.reduce((a, m) => a + (del.get(m)?.n ?? 0), 0);
      if (n < 2) continue;
      const cuota = mediana(previos.map((m) => del.get(m)!.ars))!;
      const ultimoConFacturas = [...despues].reverse().find((m) => (del.get(m)?.n ?? 0) > 0)!;
      salida.push({ cli, mes: g, cuota, despues: { mes: ultimoConFacturas, facturas: n } });
    }
  }
  return salida.sort((a, b) => b.cuota - a.cuota);
}

// ─── Notas de crédito reales y refacturadas (§1.3) ─────────────────────────────────────

/** Tolerancia del emparejamiento: mismo cliente, ±15 % del monto, factura 0–10 días después. */
export const NC_TOLERANCIA = 0.15;
export const NC_DIAS = 10;

/**
 * Qué NC se refacturaron ("probable refacturación"): para cada NC (por fecha), la factura del
 * mismo cliente más parecida en monto, emitida entre 0 y 10 días después, con diferencia
 * menor al 15 % y distinta de la que la NC anula. Cada factura empareja una sola NC.
 * Devuelve id de NC → id de la factura que la reemplaza.
 */
export function emparejarNC(docs: readonly Doc[]): Map<number, number> {
  const porCliente = new Map<number, Doc[]>();
  for (const d of docs) if (!d.nc) (porCliente.get(d.cli) ?? porCliente.set(d.cli, []).get(d.cli)!).push(d);
  const usadas = new Set<number>();
  const salida = new Map<number, number>();
  const ncs = docs.filter((d) => d.nc).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  for (const n of ncs) {
    const monto = -n.ars;
    if (!(monto > 0)) continue;
    let mejor: Doc | null = null;
    for (const f of porCliente.get(n.cli) ?? []) {
      if (usadas.has(f.id) || f.id === n.rev) continue;
      const dias = diasEntre(n.fecha, f.fecha);
      if (dias < 0 || dias > NC_DIAS) continue;
      const dif = Math.abs(f.ars - monto);
      if (dif / monto >= NC_TOLERANCIA) continue;
      if (!mejor || dif < Math.abs(mejor.ars - monto) || (dif === Math.abs(mejor.ars - monto) && f.fecha < mejor.fecha)) mejor = f;
    }
    if (mejor) { usadas.add(mejor.id); salida.set(n.id, mejor.id); }
  }
  return salida;
}

export type NotasCredito = {
  brutoArs: number;
  brutoUsd: number;
  totalArs: number;
  totalUsd: number;
  realesArs: number;
  realesUsd: number;
  refactArs: number;
  refactUsd: number;
  /** Reales ÷ facturas brutas, en % (null sin facturas). */
  pctReales: number | null;
  pctBrutas: number | null;
};

export function notasCredito(docs: readonly Doc[], refact: ReadonlyMap<number, number>, desde: string, hasta: string): NotasCredito {
  const rows = docsEntre(docs, desde, hasta);
  const brutas = rows.filter((d) => !d.nc);
  const ncs = rows.filter((d) => d.nc);
  const re = ncs.filter((d) => refact.has(d.id));
  const reales = ncs.filter((d) => !refact.has(d.id));
  const brutoArs = suma(brutas, (d) => d.ars);
  const totalArs = -suma(ncs, (d) => d.ars);
  const realesArs = -suma(reales, (d) => d.ars);
  return {
    brutoArs,
    brutoUsd: suma(brutas, (d) => d.usd),
    totalArs,
    totalUsd: -suma(ncs, (d) => d.usd),
    realesArs,
    realesUsd: -suma(reales, (d) => d.usd),
    refactArs: -suma(re, (d) => d.ars),
    refactUsd: -suma(re, (d) => d.usd),
    pctReales: brutoArs > 0 ? (realesArs / brutoArs) * 100 : null,
    pctBrutas: brutoArs > 0 ? (totalArs / brutoArs) * 100 : null,
  };
}

// ─── Banda de ritmo (§5.2) ──────────────────────────────────────────────────────────────

export type Banda = {
  dia: number;
  actualArs: number;
  actualUsd: number;
  /** Cocientes total / parcial al mismo día usados (2.º y 5.º de 6). */
  rLo: number;
  rHi: number;
  minArs: number;
  maxArs: number;
  minUsd: number;
  maxUsd: number;
  meses: number;
};

/**
 * Con los últimos 6 meses cerrados: cuánto terminaron respecto de lo que llevaban al mismo
 * día. Se descartan el más alto y el más bajo (2.º y 5.º de 6) y ese rango se aplica a lo que
 * lleva el mes en curso. Sin proyección lineal. Los cocientes salen de la serie en USD (en
 * pesos la inflación los estira). null si el mes no está en curso o no hay meses anteriores.
 */
export function bandaRitmo(docs: readonly Doc[], mes: string, hoy: string): Banda | null {
  const r = rango({ g: "mes", ref: mes }, hoy);
  if (!r.enCurso) return null;
  const actual = facturado(docs, r.desde, r.hasta);
  const n = r.transcurridos;
  const ratios: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const m = moverPer({ g: "mes", ref: mes }, -i).ref;
    if (`${m}-01` < INICIO_ODOO) break;
    const tot = facturado(docs, `${m}-01`, finMes(m)).usd;
    const parcial = facturado(docs, `${m}-01`, sumarDias(`${m}-01`, Math.min(n, diasEntre(`${m}-01`, finMes(m)) + 1) - 1)).usd;
    if (parcial > 0) ratios.push(tot / parcial);
  }
  if (!ratios.length) return null;
  const ord = [...ratios].sort((a, b) => a - b);
  const rLo = ord.length >= 5 ? ord[1] : ord[0];
  const rHi = ord.length >= 5 ? ord[ord.length - 2] : ord[ord.length - 1];
  return {
    dia: n, actualArs: actual.ars, actualUsd: actual.usd, rLo, rHi,
    minArs: actual.ars * rLo, maxArs: actual.ars * rHi, minUsd: actual.usd * rLo, maxUsd: actual.usd * rHi,
    meses: ratios.length,
  };
}

// ─── Qué facturamos: clasificación de renglones (§3.1 y §3.2) ─────────────────────────

export type Familia =
  | "pantalla" | "fachada" | "plataforma" | "apuntalamiento" | "eventos" | "tubular"
  | "simple" | "vallas" | "fletes" | "servicios" | "venta" | "ajustes";

const REGLAS_FAMILIA: [Familia, (t: string) => boolean][] = [
  ["pantalla", (t) => /CONCERTINA|PANTALLA|BANDEJA/.test(t)],
  ["fachada", (t) => t.includes("FACHADA")],
  ["plataforma", (t) => t.includes("PLATAFORMA")],
  ["apuntalamiento", (t) => t.includes("APUNTALAMIENTO")],
  ["eventos", (t) => /EVENTO|MANGRULLO|ESCENARIO|TRIBUNA|\bSET\b/.test(t)],
  ["tubular", (t) => t.includes("TUBULAR") || (t.includes("MULTIDIRECCIONAL") && !t.includes("SIN MONTAJE"))],
  ["simple", (t) => /SIMPLE|SIN MONTAJE|MODULO|TABLON|RUEDAS|PUNTAL|BASTIDOR|BARANDA|RIENDA|NUDO|TORNILLON|RODAPIE|ESCALERA|VERTICAL|HORIZONTAL|DIAGONAL|ESFERA|PLACA|TIRANTE|LUZ DE TRABAJO|ARNES|EPP/.test(t)],
  ["vallas", (t) => t.includes("VALLA")],
  ["fletes", (t) => /FLETE|ENVÍO|ENVIO|TRASLADO/.test(t)],
  ["servicios", (t) => /PERMISO|GESTOR|INGENIER|HIGIENE|MANO DE OBRA|ADICIONAL|MÍNIMO OPERATIVO/.test(t)],
  ["venta", (t) => t.includes("VENTA DE MATERIAL")],
  ["ajustes", (t) => /COSTO FINANCIERO|AJUSTE/.test(t)],
];

/** La familia de un nombre de producto o texto de renglón. La primera regla que coincide gana. */
export function familiaDe(texto: string | null | undefined): Familia | null {
  const t = (texto ?? "").toUpperCase();
  if (!t.trim()) return null;
  for (const [f, regla] of REGLAS_FAMILIA) if (regla(t)) return f;
  return null;
}

export type TipoVenta = "nuevo" | "renovacion" | "anticipos" | "servicios" | "sin_montaje" | "sin_clasificar";

export const TIPOS_VENTA: readonly { id: TipoVenta; nombre: string }[] = [
  { id: "nuevo", nombre: "Alquiler nuevo con montaje" },
  { id: "renovacion", nombre: "Renovación" },
  { id: "anticipos", nombre: "Anticipos y saldos" },
  { id: "servicios", nombre: "Servicios y otros" },
  { id: "sin_montaje", nombre: "Alquiler sin montaje" },
  { id: "sin_clasificar", nombre: "Sin clasificar" },
];

export function tipoDeFamilia(f: Familia | null): TipoVenta {
  if (f == null) return "sin_clasificar";
  if (f === "simple") return "sin_montaje";
  if (f === "vallas" || f === "fletes" || f === "servicios" || f === "venta" || f === "ajustes") return "servicios";
  return "nuevo";
}

/**
 * El tipo de un renglón de factura. null = no se pudo por el producto ni por el texto: se
 * resuelve con la familia dominante de su orden de venta (y si no hay orden, sin clasificar).
 *  1. Sin producto y el texto dice anticipo/saldo → anticipos y saldos.
 *  2. Producto o texto con RENOVACI → renovación (un renglón sin producto que dice
 *     "RENOVACIÓN" también lo es).
 *  3. Familia por nombre de producto (o por el texto si no hay producto).
 */
export function tipoDeRenglon(producto: string | null, texto: string | null): TipoVenta | null {
  const p = (producto ?? "").toUpperCase();
  const t = (texto ?? "").toUpperCase();
  if (!p && /ANTICIPO|SALDO/.test(t)) return "anticipos";
  if (p.includes("RENOVACI") || (!p && t.includes("RENOVACI"))) return "renovacion";
  const f = p ? familiaDe(p) : familiaDe(t);
  return f ? tipoDeFamilia(f) : null;
}

/** Familia dominante de una orden: la de mayor monto entre sus renglones que no son anticipo. */
export function familiaDominante(renglones: readonly { producto: string | null; texto: string | null; monto: number }[]): Familia | null {
  const tot = new Map<Familia, number>();
  for (const r of renglones) {
    const f = r.producto ? familiaDe(r.producto) : familiaDe(r.texto);
    if (f) tot.set(f, (tot.get(f) ?? 0) + r.monto);
  }
  let mejor: Familia | null = null;
  let max = -Infinity;
  for (const [f, v] of tot) if (v > max) { max = v; mejor = f; }
  return mejor;
}

/** Composición por día y tipo: [fecha, tipo, ars, usd]. Se suma por rango. */
export type FilaComposicion = [string, TipoVenta, number, number];

export function composicion(filas: readonly FilaComposicion[], desde: string, hasta: string): { tipo: TipoVenta; nombre: string; ars: number; usd: number }[] {
  const acc = new Map<TipoVenta, { ars: number; usd: number }>();
  for (const [fecha, tipo, ars, usd] of filas) {
    if (fecha < desde || fecha > hasta) continue;
    const a = acc.get(tipo) ?? { ars: 0, usd: 0 };
    a.ars += ars; a.usd += usd;
    acc.set(tipo, a);
  }
  return TIPOS_VENTA.filter((t) => Math.abs(acc.get(t.id)?.ars ?? 0) >= 1).map((t) => ({ tipo: t.id, nombre: t.nombre, ...acc.get(t.id)! }));
}

// ─── Resultado de gestión por rubro (finanzas §6) ───────────────────────────────────────

export type GrupoRubro = "ingreso" | "costo_directo" | "estructura" | "financiero" | "excluido";
export type RubroId =
  | "ing_alquiler" | "ing_servicios" | "ing_venta_equipos" | "ing_otros_operativos"
  | "personal_operativo" | "obra_insumos_logistica" | "subalquiler_estructuras"
  | "personal_administrativo" | "inmuebles_servicios" | "estructura_otros" | "impuestos"
  | "financieros" | "otros_ingresos" | "ajustes_no_operativos";

export const RUBROS: readonly { id: RubroId; nombre: string; grupo: GrupoRubro }[] = [
  { id: "ing_alquiler", nombre: "Alquiler de estructuras", grupo: "ingreso" },
  { id: "ing_servicios", nombre: "Servicios", grupo: "ingreso" },
  { id: "ing_venta_equipos", nombre: "Venta de equipos", grupo: "ingreso" },
  { id: "ing_otros_operativos", nombre: "Otros ingresos operativos", grupo: "ingreso" },
  { id: "personal_operativo", nombre: "Personal operativo (incluye no registrado y contratistas)", grupo: "costo_directo" },
  { id: "obra_insumos_logistica", nombre: "Insumos de obra, logística y técnicos", grupo: "costo_directo" },
  { id: "subalquiler_estructuras", nombre: "Subalquiler de estructuras a terceros", grupo: "costo_directo" },
  { id: "personal_administrativo", nombre: "Personal administrativo (incluye no registrado)", grupo: "estructura" },
  { id: "inmuebles_servicios", nombre: "Alquileres de depósito y oficina, y servicios", grupo: "estructura" },
  { id: "estructura_otros", nombre: "Otros gastos de estructura (seguros, flota, software, honorarios…)", grupo: "estructura" },
  { id: "impuestos", nombre: "Impuestos (Ingresos Brutos y otros)", grupo: "estructura" },
  { id: "financieros", nombre: "Gastos financieros", grupo: "financiero" },
  { id: "otros_ingresos", nombre: "Otros ingresos (FIMA, intereses, alquileres cobrados)", grupo: "financiero" },
  { id: "ajustes_no_operativos", nombre: "Ajustes y cuadres excluidos", grupo: "excluido" },
];
export const RUBRO: Readonly<Record<RubroId, (typeof RUBROS)[number]>> = Object.fromEntries(RUBROS.map((r) => [r.id, r])) as never;

/** Cuentas fuera del resultado de gestión (cuadres, retiros cargados como gasto, circuitos especiales). */
const EXCLUIDAS = new Set(["888888", "4.2.1.04.19", "4.2.1.05.08", "4.2.1.03.27", "4.1.1.03.08"]);
const PERSONAL_OPERATIVO = new Set(["4.2.1.04.01", "4.2.1.04.02", "4.2.1.04.13", "4.2.1.04.18", "4.2.1.04.09", "4.2.1.04.10", "4.2.1.03.26"]);
const INSUMOS = new Set(["4.2.1.01.02", "4.2.1.01.06", "4.2.1.01.04", "4.2.1.03.24", "4.2.1.04.06", "4.2.1.04.07"]);
const PERSONAL_ADMIN = new Set(["4.2.1.03.01", "4.2.1.03.02", "4.2.1.04.15"]);
const INMUEBLES = new Set(["4.2.1.03.18", "4.2.1.03.14", "4.2.1.03.16", "4.2.1.01.03", "4.2.1.01.05"]);
/** Ingresos Brutos devengados (para detectar un mes cerrado sin IIBB). */
export const CUENTA_IIBB = "4.2.1.07.03";

/** El rubro de una cuenta por su código (y su tipo cuando el código no alcanza). */
export function rubroDeCuenta(codigo: string, tipo: string): RubroId {
  const c = codigo.trim();
  if (EXCLUIDAS.has(c)) return "ajustes_no_operativos";
  if (c === "4.1.1.01.02") return "ing_alquiler";
  if (c === "4.1.1.01.020") return "ing_servicios";
  if (c === "4.1.1.01.010") return "ing_venta_equipos";
  if (c.startsWith("4.1.1.01.")) return "ing_otros_operativos";
  if (PERSONAL_OPERATIVO.has(c)) return "personal_operativo";
  if (INSUMOS.has(c)) return "obra_insumos_logistica";
  if (c === "4.2.1.03.12") return "subalquiler_estructuras";
  if (PERSONAL_ADMIN.has(c)) return "personal_administrativo";
  if (INMUEBLES.has(c)) return "inmuebles_servicios";
  if (c.startsWith("4.2.1.07.") || c.startsWith("5.4.2.")) return "impuestos";
  if (c.startsWith("4.2.1.05.") || c.startsWith("5.6.1.") || c === "999998") return "financieros";
  if (tipo === "income_other" || c.startsWith("4.1.1.03.") || c.startsWith("999")) return "otros_ingresos";
  if (tipo === "income") return "ing_otros_operativos";
  return "estructura_otros";
}

/** Una fila del read_group: saldo (balance) de una cuenta en un mes. */
export type FilaCuentaMes = { mes: string; cuenta: number; codigo: string; nombre: string; tipo: string; balance: number };

export type MesResultado = {
  mes: string;
  /** El mes en curso: sin sueldos ni Ingresos Brutos devengados, fuera de los cocientes. */
  parcial: boolean;
  tcPromedio: number | null;
  ingresos: number;
  /** Positivos (lo gastado). */
  costoDirecto: number;
  estructura: number;
  /** Con signo (+ gana). */
  financiero: number;
  gestion: number;
  /** Con signo; SÓLO SOCIOS (retiros cargados como gasto y circuitos especiales). */
  ajustes: number;
  margenPct: number | null;
  /** −balance por rubro (ingreso +, gasto −). */
  rubros: Record<RubroId, number>;
  /** Ingresos Brutos devengados en el mes (positivo = gasto). */
  iibb: number;
};

export function armarResultado(filas: readonly FilaCuentaMes[], meses: readonly string[], hoy: string, tcProm: (ym: string) => number | null): MesResultado[] {
  return meses.map((mes) => {
    const rubros = Object.fromEntries(RUBROS.map((r) => [r.id, 0])) as Record<RubroId, number>;
    let iibb = 0;
    for (const f of filas) {
      if (f.mes !== mes) continue;
      rubros[rubroDeCuenta(f.codigo, f.tipo)] += -f.balance;
      if (f.codigo.trim() === CUENTA_IIBB) iibb += f.balance;
    }
    const g = (grupo: GrupoRubro) => suma(RUBROS.filter((r) => r.grupo === grupo), (r) => rubros[r.id]);
    const ingresos = g("ingreso");
    const costoDirecto = -g("costo_directo");
    const estructura = -g("estructura");
    const financiero = g("financiero");
    const gestion = ingresos - costoDirecto - estructura + financiero;
    return {
      mes,
      parcial: mes === hoy.slice(0, 7),
      tcPromedio: tcProm(mes),
      ingresos, costoDirecto, estructura, financiero, gestion,
      ajustes: g("excluido"),
      margenPct: ingresos > 0 ? (gestion / ingresos) * 100 : null,
      rubros,
      iibb,
    };
  });
}

/**
 * Meses cerrados sin Ingresos Brutos devengados: el resultado de ese mes está sobreestimado.
 * La regla y el estimado son los de iibbFaltante (pyg-reglas.ts), los mismos que usa Calidad:
 * menos del 20 % del promedio de los hasta 3 meses anteriores con IIBB.
 */
export function mesesSinIibb(meses: readonly MesResultado[]): { mes: string; estimado: number }[] {
  const salida: { mes: string; estimado: number }[] = [];
  for (let i = 0; i < meses.length; i++) {
    const m = meses[i];
    if (m.parcial) continue;
    const estimado = iibbFaltante(meses.slice(0, i).filter((x) => !x.parcial).map((x) => x.iibb), m.iibb);
    if (estimado != null) salida.push({ mes: m.mes, estimado });
  }
  return salida;
}

// ─── Comercial: confirmaciones, tiempo de aprobación, cotizado vivo (§5) ───────────────

/** Los valores del tracking del estado vienen traducidos: se comparan todas las variantes. */
const CONFIRMADA = new Set(["Orden de venta", "Pedido de venta", "Sales Order"]);
const CANCELADA = new Set(["Cancelado", "Cancelada", "Cancelled"]);
const COTIZACION = new Set(["Cotización", "Presupuesto", "Quotation", "Cotización enviada", "Presupuesto enviado", "Quotation Sent"]);

export type CambioEstado = { orden: number; instante: string; viejo: string | null; nuevo: string | null };

export type HistoriaOrden = {
  /** Instante ISO de la primera confirmación (null si nunca se confirmó por tracking). */
  primera: string | null;
  /** Instantes de las reconfirmaciones (cada confirmación después de la primera). */
  reconfirmaciones: string[];
  /** Pasó de Cancelado a Cotización alguna vez (contrato que se está editando). */
  reabierta: boolean;
};

export function historiaOrdenes(cambios: readonly CambioEstado[]): Map<number, HistoriaOrden> {
  const porOrden = new Map<number, CambioEstado[]>();
  for (const c of cambios) (porOrden.get(c.orden) ?? porOrden.set(c.orden, []).get(c.orden)!).push(c);
  const salida = new Map<number, HistoriaOrden>();
  for (const [orden, cs] of porOrden) {
    cs.sort((a, b) => a.instante.localeCompare(b.instante));
    const conf = cs.filter((c) => c.nuevo != null && CONFIRMADA.has(c.nuevo)).map((c) => c.instante);
    salida.set(orden, {
      primera: conf[0] ?? null,
      reconfirmaciones: conf.slice(1),
      reabierta: cs.some((c) => c.viejo != null && c.nuevo != null && CANCELADA.has(c.viejo) && COTIZACION.has(c.nuevo)),
    });
  }
  return salida;
}

export function mediana(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export type Orden = {
  id: number;
  nombre: string;
  /** Instante ISO de creación. */
  creada: string;
  /** Instante ISO de date_order (se reescribe al reconfirmar: sólo para "Vendido según Odoo"). */
  fechaOrden: string | null;
  estado: string;
  sinIva: number;
  conIva: number;
  cliente: string;
  usuario: number | null;
  oportunidad: number | null;
  /** x_studio_tipo_de_contrato, sin espacios de más. */
  tipoContrato: string | null;
};

/** Primera confirmación de una orden: el tracking o, sin tracking y confirmada, su fecha de orden. */
export function primeraConfirmacion(o: Orden, h: HistoriaOrden | undefined): string | null {
  if (h?.primera) return h.primera;
  if (o.estado === "sale" && o.fechaOrden) return o.fechaOrden;
  return null;
}

const DIA_MS = 864e5;
const diasDeInstantes = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DIA_MS;

export type TiempoAprobacion = { n: number; medianaObra: number | null; promedioObra: number | null; nObra: number; pct7Dias: number | null };

/**
 * Días entre la creación y la primera confirmación (§5.3), de las cotizaciones emitidas
 * (más de ARS 1.000, sin Consumidor Final Anónimo) confirmadas desde `desdeInstante`.
 */
export function tiempoAprobacion(ordenes: readonly Orden[], historia: ReadonlyMap<number, HistoriaOrden>, desdeInstante: string): TiempoAprobacion {
  const todos: number[] = [];
  const obra: number[] = [];
  for (const o of ordenes) {
    if (!esEmitida(o)) continue;
    const p = primeraConfirmacion(o, historia.get(o.id));
    if (!p || p < desdeInstante) continue;
    const d = Math.max(0, diasDeInstantes(o.creada, p));
    todos.push(d);
    if (o.tipoContrato === "Obra") obra.push(d);
  }
  return {
    n: todos.length,
    nObra: obra.length,
    medianaObra: mediana(obra),
    promedioObra: obra.length ? suma(obra, (x) => x) / obra.length : null,
    pct7Dias: todos.length ? (todos.filter((d) => d <= 7).length / todos.length) * 100 : null,
  };
}

/** Montos absurdos (cotizaciones mal cargadas): se excluyen si nunca se confirmaron. */
export const MONTO_ABSURDO = 1_000_000_000;
export const COTIZACION_MINIMA = 1_000;
export const DIAS_COTIZACION_VIVA = 90;

export type EstadoOportunidad = "won" | "lost" | "pending";

export type CotizadoVivo = {
  ars: number;
  cantidad: number;
  filas: { id: number; nombre: string; cliente: string; ars: number; creada: string; usuario: number | null }[];
  excluidas: { motivo: string; cantidad: number; ars: number }[];
};

/**
 * Cotizado vivo (§5.4): borradores de más de ARS 1.000, sin contratos en edición, sin
 * oportunidad perdida ni ganada, sin montos absurdos, de los últimos 90 días y una por
 * oportunidad (la de mayor monto).
 */
export function cotizadoVivo(
  ordenes: readonly Orden[],
  historia: ReadonlyMap<number, HistoriaOrden>,
  oportunidades: ReadonlyMap<number, EstadoOportunidad>,
  hoy: string,
): CotizadoVivo {
  const excl = new Map<string, { cantidad: number; ars: number }>();
  const excluir = (motivo: string, o: Orden) => {
    const e = excl.get(motivo) ?? { cantidad: 0, ars: 0 };
    e.cantidad++; e.ars += o.sinIva;
    excl.set(motivo, e);
  };
  const limite = sumarDias(hoy, -DIAS_COTIZACION_VIVA);
  const vivas: Orden[] = [];
  for (const o of ordenes) {
    if (o.estado !== "draft" || !(o.sinIva > COTIZACION_MINIMA)) continue;
    const h = historia.get(o.id);
    const op = o.oportunidad != null ? oportunidades.get(o.oportunidad) : undefined;
    if (h && (h.primera || h.reabierta)) excluir("Contratos en edición (ya confirmados alguna vez)", o);
    else if (op === "lost") excluir("Oportunidad perdida", o);
    else if (op === "won") excluir("Alternativas de una oportunidad ya ganada", o);
    else if (o.sinIva >= MONTO_ABSURDO) excluir("Montos absurdos (mil millones o más)", o);
    else if (o.creada.slice(0, 10) < limite) excluir(`Más de ${DIAS_COTIZACION_VIVA} días sin respuesta`, o);
    else vivas.push(o);
  }
  // Una por oportunidad: la de mayor monto.
  const porOp = new Map<number, Orden>();
  const finales: Orden[] = [];
  for (const o of vivas) {
    if (o.oportunidad == null) { finales.push(o); continue; }
    const otra = porOp.get(o.oportunidad);
    if (!otra) porOp.set(o.oportunidad, o);
    else if (o.sinIva > otra.sinIva) { excluir("Duplicadas de la misma oportunidad", otra); porOp.set(o.oportunidad, o); }
    else excluir("Duplicadas de la misma oportunidad", o);
  }
  finales.push(...porOp.values());
  finales.sort((a, b) => b.sinIva - a.sinIva);
  return {
    ars: suma(finales, (o) => o.sinIva),
    cantidad: finales.length,
    filas: finales.map((o) => ({ id: o.id, nombre: o.nombre, cliente: o.cliente, ars: o.sinIva, creada: o.creada.slice(0, 10), usuario: o.usuario })),
    excluidas: [...excl.entries()].map(([motivo, e]) => ({ motivo, ...e })).sort((a, b) => b.ars - a.ars),
  };
}

/** ¿La cotización cuenta como emitida (§5.1)? */
export function esEmitida(o: Orden): boolean {
  return o.sinIva > COTIZACION_MINIMA && !/^consumidor final an[oó]nimo/i.test(o.cliente.trim());
}

export type Conversion = { emitidoArs: number; ganadoArs: number; pct: number | null; desde: string; hasta: string; cohortes: number };

/**
 * Conversión histórica en monto (§5.2): ganado inicial ÷ emitido, sobre las cohortes (mes
 * de creación) cuyo mes terminó hace 60 días o más (las recientes tienen muchas abiertas).
 * `ganadoInicial` = suma de renglones de la orden sin anticipos ni renovaciones.
 */
export function conversionHistorica(
  ordenes: readonly Orden[],
  historia: ReadonlyMap<number, HistoriaOrden>,
  ganadoInicial: ReadonlyMap<number, number>,
  hoy: string,
): Conversion {
  const ultimo = sumarDias(hoy, -60);
  let emitidoArs = 0;
  let ganadoArs = 0;
  const cohortes = new Set<string>();
  for (const o of ordenes) {
    const mes = o.creada.slice(0, 7);
    if (`${mes}-01` < INICIO_ODOO || finMes(mes) > ultimo || !esEmitida(o)) continue;
    const ganada = primeraConfirmacion(o, historia.get(o.id)) != null;
    if (!(o.sinIva >= MONTO_ABSURDO && !ganada)) emitidoArs += o.sinIva;
    if (ganada) ganadoArs += ganadoInicial.get(o.id) ?? 0;
    cohortes.add(mes);
  }
  const lista = [...cohortes].sort();
  return { emitidoArs, ganadoArs, pct: emitidoArs > 0 ? (ganadoArs / emitidoArs) * 100 : null, desde: lista[0] ?? "", hasta: lista[lista.length - 1] ?? "", cohortes: lista.length };
}

/**
 * ¿Un mismo usuario concentra más del 30 % del cotizado vivo con una conversión de 12 meses
 * menor al 5 %? (alerta "cotizaciones sin cerrar", §7). Sin nombres: sólo el peso.
 */
export function concentracionCotizado(
  vivo: CotizadoVivo,
  ordenes: readonly Orden[],
  historia: ReadonlyMap<number, HistoriaOrden>,
  hoy: string,
): { pct: number; ars: number; cantidad: number; conversionPct: number } | null {
  if (vivo.ars <= 0) return null;
  const porUsuario = new Map<number, { ars: number; cantidad: number }>();
  for (const f of vivo.filas) if (f.usuario != null) {
    const u = porUsuario.get(f.usuario) ?? { ars: 0, cantidad: 0 };
    u.ars += f.ars; u.cantidad++;
    porUsuario.set(f.usuario, u);
  }
  const desde = sumarDias(hoy, -365);
  let peor: { pct: number; ars: number; cantidad: number; conversionPct: number } | null = null;
  for (const [usuario, u] of porUsuario) {
    const pct = (u.ars / vivo.ars) * 100;
    if (pct <= 30) continue;
    const suyas = ordenes.filter((o) => o.usuario === usuario && o.creada.slice(0, 10) >= desde && esEmitida(o));
    if (!suyas.length) continue;
    const ganadas = suyas.filter((o) => primeraConfirmacion(o, historia.get(o.id)) != null).length;
    const conversionPct = (ganadas / suyas.length) * 100;
    if (conversionPct < 5 && (!peor || pct > peor.pct)) peor = { pct, ars: u.ars, cantidad: u.cantidad, conversionPct };
  }
  return peor;
}
