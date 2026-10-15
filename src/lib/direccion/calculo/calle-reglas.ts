// Reglas puras de En la calle (/direccion/calle). Sin red: reciben lo que se leyó de Odoo
// (calle.ts) y arman el detalle, las cifras, los avisos, las decisiones y la narrativa.
//
// Fuente de cada regla: Odoo-Claude/direccion/datos/alquiler_definiciones.md (§1–§13) y la
// maqueta aprobada (renderCalle, bloque "2b" de correcciones). Lo que cambia respecto del
// snapshot del 15/10 está marcado con "DIFERENCIA".
//
// DEDUPLICAR POR OBRA (handoff §2.2, caso Ministerio). Varias órdenes en la calle pueden ser
// la misma obra (x_obra_id) con una sola cuota: S00084 y S00086 quedaron reemplazadas por
// S00735, que se factura vía S02163. La regla general, sin nombres propios:
//   · En una obra con 2+ órdenes en la calle, "facturan" las que tienen factura propia en
//     los últimos 40 días. Si ninguna factura, se queda la de factura más reciente.
//   · Las demás están REEMPLAZADAS si la obra facturó (por cualquier orden) después de su
//     última factura: su cuota ya se cobra en otra orden. No se cuentan en nada de lo que
//     es "en la calle" y se listan en un aviso de calidad para que Comercial las cierre.
//   · Si la obra queda con UN solo contrato, las órdenes "satélite" de la misma obra que no
//     están en la calle ni terminadas (p. ej. S02163, Pendiente de Armado, que lleva los
//     renglones de RENOVACIÓN del Ministerio) le aportan sus renovaciones (renglones y
//     facturas de productos RENOVACIÓN; una ampliación nueva de la misma obra no cuenta):
//     así S00735 figura "facturado vía S02163".

import { semaforoHoy } from "../../habilitaciones/derivacion.ts";
import { diasEntre, fcorta, lunesDe, nombreLindo, sumarDias } from "../formato.ts";
import type { Aviso, Cifra, Comparacion, Decision, Frase, Oracion, Valor } from "../tipos.ts";

// ─── Lo que se lee de Odoo ──────────────────────────────────────────────────────────────

export type M2O = [number, string] | false;

export type OrdenOdoo = {
  id: number;
  name: string;
  partner_id: M2O;
  x_obra_id: M2O;
  x_studio_tipo_de_contrato: string | false;
  x_studio_estado_de_obra: string | false;
  rental_status: string | false;
  rental_start_date: string | false;
  rental_return_date: string | false;
  x_fecha_armado: string | false;
  x_fecha_fin_obra_estimada: string | false;
  amount_untaxed: number;
  x_facturado_neto: number | false;
  x_permiso_m2: number | false;
  x_permiso_metros_lineales: number | false;
  x_direccion_obra: string | false;
  x_obra_referencia: string | false;
  user_id: M2O;
  x_studio_tcnico: M2O;
};

export const CAMPOS_ORDEN = [
  "name", "partner_id", "x_obra_id", "x_studio_tipo_de_contrato", "x_studio_estado_de_obra", "rental_status",
  "rental_start_date", "rental_return_date", "x_fecha_armado", "x_fecha_fin_obra_estimada", "amount_untaxed",
  "x_facturado_neto", "x_permiso_m2", "x_permiso_metros_lineales", "x_direccion_obra", "x_obra_referencia",
  "user_id", "x_studio_tcnico",
];

export type LineaVentaOdoo = {
  id: number;
  order_id: M2O;
  product_id: M2O;
  price_subtotal: number;
  create_date: string;
  display_type: string | false;
  is_downpayment: boolean;
  /** Descripción del renglón ("… Etapa 2 - Mes 3"): para no sumar dos meses del mismo canon. */
  name?: string | false;
};

export const CAMPOS_LINEA = ["order_id", "product_id", "price_subtotal", "create_date", "display_type", "is_downpayment", "name"];

/** Renglón de factura o NC de cliente, posteado, de producto, vinculado a renglones de venta. */
export type LineaFacturaOdoo = {
  id: number;
  date: string;
  balance: number;
  move_type: string;
  sale_line_ids: number[];
  product_id: M2O;
  move_id: M2O;
};

export const CAMPOS_FACTURA = ["date", "balance", "move_type", "sale_line_ids", "product_id", "move_id"];

export type OtOdoo = {
  id: number;
  x_name: string | false;
  x_tipo: string | false;
  x_estado: string | false;
  x_fecha_programada: string | false;
  x_order_id: M2O;
  x_jornadas_num: number | false;
  x_cuadrilla_prevista_id: M2O;
  x_direccion_obra: string | false;
  x_obra_referencia: string | false;
  x_hab_semaforo: string | false;
  x_hab_vencimiento: string | false;
  x_es_adicional: boolean;
};

export const CAMPOS_OT = [
  "x_name", "x_tipo", "x_estado", "x_fecha_programada", "x_order_id", "x_jornadas_num", "x_cuadrilla_prevista_id",
  "x_direccion_obra", "x_obra_referencia", "x_hab_semaforo", "x_hab_vencimiento", "x_es_adicional",
];

/** Estados de OT "activas" (la misma constante ACTIVAS de src/lib/odoo/ordenes.ts). */
export const OT_ACTIVAS = ["pendiente", "en_proceso"];

export type EntradaCalle = {
  hoy: string;
  /** Todas las órdenes de alquiler confirmadas (is_rental_order, state = sale). */
  ordenes: OrdenOdoo[];
  /** partner_id → nombre de la empresa (commercial_partner_id). */
  clientes: Record<number, string>;
  /** Renglones de venta de las órdenes en la calle y sus satélites. */
  lineas: LineaVentaOdoo[];
  /** product.product con rent_ok. */
  productosAlquiler: number[];
  /** Renglones de factura de esas órdenes. */
  facturas: LineaFacturaOdoo[];
  /** OT activas. null = no se pudieron leer. */
  ots: OtOdoo[] | null;
  /** OT completadas esta semana (lunes a hoy, por fecha de ejecución). null = sin dato. */
  otCompletadasSemana: number | null;
  /** Piezas según stock (sólo referencia: no es confiable). null = sin dato. */
  flota: { enObra: number; deposito: number } | null;
};

// ─── Lo que se arma ─────────────────────────────────────────────────────────────────────

export type TipoContrato = "Obra" | "Simple" | "Sin montaje" | "Sin tipo";
export type FuenteAbono = "ultima_renovacion" | "cuota_facturada" | "estimado_sin_renovacion" | "sin_dato";
export type Accion = "Renovar" | "Facturar" | "Retirar";

export type FilaContrato = {
  id: number;
  orden: string;
  cliente: string;
  obra: string;
  tipo: TipoContrato;
  estadoObra: string;
  vendedor: string | null;
  tecnico: string | null;
  /** Armado (o inicio del alquiler), día argentino. */
  desde: string | null;
  devolucion: string | null;
  finObra: string | null;
  contratoArs: number;
  facturadoArs: number | null;
  /** Abono mensual sin IVA (sólo contratos en la calle). null = sin dato. */
  abonoArs: number | null;
  abonoFuente: FuenteAbono | null;
  ultimaRenovacion: string | null;
  renovaciones: number;
  ultimaFactura: string | null;
  diasSinFacturar: number | null;
  /** Orden por la que se factura (satélite de la misma obra). */
  facturadoVia: string | null;
  sigueFacturando: boolean;
  enLaCalle: boolean;
  /** Días desde la devolución pactada o el fin estimado (según la lista). */
  diasVencido: number | null;
  accion: Accion;
};

export type FilaOt = {
  id: number;
  titulo: string;
  tipo: string;
  estado: string;
  fecha: string | null;
  orden: string | null;
  cliente: string | null;
  obra: string;
  cuadrilla: string | null;
  jornadas: number;
  habilitacion: "rojo" | "amarillo" | "verde" | "vencida";
  adicional: boolean;
  diasVencida: number | null;
};

export type ResumenOt = { total: number; armados: number; desarmes: number; otros: number; jornadas: number; jornadasArmado: number; jornadasDesarme: number };

export type Reemplazada = { orden: string; id: number; obra: string; cliente: string; por: string; ultimaFactura: string | null };

export type DetalleCalle = {
  hoy: string;
  /** Hubo órdenes de alquiler en Odoo (si no, todo es "sin dato"). */
  hayOrdenes: boolean;
  contratos: FilaContrato[];
  porTipo: { tipo: TipoContrato; contratos: number; abonoArs: number; contratoArs: number; m2: number; ml: number }[];
  abono: { totalArs: number | null; realArs: number; estimadoArs: number; estimados: number; cuotaArs: number; cuotas: number; renovArs: number; renov: number; sinDato: number; ratios: Partial<Record<TipoContrato, number>> };
  contratoTotalArs: number;
  m2: { m2: number; ml: number; obraSinMedidas: number; sinMedidas: string[] };
  topClientes: { cliente: string; contratos: number; abonoArs: number; pct: number }[];
  reemplazadas: Reemplazada[];
  armadoDevuelto: { total: number; porTipo: Record<string, number> };
  devolucion: { filas: FilaContrato[]; abonoArs: number; contratoArs: number; sinFacturar: number; abonoSinFacturarArs: number; medianaDias: number | null; porAntiguedad: { rango: string; contratos: number }[] };
  finObra: { filas: FilaContrato[]; obras: number; activasEnAlquiler: number; sinFecha: number; medianaDias: number | null };
  sinRenovacion: { filas: FilaContrato[]; debian: number; renovaron: number; tasa: number | null; abonoArs: number };
  vencen7: number;
  vencen15: number;
  reservas: { sinArmar: number; inicioVencido: number; contratoVencidoArs: number };
  ot: null | {
    semana: { desde: string; hasta: string };
    proxima: { desde: string; hasta: string };
    esta: FilaOt[];
    prox: FilaOt[];
    vencidas: FilaOt[];
    sinFecha: number;
    backlog: ResumenOt;
    sinHabilitacionProx2: number;
    completadasSemana: number | null;
  };
  flota: { enObra: number; deposito: number } | null;
};

// ─── Utilidades ─────────────────────────────────────────────────────────────────────────

/** datetime de Odoo (UTC, "AAAA-MM-DD HH:MM:SS") → día argentino (UTC−3, sin horario de verano). Un date queda igual. */
export function fechaAr(s: string | false | null | undefined): string | null {
  if (!s) return null;
  const t = String(s);
  if (t.length <= 10) return t.slice(0, 10);
  const ms = Date.parse(`${t.slice(0, 19).replace(" ", "T")}Z`);
  if (!Number.isFinite(ms)) return t.slice(0, 10);
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
}

export const esRenovacion = (nombre: string): boolean => /RENOVACI/i.test(nombre);

export function tipoContrato(t: string | false): TipoContrato {
  const v = typeof t === "string" ? t.trim() : "";
  return v === "Obra" ? "Obra" : v === "Simple" ? "Simple" : v === "Alquiler Sin Montaje" ? "Sin montaje" : "Sin tipo";
}

/** §1: retirado y no desarmado, o armado sin retiro registrado. */
export function estaEnLaCalle(o: Pick<OrdenOdoo, "rental_status" | "x_studio_estado_de_obra">): boolean {
  const eo = o.x_studio_estado_de_obra;
  if (o.rental_status === "return") return eo !== "Desarmado";
  if (o.rental_status === "pickup") return eo === "Armado" || eo === "Pendiente de Desarme";
  return false;
}

export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "Retirar" si está pendiente de desarme; "Facturar" si no factura hace +40 días; si no, "Renovar". */
export function accionSugerida(f: { estadoObra: string; diasSinFacturar: number | null }): Accion {
  if (f.estadoObra === "Pendiente de Desarme") return "Retirar";
  if (f.diasSinFacturar == null || f.diasSinFacturar > 40) return "Facturar";
  return "Renovar";
}

export function tramoAntiguedad(dias: number): "0-30" | "31-90" | "91-180" | "+180" {
  return dias <= 30 ? "0-30" : dias <= 90 ? "31-90" : dias <= 180 ? "91-180" : "+180";
}

const m2oId = (v: M2O): number | null => (Array.isArray(v) ? v[0] : null);
const m2oNombre = (v: M2O): string | null => (Array.isArray(v) ? v[1] : null);
const texto = (v: string | false | null | undefined): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const r0 = (n: number): number => Math.round(n);

/** El nombre del cliente de una OT cuando la orden no está entre las de alquiler: "Armado · S02711 · Mostaza S.A — Av…". */
export function clienteDeTituloOt(titulo: string): string | null {
  const partes = titulo.split(" · ");
  if (partes.length < 3) return null;
  return texto(partes.slice(2).join(" · ").split(" — ")[0]);
}

/**
 * Una orden "satélite" sólo aporta si es un vehículo de renovación: tiene renglones de
 * RENOVACIÓN y ningún alquiler inicial (S02163 del Ministerio). Una ampliación de la misma
 * obra (S02796, S02768: "ALQUILER Y MONTAJE" + sus renovaciones) es otro contrato que todavía
 * no se armó, y no se mezcla.
 */
export function esVehiculoDeRenovacion(lineas: LineaVentaOdoo[], alquiler: ReadonlySet<number>): boolean {
  const utiles = lineas.filter((l) => !l.display_type && l.product_id && !l.is_downpayment && l.price_subtotal > 0);
  const nombre = (l: LineaVentaOdoo) => m2oNombre(l.product_id) ?? "";
  return utiles.some((l) => esRenovacion(nombre(l))) && !utiles.some((l) => !esRenovacion(nombre(l)) && alquiler.has(m2oId(l.product_id)!));
}

/** "Mes 3" en la descripción del renglón (canon numerado por mes). */
const MES_N = /\bmes\s*(\d{1,2})\b/i;

/**
 * El abono de un lote de renovación (renglones creados dentro de los 10 días anteriores al
 * último): la suma, como en alquiler_definiciones.md §2 (una renovación trae varios renglones:
 * estructura + pantalla + concertina, o un mismo producto por frente).
 *
 * EXCEPCIÓN: el mismo canon numerado por mes ("Etapa 2 - Mes 2" y "Etapa 2 - Mes 3": mismo
 * producto y misma descripción salvo el número) son dos meses del MISMO renglón cargados
 * juntos (atrasados o adelantados), no dos renglones del abono. Cuenta sólo el último mes.
 * Caso real: S00128 (Copimex) el 15/10/2026, facturados juntos en la FA-A 00007-00001184.
 */
export function abonoDelLote(lote: LineaVentaOdoo[]): number {
  const sueltos: LineaVentaOdoo[] = [];
  const porCanon = new Map<string, { n: number; l: LineaVentaOdoo }[]>();
  for (const l of lote) {
    const desc = typeof l.name === "string" ? l.name : "";
    const m = MES_N.exec(desc);
    if (!m) { sueltos.push(l); continue; }
    const clave = `${m2oId(l.product_id) ?? ""}|${desc.replace(MES_N, "").replace(/\s+/g, " ").trim().toLowerCase()}`;
    (porCanon.get(clave) ?? porCanon.set(clave, []).get(clave)!).push({ n: Number(m[1]), l });
  }
  let total = sueltos.reduce((a, l) => a + l.price_subtotal, 0);
  for (const grupo of porCanon.values()) {
    const ultimo = Math.max(...grupo.map((g) => g.n));
    // Si hay varios renglones del último mes (un frente por renglón), van todos.
    total += grupo.filter((g) => g.n === ultimo).reduce((a, g) => a + g.l.price_subtotal, 0);
  }
  return total;
}

type Factura = { fecha: string; ars: number; esFactura: boolean; renov: boolean; orden: number };

/** Última factura (no NC) con monto positivo. */
function ultimaDe(fs: Factura[]): Factura | null {
  let u: Factura | null = null;
  for (const f of fs) if (f.esFactura && f.ars > 0 && (!u || f.fecha > u.fecha)) u = f;
  return u;
}

// ─── El cálculo ─────────────────────────────────────────────────────────────────────────

export function calcularCalle(e: EntradaCalle): DetalleCalle {
  const { hoy } = e;
  const alquiler = new Set(e.productosAlquiler);
  const nombreCliente = (o: OrdenOdoo): string => {
    const pid = m2oId(o.partner_id);
    return (pid != null ? e.clientes[pid] : null) ?? m2oNombre(o.partner_id)?.split(", ")[0] ?? "";
  };

  // Renglones y facturas por orden.
  const lineasDe = new Map<number, LineaVentaOdoo[]>();
  const ordenDeLinea = new Map<number, number>();
  for (const l of e.lineas) {
    const oid = m2oId(l.order_id);
    if (oid == null) continue;
    ordenDeLinea.set(l.id, oid);
    (lineasDe.get(oid) ?? lineasDe.set(oid, []).get(oid)!).push(l);
  }
  const facturasDe = new Map<number, Factura[]>();
  for (const f of e.facturas) {
    const oid = f.sale_line_ids.map((s) => ordenDeLinea.get(s)).find((x) => x != null);
    if (oid == null) continue;
    const fila: Factura = { fecha: f.date, ars: -f.balance, esFactura: f.move_type === "out_invoice", renov: esRenovacion(m2oNombre(f.product_id) ?? ""), orden: oid };
    (facturasDe.get(oid) ?? facturasDe.set(oid, []).get(oid)!).push(fila);
  }
  const porId = new Map(e.ordenes.map((o) => [o.id, o]));

  // En la calle y deduplicación por obra.
  const enCalle = e.ordenes.filter(estaEnLaCalle);
  const porObra = new Map<number, OrdenOdoo[]>();
  for (const o of enCalle) {
    const ob = m2oId(o.x_obra_id);
    if (ob != null) (porObra.get(ob) ?? porObra.set(ob, []).get(ob)!).push(o);
  }
  const satelitesDe = new Map<number, OrdenOdoo[]>();
  for (const o of e.ordenes) {
    const ob = m2oId(o.x_obra_id);
    if (ob == null || !porObra.has(ob) || estaEnLaCalle(o)) continue;
    if (o.rental_status === "returned" || o.x_studio_estado_de_obra === "Desarmado") continue;
    if (!esVehiculoDeRenovacion(lineasDe.get(o.id) ?? [], alquiler)) continue;
    (satelitesDe.get(ob) ?? satelitesDe.set(ob, []).get(ob)!).push(o);
  }
  /** De los satélites sólo cuentan las facturas de RENOVACIÓN: una ampliación nueva de la misma obra no es la cuota de este contrato. */
  const renovacionesDe = (sats: OrdenOdoo[]): Factura[] => sats.flatMap((s) => facturasDe.get(s.id) ?? []).filter((f) => f.renov);
  const reemplazadas: Reemplazada[] = [];
  const fuera = new Set<number>();
  for (const [ob, grupo] of porObra) {
    if (grupo.length < 2) continue;
    const ult = new Map(grupo.map((o) => [o.id, ultimaDe(facturasDe.get(o.id) ?? [])?.fecha ?? null]));
    let facturan = grupo.filter((o) => { const u = ult.get(o.id); return u != null && diasEntre(u, hoy) <= 40; });
    if (!facturan.length) {
      const mejor = [...grupo].sort((a, b) => (ult.get(b.id) ?? "").localeCompare(ult.get(a.id) ?? "") || b.id - a.id)[0];
      facturan = [mejor];
    }
    const facturasObra = [...grupo.flatMap((o) => facturasDe.get(o.id) ?? []), ...renovacionesDe(satelitesDe.get(ob) ?? [])];
    const ultObra = ultimaDe(facturasObra)?.fecha ?? null;
    const representante = [...facturan].sort((a, b) => (ult.get(b.id) ?? "").localeCompare(ult.get(a.id) ?? ""))[0];
    for (const o of grupo) {
      if (facturan.includes(o)) continue;
      const u = ult.get(o.id) ?? null;
      if (ultObra && (!u || ultObra > u)) {
        fuera.add(o.id);
        reemplazadas.push({ orden: o.name, id: o.id, obra: texto(o.x_direccion_obra) ?? m2oNombre(o.x_obra_id) ?? "", cliente: nombreCliente(o), por: representante.name, ultimaFactura: u });
      }
    }
  }
  const vigentes = enCalle.filter((o) => !fuera.has(o.id));
  const contratosPorObra = new Map<number, number>();
  for (const o of vigentes) { const ob = m2oId(o.x_obra_id); if (ob != null) contratosPorObra.set(ob, (contratosPorObra.get(ob) ?? 0) + 1); }
  /** Satélites que aportan a ESTA orden: sólo si es el único contrato vigente de su obra. */
  const satelitesPara = (o: OrdenOdoo): OrdenOdoo[] => {
    const ob = m2oId(o.x_obra_id);
    return ob != null && contratosPorObra.get(ob) === 1 ? satelitesDe.get(ob) ?? [] : [];
  };

  // Valor mensual: renovación → cuota facturada → estimado (§2).
  type Calc = { abono: number | null; fuente: FuenteAbono; ultRen: string | null; nRen: number; vi: number };
  const calc = new Map<number, Calc>();
  const ratiosPorTipo = new Map<TipoContrato, number[]>();
  for (const o of vigentes) {
    const propias = lineasDe.get(o.id) ?? [];
    const sat = satelitesPara(o).flatMap((s) => lineasDe.get(s.id) ?? []);
    const utiles = (ls: LineaVentaOdoo[]) => ls.filter((l) => !l.display_type && l.product_id && !l.is_downpayment);
    const ren = utiles([...propias, ...sat]).filter((l) => esRenovacion(m2oNombre(l.product_id) ?? "") && l.price_subtotal > 0);
    const vi = utiles(propias).filter((l) => !esRenovacion(m2oNombre(l.product_id) ?? "") && alquiler.has(m2oId(l.product_id)!)).reduce((a, l) => a + l.price_subtotal, 0);
    if (ren.length) {
      const fechas = ren.map((l) => fechaAr(l.create_date)!).sort();
      const ult = fechas[fechas.length - 1];
      const abono = abonoDelLote(ren.filter((l) => diasEntre(fechaAr(l.create_date)!, ult) <= 10));
      let grupos = 0;
      let prev: string | null = null;
      for (const f of fechas) { if (prev == null || diasEntre(prev, f) > 10) grupos++; prev = f; }
      calc.set(o.id, { abono, fuente: "ultima_renovacion", ultRen: ult, nRen: grupos, vi });
      if (vi > 0) { const t = tipoContrato(o.x_studio_tipo_de_contrato); (ratiosPorTipo.get(t) ?? ratiosPorTipo.set(t, []).get(t)!).push(abono / vi); }
    } else {
      calc.set(o.id, { abono: null, fuente: "sin_dato", ultRen: null, nRen: 0, vi });
    }
  }
  const ratios: Partial<Record<TipoContrato, number>> = {};
  for (const [t, v] of ratiosPorTipo) ratios[t] = mediana(v)!;
  const desdeCuotas = sumarDias(hoy, -125).slice(0, 7);
  for (const o of vigentes) {
    const c = calc.get(o.id)!;
    if (c.fuente !== "sin_dato") continue;
    const fs = facturasDe.get(o.id) ?? [];
    const porMes = new Map<string, number>();
    for (const f of fs) porMes.set(f.fecha.slice(0, 7), (porMes.get(f.fecha.slice(0, 7)) ?? 0) + f.ars);
    const meses = [...porMes.keys()].sort();
    const recientes = meses.slice(1).filter((m) => m >= desdeCuotas && porMes.get(m)! > 0).map((m) => porMes.get(m)!);
    const cuota = meses.length >= 2 ? mediana(recientes) : null;
    if (cuota) { c.abono = cuota; c.fuente = "cuota_facturada"; continue; }
    const ratio = ratios[tipoContrato(o.x_studio_tipo_de_contrato)] ?? ratios.Obra;
    if (ratio != null && c.vi > 0) { c.abono = c.vi * ratio; c.fuente = "estimado_sin_renovacion"; }
  }

  const fila = (o: OrdenOdoo, diasVencido: number | null = null): FilaContrato => {
    const c = calc.get(o.id);
    const u = ultimaDe([...(facturasDe.get(o.id) ?? []), ...renovacionesDe(satelitesPara(o))]);
    const dsf = u ? diasEntre(u.fecha, hoy) : null;
    const estadoObra = texto(o.x_studio_estado_de_obra) ?? "Sin estado";
    return {
      id: o.id,
      orden: o.name,
      cliente: nombreCliente(o),
      obra: (texto(o.x_direccion_obra) ?? texto(o.x_obra_referencia) ?? m2oNombre(o.x_obra_id) ?? "").slice(0, 90),
      tipo: tipoContrato(o.x_studio_tipo_de_contrato),
      estadoObra,
      vendedor: m2oNombre(o.user_id),
      tecnico: m2oNombre(o.x_studio_tcnico),
      desde: fechaAr(o.x_fecha_armado) ?? fechaAr(o.rental_start_date),
      devolucion: fechaAr(o.rental_return_date),
      finObra: fechaAr(o.x_fecha_fin_obra_estimada),
      contratoArs: r0(o.amount_untaxed ?? 0),
      facturadoArs: typeof o.x_facturado_neto === "number" ? r0(o.x_facturado_neto) : null,
      abonoArs: c?.abono != null ? r0(c.abono) : null,
      abonoFuente: c ? c.fuente : null,
      ultimaRenovacion: c?.ultRen ?? null,
      renovaciones: c?.nRen ?? 0,
      ultimaFactura: u?.fecha ?? null,
      diasSinFacturar: dsf,
      facturadoVia: u && u.orden !== o.id ? porId.get(u.orden)?.name ?? null : null,
      sigueFacturando: dsf != null && dsf <= 40,
      enLaCalle: estaEnLaCalle(o) && !fuera.has(o.id),
      diasVencido,
      accion: accionSugerida({ estadoObra, diasSinFacturar: dsf }),
    };
  };

  const contratos = vigentes.map((o) => fila(o)).sort((a, b) => (b.abonoArs ?? 0) - (a.abonoArs ?? 0) || a.orden.localeCompare(b.orden));
  const suma = (fs: FilaContrato[], k: "abonoArs" | "contratoArs") => fs.reduce((a, f) => a + (f[k] ?? 0), 0);

  // Por tipo, abono, m², clientes.
  const TIPOS: TipoContrato[] = ["Obra", "Simple", "Sin montaje", "Sin tipo"];
  const ordenVig = new Map(vigentes.map((o) => [o.id, o]));
  const porTipo = TIPOS.map((tipo) => {
    const fs = contratos.filter((f) => f.tipo === tipo);
    return {
      tipo, contratos: fs.length, abonoArs: suma(fs, "abonoArs"), contratoArs: suma(fs, "contratoArs"),
      m2: fs.reduce((a, f) => a + (Number(ordenVig.get(f.id)!.x_permiso_m2) || 0), 0),
      ml: fs.reduce((a, f) => a + (Number(ordenVig.get(f.id)!.x_permiso_metros_lineales) || 0), 0),
    };
  }).filter((t) => t.contratos > 0 || t.tipo !== "Sin tipo");
  const conAbono = contratos.filter((f) => f.abonoArs != null);
  const de = (fu: FuenteAbono) => contratos.filter((f) => f.abonoFuente === fu);
  const abono = {
    totalArs: conAbono.length ? suma(conAbono, "abonoArs") : null,
    realArs: suma([...de("ultima_renovacion"), ...de("cuota_facturada")], "abonoArs"),
    estimadoArs: suma(de("estimado_sin_renovacion"), "abonoArs"),
    estimados: de("estimado_sin_renovacion").length,
    cuotaArs: suma(de("cuota_facturada"), "abonoArs"),
    cuotas: de("cuota_facturada").length,
    renovArs: suma(de("ultima_renovacion"), "abonoArs"),
    renov: de("ultima_renovacion").length,
    sinDato: contratos.length - conAbono.length,
    ratios,
  };
  const sinMedidas = vigentes.filter((o) => tipoContrato(o.x_studio_tipo_de_contrato) === "Obra" && !o.x_permiso_m2 && !o.x_permiso_metros_lineales);
  const m2 = {
    m2: r0(vigentes.reduce((a, o) => a + (Number(o.x_permiso_m2) || 0), 0)),
    ml: r0(vigentes.reduce((a, o) => a + (Number(o.x_permiso_metros_lineales) || 0), 0)),
    obraSinMedidas: sinMedidas.length,
    sinMedidas: sinMedidas.map((o) => o.name).sort(),
  };
  const clientes = new Map<string, { contratos: number; abonoArs: number }>();
  for (const f of contratos) {
    const c = clientes.get(f.cliente) ?? { contratos: 0, abonoArs: 0 };
    c.contratos++;
    c.abonoArs += f.abonoArs ?? 0;
    clientes.set(f.cliente, c);
  }
  const totalAbono = abono.totalArs ?? 0;
  const topClientes = [...clientes.entries()]
    .map(([cliente, c]) => ({ cliente, contratos: c.contratos, abonoArs: c.abonoArs, pct: totalAbono > 0 ? Math.round((c.abonoArs / totalAbono) * 1000) / 10 : 0 }))
    .sort((a, b) => b.abonoArs - a.abonoArs)
    .slice(0, 15);

  // Calidad: armados que figuran devueltos.
  const devueltos = e.ordenes.filter((o) => (o.x_studio_estado_de_obra === "Armado" || o.x_studio_estado_de_obra === "Pendiente de Desarme") && o.rental_status === "returned");
  const porTipoDev: Record<string, number> = {};
  for (const o of devueltos) { const t = tipoContrato(o.x_studio_tipo_de_contrato); porTipoDev[t] = (porTipoDev[t] ?? 0) + 1; }

  // §3 Devolución vencida.
  const dev = vigentes
    .filter((o) => { const d = fechaAr(o.rental_return_date); return d != null && d < hoy; })
    .map((o) => fila(o, diasEntre(fechaAr(o.rental_return_date)!, hoy)))
    .sort((a, b) => (b.diasVencido ?? 0) - (a.diasVencido ?? 0) || a.orden.localeCompare(b.orden));
  const devSinFact = dev.filter((f) => !f.sigueFacturando);
  const tramos = ["0-30", "31-90", "91-180", "+180"].map((rango) => ({ rango, contratos: dev.filter((f) => tramoAntiguedad(f.diasVencido!) === rango).length }));

  // §4 Fin de obra estimado vencido: estado de obra Armado (esté o no en la calle según Alquiler).
  const armadas = e.ordenes.filter((o) => o.x_studio_estado_de_obra === "Armado" && !fuera.has(o.id));
  const fin = armadas
    .filter((o) => { const f = fechaAr(o.x_fecha_fin_obra_estimada); return f != null && f < hoy; })
    .map((o) => fila(o, diasEntre(fechaAr(o.x_fecha_fin_obra_estimada)!, hoy)))
    .sort((a, b) => (b.diasVencido ?? 0) - (a.diasVencido ?? 0) || a.orden.localeCompare(b.orden));

  // §5 Sin renovación en 35 días.
  const limite35 = sumarDias(hoy, -35);
  const viejos = contratos.filter((f) => (f.desde ?? hoy) <= limite35);
  const renovo = (f: FilaContrato) => (f.ultimaRenovacion != null && f.ultimaRenovacion >= limite35) || (f.ultimaFactura != null && f.ultimaFactura >= limite35);
  const sinRen = viejos.filter((f) => !renovo(f)).sort((a, b) => (b.abonoArs ?? 0) - (a.abonoArs ?? 0)).map((f) => ({ ...f, diasVencido: f.devolucion && f.devolucion < hoy ? diasEntre(f.devolucion, hoy) : null }));

  // §8 Vencen en 7 / 15 días. §9 Reservas.
  const vencenEn = (n: number) => contratos.filter((f) => f.devolucion != null && f.devolucion >= hoy && f.devolucion <= sumarDias(hoy, n)).length;
  const reservas = e.ordenes.filter((o) => o.rental_status === "pickup" && o.x_studio_estado_de_obra !== "Armado" && o.x_studio_estado_de_obra !== "Pendiente de Desarme");
  const resVenc = reservas.filter((o) => { const d = fechaAr(o.rental_start_date); return d != null && d < hoy; });

  return {
    hoy,
    hayOrdenes: e.ordenes.length > 0,
    contratos,
    porTipo,
    abono,
    contratoTotalArs: suma(contratos, "contratoArs"),
    m2,
    topClientes,
    reemplazadas: reemplazadas.sort((a, b) => a.orden.localeCompare(b.orden)),
    armadoDevuelto: { total: devueltos.length, porTipo: porTipoDev },
    devolucion: {
      filas: dev,
      abonoArs: suma(dev, "abonoArs"),
      contratoArs: suma(dev, "contratoArs"),
      sinFacturar: devSinFact.length,
      abonoSinFacturarArs: suma(devSinFact, "abonoArs"),
      medianaDias: mediana(dev.map((f) => f.diasVencido!)),
      porAntiguedad: tramos,
    },
    finObra: {
      filas: fin,
      obras: fin.length,
      activasEnAlquiler: fin.filter((f) => f.enLaCalle).length,
      sinFecha: armadas.filter((o) => !o.x_fecha_fin_obra_estimada).length,
      medianaDias: mediana(fin.map((f) => f.diasVencido!)),
    },
    sinRenovacion: {
      filas: sinRen,
      debian: viejos.length,
      renovaron: viejos.length - sinRen.length,
      tasa: viejos.length ? Math.round(((viejos.length - sinRen.length) / viejos.length) * 1000) / 10 : null,
      abonoArs: suma(sinRen, "abonoArs"),
    },
    vencen7: vencenEn(7),
    vencen15: vencenEn(15),
    reservas: { sinArmar: reservas.length, inicioVencido: resVenc.length, contratoVencidoArs: r0(resVenc.reduce((a, o) => a + (o.amount_untaxed ?? 0), 0)) },
    ot: e.ots ? armarOt(e.ots, hoy, (oid) => { const o = oid != null ? porId.get(oid) : undefined; return o ? nombreCliente(o) : null; }, e.otCompletadasSemana) : null,
    flota: e.flota,
  };
}

// ─── Órdenes de trabajo (§10) ───────────────────────────────────────────────────────────

export function resumenOt(lista: FilaOt[]): ResumenOt {
  const j = (t?: string) => Math.round(lista.filter((x) => (t ? x.tipo === t : true)).reduce((a, x) => a + x.jornadas, 0) * 10) / 10;
  const armados = lista.filter((x) => x.tipo === "armado").length;
  const desarmes = lista.filter((x) => x.tipo === "desarme").length;
  return { total: lista.length, armados, desarmes, otros: lista.length - armados - desarmes, jornadas: j(), jornadasArmado: j("armado"), jornadasDesarme: j("desarme") };
}

export function armarOt(ots: OtOdoo[], hoy: string, clienteDeOrden: (orderId: number | null) => string | null, completadasSemana: number | null): NonNullable<DetalleCalle["ot"]> {
  const activas = ots.filter((x) => OT_ACTIVAS.includes(String(x.x_estado)));
  const filas: FilaOt[] = activas.map((x) => {
    const titulo = texto(x.x_name) ?? `Orden de trabajo #${x.id}`;
    const fecha = texto(x.x_fecha_programada);
    const estado = texto(x.x_estado) ?? "pendiente";
    const sem = semaforoHoy({ semaforo: (texto(x.x_hab_semaforo) ?? "rojo") as FilaOt["habilitacion"], vencimiento: texto(x.x_hab_vencimiento), estadoOt: estado, hoy });
    return {
      id: x.id,
      titulo,
      tipo: texto(x.x_tipo) ?? "otro",
      estado,
      fecha,
      orden: m2oNombre(x.x_order_id),
      cliente: clienteDeOrden(m2oId(x.x_order_id)) ?? clienteDeTituloOt(titulo),
      obra: (texto(x.x_direccion_obra) ?? texto(x.x_obra_referencia) ?? "").slice(0, 80),
      cuadrilla: m2oNombre(x.x_cuadrilla_prevista_id),
      jornadas: typeof x.x_jornadas_num === "number" ? x.x_jornadas_num : 0,
      habilitacion: sem,
      adicional: x.x_es_adicional === true,
      diasVencida: fecha && fecha < hoy ? diasEntre(fecha, hoy) : null,
    };
  });
  const lunes = lunesDe(hoy);
  const semana = { desde: lunes, hasta: sumarDias(lunes, 6) };
  const proxima = { desde: sumarDias(lunes, 7), hasta: sumarDias(lunes, 13) };
  const entre = (a: string, b: string) => filas.filter((x) => x.fecha != null && x.fecha >= a && x.fecha <= b).sort((p, q) => p.fecha!.localeCompare(q.fecha!) || p.id - q.id);
  return {
    semana,
    proxima,
    esta: entre(semana.desde, semana.hasta),
    prox: entre(proxima.desde, proxima.hasta),
    vencidas: filas.filter((x) => x.fecha != null && x.fecha < hoy).sort((p, q) => p.fecha!.localeCompare(q.fecha!) || p.id - q.id),
    sinFecha: filas.filter((x) => x.fecha == null).length,
    backlog: resumenOt(filas),
    sinHabilitacionProx2: filas.filter((x) => x.fecha != null && x.fecha >= hoy && x.fecha <= proxima.hasta && (x.habilitacion === "rojo" || x.habilitacion === "vencida")).length,
    completadasSemana,
  };
}

// ─── Cifras, avisos, decisiones y narrativa ─────────────────────────────────────────────

const cant = (n: number, unidad?: string): Valor => ({ tipo: "cantidad", n, ...(unidad ? { unidad } : {}) });
const ars = (n: number | null): Valor => (n == null ? { tipo: "sin_dato", motivo: "No se pudo calcular el abono" } : { tipo: "monto", monto: { ars: n } });
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Comparación contra la foto guardada hace una semana (snapshot). Sin historia, el chip va punteado. */
export function compararSemana(actual: number | null, anterior: { valor: number; fecha: string } | null, polaridad: "↑" | "↓" | null): Comparacion {
  if (actual == null || !anterior) return { delta: null, base: "vs semana anterior", polaridad, motivo: "Todavía no hay historia guardada" };
  if (anterior.valor === 0) return { delta: null, base: `vs ${fcorta(anterior.fecha)}`, polaridad, motivo: "La semana anterior era 0: no hay porcentaje" };
  return { delta: Math.round(((actual - anterior.valor) / anterior.valor) * 1000) / 10, base: `vs ${fcorta(anterior.fecha)}`, polaridad };
}

export type HistoriaCalle = Partial<Record<"en_la_calle" | "dev_vencida" | "ot_vencidas", { valor: number; fecha: string } | null>>;

export function cifrasCalle(d: DetalleCalle, h: HistoriaCalle = {}): Cifra[] {
  const sinOrdenes = "Odoo no devolvió órdenes de alquiler";
  const n = d.contratos.length;
  const tipos = d.porTipo.filter((t) => t.contratos > 0).map((t) => `${t.contratos} ${t.tipo}`).join(" · ");
  const confCalle = d.armadoDevuelto.total > 0
    ? { nivel: "inc" as const, motivo: `${d.armadoDevuelto.total} ${plural(d.armadoDevuelto.total, "orden", "órdenes")} "Armado" o "Pendiente de desarme" ${plural(d.armadoDevuelto.total, "figura devuelta", "figuran devueltas")}` }
    : { nivel: "ok" as const };
  const abonoTxt: Frase = d.abono.totalArs != null ? [{ valor: ars(d.abono.totalArs), kpi: "abono_vigente" }, `/mes de abono sin IVA${tipos ? ` · ${tipos}` : ""}`] : [tipos];
  const ot = d.ot;
  const cifras: Cifra[] = [
    {
      kpi: "en_la_calle",
      valor: d.hayOrdenes ? cant(n) : { tipo: "sin_dato", motivo: sinOrdenes },
      valorMeta: d.hayOrdenes ? n : null,
      confianza: confCalle,
      comparaciones: [compararSemana(d.hayOrdenes ? n : null, h.en_la_calle ?? null, null)],
      contexto: abonoTxt,
    },
    {
      kpi: "abono_vigente",
      valor: !d.hayOrdenes ? { tipo: "sin_dato", motivo: sinOrdenes } : ars(d.abono.totalArs),
      regla: "foto",
      valorMeta: d.abono.totalArs,
      confianza: d.abono.estimados > 0 ? { nivel: "inc", motivo: `${d.abono.estimados} ${plural(d.abono.estimados, "contrato todavía no renovó", "contratos todavía no renovaron")}: su abono es estimado` } : { nivel: "ok" },
      contexto: d.abono.estimados > 0 ? [`${n} contratos · `, { valor: ars(d.abono.estimadoArs) }, ` estimado en ${d.abono.estimados} que todavía no renovaron`] : [`${n} contratos`],
    },
    {
      kpi: "m2",
      valor: !d.hayOrdenes ? { tipo: "sin_dato", motivo: sinOrdenes } : d.m2.m2 > 0 ? cant(d.m2.m2, "m²") : { tipo: "sin_dato", motivo: "Ningún contrato en la calle tiene m² cargados" },
      valorMeta: d.m2.m2 || null,
      confianza: d.m2.obraSinMedidas > 0 ? { nivel: "inc", motivo: `${d.m2.obraSinMedidas} ${plural(d.m2.obraSinMedidas, "contrato de Obra", "contratos de Obra")} sin m² cargados` } : { nivel: "ok" },
      contexto: [{ valor: cant(d.m2.ml, "m lineales") }, " de pantalla"],
    },
    {
      kpi: "dev_vencida",
      valor: d.hayOrdenes ? cant(d.devolucion.filas.length) : { tipo: "sin_dato", motivo: sinOrdenes },
      valorMeta: d.hayOrdenes ? d.devolucion.filas.length : null,
      confianza: { nivel: "ver", motivo: "La fecha pactada no se corre al renovar" },
      comparaciones: [compararSemana(d.hayOrdenes ? d.devolucion.filas.length : null, h.dev_vencida ?? null, "↓")],
      contexto: ["contratos · abono ", { valor: ars(d.devolucion.abonoArs) }, "/mes · ", { valor: cant(d.devolucion.sinFacturar, "sin facturar +40 d"), nodo: { tipo: "dev_vencida", f: "sin" } }],
    },
    {
      kpi: "fin_vencido",
      valor: d.hayOrdenes ? cant(d.finObra.obras, "obras") : { tipo: "sin_dato", motivo: sinOrdenes },
      valorMeta: d.hayOrdenes ? d.finObra.obras : null,
      confianza: d.finObra.sinFecha > 0 ? { nivel: "inc", motivo: `${d.finObra.sinFecha} obras armadas sin fin estimado cargado` } : { nivel: "ok" },
      contexto: d.finObra.medianaDias != null ? [`mediana ${Math.round(d.finObra.medianaDias)} días vencido · sin desarmar`] : ["sin desarmar"],
    },
    {
      kpi: "ot_vencidas",
      valor: ot ? cant(ot.vencidas.length) : { tipo: "sin_dato", motivo: "No se pudieron leer las órdenes de trabajo" },
      valorMeta: ot ? ot.vencidas.length : null,
      confianza: { nivel: "ok" },
      comparaciones: [compararSemana(ot ? ot.vencidas.length : null, h.ot_vencidas ?? null, "↓")],
      contexto: ot ? [`${ot.vencidas[0]?.fecha ? `desde ${fcorta(ot.vencidas[0].fecha)} · ` : ""}${ot.sinFecha} sin fecha`] : undefined,
    },
  ];
  return cifras;
}

export function avisosCalle(d: DetalleCalle): Aviso[] {
  const avisos: Aviso[] = [];
  if (d.armadoDevuelto.total > 0) {
    const t = d.armadoDevuelto.porTipo;
    avisos.push({
      id: "armado_devuelto", nivel: "inc", origen: "auto", afecta: ["en_la_calle"], quien: "Comercial / Depósito", que: "Corregir el estado de obra o el de alquiler.",
      aviso: [`${d.armadoDevuelto.total} órdenes "Armado" figuran devueltas en Alquiler`],
      detalle: [`Por tipo: ${Object.entries(t).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${v} ${k}`).join(", ")}.`],
    });
  }
  if (d.reemplazadas.length) {
    const porObra = new Map<string, Reemplazada[]>();
    for (const r of d.reemplazadas) porObra.set(`${r.obra}|${r.por}`, [...(porObra.get(`${r.obra}|${r.por}`) ?? []), r]);
    const det = [...porObra.values()].map((rs) => `${rs.map((r) => r.orden).join(" y ")} (${rs[0].obra || nombreLindo(rs[0].cliente)}) se facturan en ${rs[0].por}`).join("; ");
    avisos.push({
      id: "ordenes_reemplazadas", nivel: "inc", origen: "auto", afecta: ["en_la_calle", "dev_vencida", "abono_vigente"], quien: "Comercial",
      que: `Cerrar ${d.reemplazadas.length === 1 ? "la orden reemplazada" : "las órdenes reemplazadas"}.`,
      aviso: [`${d.reemplazadas.length} ${d.reemplazadas.length === 1 ? "orden abierta" : "órdenes abiertas"} en obras que ya se facturan por otra orden`],
      detalle: [`${det}. Dirección cuenta cada obra una vez; Odoo las sigue contando "en la calle".`],
    });
  }
  if (d.finObra.sinFecha > 0) {
    avisos.push({ id: "fin_sin_fecha", nivel: "inc", origen: "auto", afecta: ["fin_vencido"], quien: "Comercial", que: "Pedirlo obligatorio al confirmar.", aviso: [`${d.finObra.sinFecha} obras armadas sin fin de obra estimado`] });
  }
  if (d.m2.obraSinMedidas > 0) {
    avisos.push({ id: "m2_sin_cargar", nivel: "inc", origen: "auto", afecta: ["m2"], quien: "Comercial", que: "Cargar los m² o los metros lineales del permiso.", aviso: [`${d.m2.obraSinMedidas} contratos de Obra en la calle sin m² ni metros lineales`], detalle: [d.m2.sinMedidas.join(", ")] });
  }
  avisos.push({
    id: "flota_no_medible", nivel: "inf", origen: "auto", afecta: [], quien: "Depósito", que: "Conteo físico y un remito por obra.",
    aviso: ["La utilización de la flota no se puede medir todavía"],
    detalle: ["El stock \"en obra\" viene de un ajuste con números redondos y el alquiler por m² no mueve stock."],
  });
  return avisos;
}

export function decisionesCalle(d: DetalleCalle): Decision[] {
  const out: Decision[] = [];
  const dv = d.devolucion;
  if (dv.sinFacturar > 0) {
    out.push({
      id: "devolucion", sev: "rojo", pantalla: "calle", duenoSugerido: "Joaquín", vence: null, ver: { tipo: "dev_vencida", f: "sin" },
      corto: [{ valor: cant(dv.sinFacturar, "alquileres vencidos sin facturar"), nodo: { tipo: "dev_vencida", f: "sin" } }, " (", { valor: ars(dv.abonoSinFacturarArs) }, "/mes)"],
      que: [{ valor: cant(dv.filas.length, "alquileres"), kpi: "dev_vencida" }, " con devolución vencida; ", { valor: cant(dv.sinFacturar) }, " sin facturar hace más de 40 días (abono ", { valor: ars(dv.abonoSinFacturarArs) }, "/mes)"],
      pregunta: "¿Renovar, facturar o retirar?",
    });
  }
  const sr = d.sinRenovacion;
  if (sr.filas.length > 0) {
    out.push({
      id: "sin_renov", sev: "ambar", pantalla: "calle", duenoSugerido: null, vence: null, ver: { tipo: "sin_renovacion" },
      corto: [{ valor: cant(sr.filas.length, "contratos"), nodo: { tipo: "sin_renovacion" } }, " sin renovación en 35 días (", { valor: ars(sr.abonoArs) }, "/mes)"],
      que: [{ valor: cant(sr.filas.length, "contratos"), nodo: { tipo: "sin_renovacion" } }, " en la calle sin renovación en 35 días (abono ", { valor: ars(sr.abonoArs) }, "/mes)"],
      pregunta: "¿Están facturados en otra orden o se dejó de cobrar?",
    });
  }
  return out;
}

export function oracionesCalle(d: DetalleCalle): Oracion[] {
  const out: Oracion[] = [];
  const dv = d.devolucion;
  if (dv.filas.length > 0) {
    out.push({
      id: "dev", prioridad: 80,
      frase: ["Hay ", { valor: cant(dv.filas.length, "alquileres"), kpi: "dev_vencida" }, " con devolución vencida; ",
        dv.sinFacturar > 0 ? `${dv.sinFacturar} no se facturan hace más de 40 días.` : "todos se siguen facturando."],
    });
  }
  const ot = d.ot;
  if (ot && ot.vencidas.length > 0) {
    out.push({
      id: "ot", prioridad: 50,
      frase: ["Hay ", { valor: cant(ot.vencidas.length, ot.vencidas.length === 1 ? "orden de trabajo vencida" : "órdenes de trabajo vencidas"), kpi: "ot_vencidas" }, `, la más vieja del ${fcorta(ot.vencidas[0].fecha)}.`],
    });
  }
  return out;
}

// ─── Resumen para La semana ─────────────────────────────────────────────────────────────

/**
 * Lo que La semana toma de En la calle. Uso (en calculo/semana.ts):
 *
 *   const calle = await ctx.pantalla<DetalleCalle>("calle");
 *   const rc = resumenCalle(calle);
 *   // rc.tarjeta → la tarjeta "¿Qué está afuera y vencido?" (TarjetaPregunta)
 *   // rc.oraciones → candidatas de la narrativa (prioridad 80 y 50)
 *   // rc.decisiones → "Para decidir" (devolucion rojo, sin_renov ámbar)
 *   // rc.reunion → las 6 devoluciones sin facturar más grandes (Modo reunión)
 *   // rc.cifras → los números sueltos (abono, devolución, fin de obra, renovación, OT)
 *
 * Nada de esto es reservado (no hay datos de socios en la calle).
 */
export type ResumenCalle = {
  tarjeta: Cifra;
  oraciones: Oracion[];
  decisiones: Decision[];
  reunion: { orden: string; cliente: string; abonoArs: number | null; diasSinFacturar: number | null }[];
  cifras: {
    contratos: number;
    abonoMensualArs: number | null;
    devolucion: { contratos: number; abonoArs: number; sinFacturar: number; abonoSinFacturarArs: number };
    finVencido: { obras: number; sinFecha: number };
    sinRenovacion: { contratos: number; abonoArs: number; tasa: number | null };
    vencen7: number;
    vencen15: number;
    otVencidas: { n: number; masVieja: string | null } | null;
  };
};

export function resumenCalle(r: { cifras: Cifra[]; detalle: DetalleCalle | null; decisiones?: Decision[]; oraciones?: Oracion[] }): ResumenCalle | null {
  const d = r.detalle;
  if (!d) return null;
  const dv = d.devolucion;
  const base = r.cifras.find((c) => c.kpi === "dev_vencida");
  const tarjeta: Cifra = {
    kpi: "dev_vencida",
    id: "semana_dev_vencida",
    valor: d.hayOrdenes ? cant(dv.filas.length, "contratos") : { tipo: "sin_dato", motivo: "Odoo no devolvió órdenes de alquiler" },
    valorMeta: d.hayOrdenes ? dv.filas.length : null,
    confianza: base?.confianza ?? { nivel: "ver", motivo: "La fecha pactada no se corre al renovar" },
    comparaciones: base?.comparaciones ?? [],
    contexto: [
      "Abono ", { valor: ars(dv.abonoArs) }, "/mes · ",
      { valor: cant(dv.sinFacturar, "sin facturar hace +40 días"), nodo: { tipo: "dev_vencida", f: "sin" } },
      " · + ", { valor: cant(d.finObra.obras, "obras"), kpi: "fin_vencido" }, ` con fin estimado vencido${d.finObra.sinFecha ? ` (y ${d.finObra.sinFecha} sin fecha cargada)` : ""}`,
    ],
  };
  return {
    tarjeta,
    oraciones: r.oraciones ?? oracionesCalle(d),
    decisiones: r.decisiones ?? decisionesCalle(d),
    reunion: dv.filas.filter((f) => !f.sigueFacturando).sort((a, b) => (b.abonoArs ?? 0) - (a.abonoArs ?? 0)).slice(0, 6)
      .map((f) => ({ orden: f.orden, cliente: f.cliente, abonoArs: f.abonoArs, diasSinFacturar: f.diasSinFacturar })),
    cifras: {
      contratos: d.contratos.length,
      abonoMensualArs: d.abono.totalArs,
      devolucion: { contratos: dv.filas.length, abonoArs: dv.abonoArs, sinFacturar: dv.sinFacturar, abonoSinFacturarArs: dv.abonoSinFacturarArs },
      finVencido: { obras: d.finObra.obras, sinFecha: d.finObra.sinFecha },
      sinRenovacion: { contratos: d.sinRenovacion.filas.length, abonoArs: d.sinRenovacion.abonoArs, tasa: d.sinRenovacion.tasa },
      vencen7: d.vencen7,
      vencen15: d.vencen15,
      otVencidas: d.ot ? { n: d.ot.vencidas.length, masVieja: d.ot.vencidas[0]?.fecha ?? null } : null,
    },
  };
}
