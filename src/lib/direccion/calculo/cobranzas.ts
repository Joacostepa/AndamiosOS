// Calculador de Cobranzas (/direccion/cobranzas). ¿Quién nos debe, desde cuándo y a quién
// llamamos hoy?
//
// Fuente: Odoo-Claude/direccion/datos/cobranzas_definiciones.md (indicadores 1–13) y la
// maqueta aprobada (§3.3 y §7.4). Las reglas puras están en ./cobranzas-reglas.ts (con test).
//
// Qué lee de Odoo (SÓLO lectura, vía ../odoo-lectura.ts):
//  · account.move.line abiertas de Deudores locales (1.1.3.01.010): por cobrar, composición,
//    aging con vencimiento efectivo y neteo FIFO, rechazos, cobros sin imputar, clientes.
//  · account.move de esas facturas: plazo de pago, vendedora, pedido, total.
//  · formatted_read_group de la cuenta por mes (saldo de cierre → DSO y control) y de las
//    facturas con IVA por día (ventana de 90 días del DSO).
//  · account.partial.reconcile de 12 meses: días reales de cobro y último cobro por cliente.
//  · asientos que acreditan Deudores (12 meses) con todas sus líneas: cobrado por mes,
//    prorrateado entre dinero, retenciones y ajustes.
// Configuración propia (Supabase, direccion_config clave "cobranzas"): qué clientes son del
// Estado (regla por nombre + excepciones) y los días de las facturas sin plazo. Sin la tabla,
// valores por defecto.
//
// Para La semana: `resumenCobranzas(r)` (al final) devuelve la tarjeta, la narrativa y las
// decisiones de esta pantalla.

import { definirCalculador, type CtxCalculo } from "./contrato.ts";
import { formattedReadGroup, motivoPublico, read, searchCount, searchRead, searchReadTodo } from "../odoo-lectura.ts";
import { tcEn } from "../dolar.ts";
import { diasEntre, fcorta, mesEtq, monto, nombreLindo, sinDato, sumarDias } from "../formato.ts";
import { polaridadDe } from "../diccionario.ts";
import { historiaCifra } from "../snapshot.ts";
import {
  CODIGO_DEUDORES,
  CONFIG_DEFECTO,
  TRAMOS_MAS_30,
  TRAMOS_MAS_60,
  clasificarPartida,
  concentracion,
  dso as calcDso,
  esDocumento,
  leerConfigCobranzas,
  medioDeDiario,
  mesesEntre,
  netearFifo,
  noLlamar,
  posiblesDuplicadas,
  refacturaciones,
  DIAS_REFACTURACION,
  type NcAnulacion,
  promedioPonderado,
  prorratearCobro,
  rechazoEnRiesgo,
  sectorDe,
  sumaVentana,
  sumarTramos,
  tramoDe,
  ventanaDso,
  vencimientoEfectivo,
  type ClaveTramo,
  type ConfigCobranzas,
  type Medio,
  type TipoPartida,
  type TotalTramo,
} from "./cobranzas-reglas.ts";
import type { Aviso, Cifra, Comparacion, Decision, Frase, Monto, Oracion, ResultadoCalculador, Valor } from "../tipos.ts";

// ─── Tipos del detalle (los usan la vista, los nodos de desglose y La semana) ────────────

export type TramoCob = { clave: ClaveTramo; etiqueta: string; monto: Monto; partidas: number };

/** Una partida abierta, tal cual está en Odoo (sin netear) más el neto del aging. */
export type PartidaCob = {
  id: number;
  moveId: number;
  comprobante: string;
  partnerId: number;
  tipo: TipoPartida;
  fecha: string;
  /** Vencimiento cargado en Odoo (date_maturity). */
  vencOdoo: string | null;
  /** Vencimiento efectivo (plazo o emisión + N días; rechazos desde el asiento). */
  venc: string;
  criterio: string;
  dias: number;
  tramo: ClaveTramo;
  /** amount_residual (con signo). */
  residual: number;
  /** Lo que queda después del neteo FIFO (0 para los créditos). */
  neto: number;
  vendedora: string | null;
  pedido: string | null;
  diario: string;
  detalle: string;
};

export type ClienteCob = {
  partnerId: number;
  nombre: string;
  publico: boolean;
  /** Lo marcó alguien a mano (configuración), no la regla por nombre. */
  sectorManual: boolean;
  /** Saldo neto (facturas + rechazos + débitos − cobros sin imputar). */
  saldo: number;
  /** Neto vencido (> 0 días), +30 y +90, después del neteo FIFO. */
  vencido: number;
  venc30: number;
  venc90: number;
  facturas: number;
  rechazado: number;
  otrosDebitos: number;
  /** Cobros sin imputar, en positivo. */
  sinImputar: number;
  /** Facturas y NC abiertas (bruto). */
  enFacturas: number;
  /** Días de atraso de la partida neta más vieja; null = al día. */
  diasMax: number | null;
  vendedora: string | null;
  ultimoCobro: string | null;
  /** Días reales de cobro de los últimos 12 meses (ponderado por monto). */
  diasPago: number | null;
  noLlamar: boolean;
  rechazoRiesgo: number;
  /** Avisos de datos del cliente ("FA-B 585 y FA-B 586: mismo día e importe"). */
  avisos: string[];
};

export type MovRechazo = { moveId: number; partnerId: number; cliente: string; comprobante: string; fecha: string; dias: number; ars: number; detalle: string };
export type MovSinImputar = MovRechazo & { diario: string; compensa: boolean };

export type MesCobrado = {
  mes: string;
  parcial: boolean;
  /** Cobrado = dinero + retenciones. usd = cada asiento al dólar de su fecha. */
  monto: Monto;
  dinero: number;
  retenciones: number;
  ajustes: number;
  porMedio: Record<Medio, number>;
  rechazosDevoluciones: number | null;
  diasReales: number | null;
};

export type MesDso = { mes: string; saldo: number; ventas: number; ventana: number; dias: number | null };

export type DetalleCobranzas = {
  hoy: string;
  diasSinPlazo: number;
  saldo: number;
  /** Control: Σ balance de todas las líneas de la cuenta (tiene que dar el saldo). */
  saldoContable: number | null;
  composicion: { facturas: number; rechazados: number; debitos: number; sinImputar: number };
  cantFacturas: number;
  clientesConSaldo: number;
  tramos: TramoCob[];
  saldoAFavor: { ars: number; clientes: { partnerId: number; nombre: string; ars: number }[] };
  /** "Como lo ve Odoo hoy": sólo facturas, vencimiento cargado, sin netear. */
  tramosOdoo: TramoCob[];
  tramosEstado: TramoCob[];
  tramosPrivados: TramoCob[];
  pctSinPlazoSaldo: number | null;
  sector: { patron: string; manuales: number; publico: { ars: number; venc60: number; venc90: number }; privado: { ars: number; venc60: number; venc90: number } };
  concentracion: { top10Pct: number | null; hhi: number | null; mayor: { partnerId: number; nombre: string; pct: number; ars: number; diasMax: number | null; publico: boolean } | null };
  clientes: ClienteCob[];
  vendedoras: string[];
  partidas: PartidaCob[];
  rechazados: { total: number; riesgo: number; compensado: number; lista: MovRechazo[] };
  debitos: MovRechazo[];
  sinImputar: { total: number; contraFacturas: number; compensan: number; lista: MovSinImputar[] };
  dso: { hoy: number | null; ventanaHoy: number; cierreAnterior: MesDso | null; promedio12: number | null; serie: MesDso[] } | null;
  cobrado: MesCobrado[] | null;
  /** Por qué falta una parte (Odoo no respondió esa lectura). */
  faltan: { dso?: string; cobrado?: string; diasReales?: string };
};

// ─── Lecturas de Odoo ───────────────────────────────────────────────────────────────────

type M2o = [number, string] | false;
type LineaAbierta = {
  id: number; move_id: M2o; move_name: string; partner_id: M2o; date: string; date_maturity: string | false;
  amount_residual: number; journal_id: M2o; name: string | false; ref: string | false; move_type: string; invoice_date: string | false;
};
type Factura = {
  id: number; name: string; invoice_date: string | false; invoice_payment_term_id: M2o; invoice_user_id: M2o;
  invoice_origin: string | false; amount_total_signed: number;
};

const nombreDe = (m: M2o): string => (m ? String(m[1]).replace(/\s+/g, " ").trim() : "");
const idDe = (m: M2o): number => (m ? m[0] : 0);
/** Primer día del mes que está `n` meses antes del de `hoy`. */
const mesesAtras = (hoy: string, n: number): string => {
  const [y, m] = hoy.split("-").map(Number);
  const t = y * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const finDeMes = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
};
const suma = <T,>(l: readonly T[], f: (x: T) => number): number => l.reduce((a, x) => a + (f(x) || 0), 0);
const grupo = (x: Record<string, unknown>, k: string): string | null => {
  const v = x[k] as [string, string] | false | undefined;
  return v ? String(v[0]) : null;
};

async function idCuentaDeudores(): Promise<number> {
  const r = await searchRead<{ id: number }>("account.account", [["code", "=", CODIGO_DEUDORES]], ["id"], { limit: 1 });
  if (!r[0]) throw new Error(`No se encontró la cuenta ${CODIGO_DEUDORES} (Deudores locales) en Odoo.`);
  return r[0].id;
}

async function leerConfig(ctx: CtxCalculo): Promise<ConfigCobranzas> {
  try {
    const { data, error } = await ctx.supabase().from("direccion_config").select("valor").eq("clave", "cobranzas").maybeSingle();
    if (error || !data) return CONFIG_DEFECTO;
    return leerConfigCobranzas(data.valor);
  } catch {
    return CONFIG_DEFECTO;
  }
}

/** Saldo de la cuenta al cierre de cada mes (acumulado) y el total. */
async function saldosPorMes(cuenta: number): Promise<{ porMes: [string, number][]; total: number }> {
  const g = await formattedReadGroup<Record<string, unknown>>("account.move.line", [["account_id", "=", cuenta], ["parent_state", "=", "posted"]], ["date:month"], ["balance:sum"]);
  const filas = g
    .map((x) => ({ mes: (grupo(x, "date:month") ?? "").slice(0, 7), bal: Number(x["balance:sum"] ?? 0) }))
    .filter((x) => x.mes)
    .sort((a, b) => a.mes.localeCompare(b.mes));
  const porMes: [string, number][] = [];
  let acum = 0;
  for (const f of filas) {
    acum += f.bal;
    porMes.push([f.mes, acum]);
  }
  return { porMes, total: acum };
}

/** Facturado con IVA (facturas − NC) por día, desde `desde`. */
async function ventasDiarias(desde: string): Promise<Map<string, number>> {
  const g = await formattedReadGroup<Record<string, unknown>>(
    "account.move",
    [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["invoice_date", ">=", desde]],
    ["invoice_date:day"],
    ["amount_total_signed:sum"],
  );
  const m = new Map<string, number>();
  for (const x of g) {
    const d = grupo(x, "invoice_date:day");
    if (d) m.set(d.slice(0, 10), Number(x["amount_total_signed:sum"] ?? 0));
  }
  return m;
}

/** Fecha de la primera factura publicada (Odoo arranca ahí: el DSO no inventa ventas antes). */
async function primeraFactura(): Promise<string | null> {
  const r = await searchRead<{ invoice_date: string | false }>(
    "account.move",
    [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_date", "!=", false]],
    ["invoice_date"],
    { order: "invoice_date asc", limit: 1 },
  );
  return r[0]?.invoice_date || null;
}

type Cobro = { partnerId: number; fecha: string; dias: number; ars: number };

/** Partidas de factura canceladas por un cobro (no por NC) desde `desde`: días reales de cobro. */
async function cobrosDeFacturas(cuenta: number, desde: string): Promise<Cobro[]> {
  const parciales = await searchReadTodo<{ id: number; debit_move_id: M2o; amount: number; max_date: string | false }>(
    "account.partial.reconcile",
    [
      ["debit_move_id.account_id", "=", cuenta],
      ["debit_move_id.move_id.move_type", "=", "out_invoice"],
      ["credit_move_id.move_id.move_type", "not in", ["out_invoice", "out_refund"]],
      ["max_date", ">=", desde],
    ],
    ["debit_move_id", "amount", "max_date"],
  );
  const ids = [...new Set(parciales.map((p) => idDe(p.debit_move_id)).filter(Boolean))];
  const lineas = new Map<number, { partner: number; fecha: string }>();
  for (let i = 0; i < ids.length; i += 1000) {
    const l = await read<{ id: number; partner_id: M2o; invoice_date: string | false; date: string }>("account.move.line", ids.slice(i, i + 1000), ["partner_id", "invoice_date", "date"]);
    for (const x of l) lineas.set(x.id, { partner: idDe(x.partner_id), fecha: x.invoice_date || x.date });
  }
  const out: Cobro[] = [];
  for (const p of parciales) {
    const l = lineas.get(idDe(p.debit_move_id));
    if (!l || !p.max_date) continue;
    out.push({ partnerId: l.partner, fecha: p.max_date, dias: Math.max(0, diasEntre(l.fecha, p.max_date)), ars: p.amount });
  }
  return out;
}

type CobroMes = { ars: number; usd: number | null; dinero: number; retenciones: number; ajustes: number; porMedio: Record<Medio, number> };

/** Indicador 13: cobrado por mes (dinero + retenciones), prorrateado asiento por asiento. */
async function cobradoPorMes(cuenta: number, desde: string, ctx: CtxCalculo): Promise<{ meses: Map<string, CobroMes>; rechazos: Map<string, number> }> {
  const creditos = await searchReadTodo<{ id: number; move_id: M2o; date: string; journal_id: M2o }>(
    "account.move.line",
    [["account_id", "=", cuenta], ["parent_state", "=", "posted"], ["balance", "<", 0], ["move_id.move_type", "not in", ["out_invoice", "out_refund"]], ["date", ">=", desde]],
    ["move_id", "date", "journal_id"],
  );
  const asientos = new Map<number, { fecha: string; diario: number; nombreDiario: string }>();
  for (const c of creditos) asientos.set(idDe(c.move_id), { fecha: c.date, diario: idDe(c.journal_id), nombreDiario: nombreDe(c.journal_id) });
  const ids = [...asientos.keys()];
  const lineas: { move_id: M2o; account_id: M2o; balance: number }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    lineas.push(...(await searchReadTodo<{ move_id: M2o; account_id: M2o; balance: number }>("account.move.line", [["move_id", "in", ids.slice(i, i + 500)]], ["move_id", "account_id", "balance"])));
  }
  const codigos = new Map<number, string>();
  for (const a of await read<{ id: number; code: string | false }>("account.account", [...new Set(lineas.map((l) => idDe(l.account_id)))], ["code"])) codigos.set(a.id, String(a.code || ""));
  const tipoDiario = new Map<number, string>();
  for (const j of await read<{ id: number; type: string }>("account.journal", [...new Set([...asientos.values()].map((a) => a.diario))], ["type"])) tipoDiario.set(j.id, j.type);

  const porAsiento = new Map<number, { codigo: string; balance: number }[]>();
  for (const l of lineas) {
    const k = idDe(l.move_id);
    const lista = porAsiento.get(k) ?? [];
    lista.push({ codigo: codigos.get(idDe(l.account_id)) ?? "", balance: l.balance });
    porAsiento.set(k, lista);
  }
  const meses = new Map<string, CobroMes>();
  for (const [id, a] of asientos) {
    const p = prorratearCobro(porAsiento.get(id) ?? []);
    if (!(p.credito > 0)) continue;
    const mes = a.fecha.slice(0, 7);
    const m = meses.get(mes) ?? { ars: 0, usd: 0, dinero: 0, retenciones: 0, ajustes: 0, porMedio: { transferencia: 0, cheques: 0, efectivo: 0, otro: 0 } };
    const cobrado = p.dinero + p.retenciones;
    m.ars += cobrado;
    m.dinero += p.dinero;
    m.retenciones += p.retenciones;
    m.ajustes += p.ajustes;
    m.porMedio[medioDeDiario(a.nombreDiario, tipoDiario.get(a.diario))] += cobrado;
    const tc = tcEn(ctx.dolar, a.fecha);
    m.usd = m.usd == null || !tc ? null : m.usd + cobrado / tc.valor;
    meses.set(mes, m);
  }
  // Rechazos y devoluciones del mes: se muestran aparte, no se restan del cobrado.
  const g = await formattedReadGroup<Record<string, unknown>>(
    "account.move.line",
    [["account_id", "=", cuenta], ["parent_state", "=", "posted"], ["balance", ">", 0], ["move_id.move_type", "not in", ["out_invoice", "out_refund"]], ["journal_id.type", "in", ["bank", "cash"]], ["date", ">=", desde]],
    ["date:month"],
    ["balance:sum"],
  );
  const rechazos = new Map<string, number>();
  for (const x of g) {
    const d = grupo(x, "date:month");
    if (d) rechazos.set(d.slice(0, 7), Number(x["balance:sum"] ?? 0));
  }
  return { meses, rechazos };
}

// ─── Armado ─────────────────────────────────────────────────────────────────────────────

const tramosCob = (t: TotalTramo[]): TramoCob[] => t.map((x) => ({ clave: x.clave, etiqueta: x.etiqueta, monto: { ars: x.ars }, partidas: x.partidas }));

function armarPartidas(lineas: LineaAbierta[], facturas: Map<number, Factura>, hoy: string, diasSinPlazo: number): Omit<PartidaCob, "neto">[] {
  const out: Omit<PartidaCob, "neto">[] = [];
  for (const l of lineas) {
    const texto = [l.name, l.ref].filter(Boolean).join(" ");
    const tipo = clasificarPartida(l.move_type, l.amount_residual, texto);
    if (!tipo) continue;
    const f = facturas.get(idDe(l.move_id));
    const fechaFactura = f?.invoice_date || l.invoice_date || null;
    const { venc, criterio } = vencimientoEfectivo({ tipo, fecha: l.date, fechaFactura, vencOdoo: l.date_maturity || null, tienePlazo: !!f?.invoice_payment_term_id }, diasSinPlazo);
    const dias = diasEntre(venc, hoy);
    out.push({
      id: l.id,
      moveId: idDe(l.move_id),
      comprobante: l.move_name || nombreDe(l.move_id),
      partnerId: idDe(l.partner_id),
      tipo,
      fecha: (esDocumento(tipo) && fechaFactura) || l.date,
      vencOdoo: l.date_maturity || null,
      venc,
      criterio,
      dias,
      tramo: tramoDe(dias),
      residual: l.amount_residual,
      vendedora: f && f.invoice_user_id ? nombreDe(f.invoice_user_id) : null,
      pedido: f?.invoice_origin || null,
      diario: nombreDe(l.journal_id),
      detalle: typeof l.name === "string" ? l.name.replace(/\s+/g, " ").trim() : "",
    });
  }
  return out;
}

/**
 * NC de clientes que anulan una factura (reversed_entry_id), de los clientes con facturas
 * "mismo día e importe" y dentro de los 10 días de esas fechas. Sólo lectura.
 */
async function ncsDeAnulacion(dup: Map<number, string[][]>, facturas: readonly { partnerId: number; fecha: string }[]): Promise<NcAnulacion[]> {
  const clientes = [...dup.keys()];
  if (!clientes.length) return [];
  const fechas = facturas.filter((f) => dup.has(f.partnerId)).map((f) => f.fecha).sort();
  const filas = await searchRead<{ commercial_partner_id: [number, string] | false; partner_id: [number, string] | false; invoice_date: string | false; reversed_entry_id: [number, string] | false }>(
    "account.move",
    [
      ["move_type", "=", "out_refund"], ["state", "=", "posted"], ["reversed_entry_id", "!=", false],
      ["invoice_date", ">=", sumarDias(fechas[0], -DIAS_REFACTURACION)], ["invoice_date", "<=", sumarDias(fechas[fechas.length - 1], DIAS_REFACTURACION)],
      "|", ["partner_id", "in", clientes], ["commercial_partner_id", "in", clientes],
    ],
    ["commercial_partner_id", "partner_id", "invoice_date", "reversed_entry_id"],
    { limit: 500 },
  );
  const salida: NcAnulacion[] = [];
  for (const f of filas) {
    if (!f.invoice_date || !f.reversed_entry_id) continue;
    // reversed_entry_id viene como "FA-B 00007-00000513 (S02163)": el nombre es lo de antes del paréntesis.
    const anula = f.reversed_entry_id[1].replace(/\s*\(.*\)\s*$/, "").trim();
    for (const id of new Set([f.partner_id ? f.partner_id[0] : null, f.commercial_partner_id ? f.commercial_partner_id[0] : null])) {
      if (id != null && dup.has(id)) salida.push({ partnerId: id, fecha: f.invoice_date, anula });
    }
  }
  return salida;
}

async function calcular(ctx: CtxCalculo): Promise<Omit<ResultadoCalculador<DetalleCobranzas>, "pantalla" | "tc">> {
  const hoy = ctx.hoy;
  const [cuenta, cfg] = await Promise.all([idCuentaDeudores(), leerConfig(ctx)]);

  // 1. Partidas abiertas (lo principal: si falla, que tire y se muestre el snapshot).
  const lineas = await searchReadTodo<LineaAbierta>(
    "account.move.line",
    [["account_id", "=", cuenta], ["parent_state", "=", "posted"], ["reconciled", "=", false]],
    ["move_id", "move_name", "partner_id", "date", "date_maturity", "amount_residual", "journal_id", "name", "ref", "move_type", "invoice_date"],
  );
  const idsFact = [...new Set(lineas.filter((l) => l.move_type === "out_invoice" || l.move_type === "out_refund").map((l) => idDe(l.move_id)))];
  const facturasL = await read<Factura>("account.move", idsFact, ["name", "invoice_date", "invoice_payment_term_id", "invoice_user_id", "invoice_origin", "amount_total_signed"]);
  const facturas = new Map(facturasL.map((f) => [f.id, f]));
  const nombres = new Map<number, string>();
  for (const l of lineas) if (l.partner_id) nombres.set(idDe(l.partner_id), nombreDe(l.partner_id));
  const nombre = (id: number) => nombres.get(id) || "Sin cliente";

  const { netas: partidas, aFavor } = netearFifo(armarPartidas(lineas, facturas, hoy, cfg.diasSinPlazo));

  // 2. Lecturas secundarias en paralelo: si una falla, esa parte queda "Sin dato".
  const desde12 = mesesAtras(hoy, 11);
  const faltan: DetalleCobranzas["faltan"] = {};
  const motivo = (e: unknown) => {
    console.warn("[direccion] cobranzas · lectura secundaria:", e instanceof Error ? e.message : e);
    return `Odoo no respondió esta lectura (${motivoPublico(e)})`;
  };
  const [saldos, ventas, primera, cobros, cobrado, sinPlazo] = await Promise.all([
    saldosPorMes(cuenta).catch((e) => { faltan.dso = motivo(e); return null; }),
    ventasDiarias(sumarDias(mesesAtras(hoy, 12), -95)).catch((e) => { faltan.dso = motivo(e); return null; }),
    primeraFactura().catch(() => null),
    cobrosDeFacturas(cuenta, sumarDias(hoy, -365)).catch((e) => { faltan.diasReales = motivo(e); return null; }),
    cobradoPorMes(cuenta, desde12, ctx).catch((e) => { faltan.cobrado = motivo(e); return null; }),
    Promise.all([
      searchCount("account.move", [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_date", ">=", `${hoy.slice(0, 4)}-01-01`], ["invoice_payment_term_id", "=", false]]),
      searchCount("account.move", [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_date", ">=", `${hoy.slice(0, 4)}-01-01`]]),
    ]).catch(() => null),
  ]);

  // 3. Composición y saldo (indicadores 1 y 2).
  const sumTipo = (t: TipoPartida[]) => suma(partidas.filter((p) => t.includes(p.tipo)), (p) => p.residual);
  const composicion = { facturas: sumTipo(["factura", "nc"]), rechazados: sumTipo(["cheque_rechazado"]), debitos: sumTipo(["debito"]), sinImputar: sumTipo(["sin_imputar"]) };
  const saldo = composicion.facturas + composicion.rechazados + composicion.debitos + composicion.sinImputar;

  // 4. Sector y clientes.
  const sector = new Map<number, ReturnType<typeof sectorDe>>();
  for (const id of new Set(partidas.map((p) => p.partnerId))) sector.set(id, sectorDe(id, nombre(id), cfg));
  const esPub = (id: number) => !!sector.get(id)?.publico;

  const cobrosPorCliente = new Map<number, Cobro[]>();
  for (const c of cobros ?? []) {
    const l = cobrosPorCliente.get(c.partnerId) ?? [];
    l.push(c);
    cobrosPorCliente.set(c.partnerId, l);
  }
  const paraDup = partidas
    .filter((p) => p.tipo === "factura")
    .map((p) => ({ partnerId: p.partnerId, fecha: p.fecha, total: facturas.get(p.moveId)?.amount_total_signed ?? p.residual, nombre: p.comprobante }));
  // Las NC que anulan facturas de esos clientes cerca de esas fechas: una refacturación no es
  // una duplicada. Si no se pueden leer, se avisa como antes ("¿duplicada?") — nunca se calla.
  const ncs = await ncsDeAnulacion(posiblesDuplicadas(paraDup), paraDup).catch((e) => {
    console.warn("[direccion] cobranzas · NC de anulación:", e instanceof Error ? e.message : e);
    return [] as NcAnulacion[];
  });
  const dup = posiblesDuplicadas(paraDup, ncs);
  const refact = refacturaciones(paraDup, ncs);

  const clientes: ClienteCob[] = [];
  for (const [partnerId, sec] of sector) {
    const del = partidas.filter((p) => p.partnerId === partnerId);
    const netasPos = del.filter((p) => p.neto > 0);
    const venc = (claves: readonly ClaveTramo[] | null) => suma(netasPos.filter((p) => (claves ? claves.includes(p.tramo) : p.dias > 0)), (p) => p.neto);
    const rechazado = suma(del.filter((p) => p.tipo === "cheque_rechazado"), (p) => p.residual);
    const otrosDebitos = suma(del.filter((p) => p.tipo === "debito"), (p) => p.residual);
    const sinImp = -suma(del.filter((p) => p.tipo === "sin_imputar"), (p) => p.residual);
    const porVendedora = new Map<string, number>();
    for (const p of del) if (p.vendedora && p.residual > 0) porVendedora.set(p.vendedora, (porVendedora.get(p.vendedora) ?? 0) + p.residual);
    const cc = cobrosPorCliente.get(partnerId) ?? [];
    const atrasos = netasPos.filter((p) => p.dias > 0).map((p) => p.dias);
    const saldoCli = suma(del, (p) => p.residual);
    const facturasCli = del.filter((p) => p.tipo === "factura");
    const avisos: string[] = [];
    for (const par of dup.get(partnerId) ?? []) avisos.push(`${par.join(" y ")}: mismo día e importe, ¿duplicada?`);
    for (const r of refact.get(partnerId) ?? []) avisos.push(`${r.nuevas.join(" y ")} (${fcorta(r.fecha)}) reemplazan a ${r.anuladas.join(" y ")}, anuladas con nota de crédito: por la fecha nueva figuran no vencidas. Confirmar los períodos antes de reclamar.`);
    for (const r of del.filter((p) => p.tipo === "cheque_rechazado")) {
      const igual = facturasCli.find((f) => Math.abs(f.residual - r.residual) < 1);
      if (igual) avisos.push(`El rechazo ${r.comprobante} y la factura ${igual.comprobante} son del mismo importe: ¿doble registro?`);
    }
    clientes.push({
      partnerId,
      nombre: nombre(partnerId),
      publico: sec.publico,
      sectorManual: sec.origen === "manual",
      saldo: saldoCli,
      vencido: venc(null),
      venc30: venc(TRAMOS_MAS_30),
      venc90: venc(["d90_mas"]),
      facturas: new Set(facturasCli.map((p) => p.moveId)).size,
      rechazado,
      otrosDebitos,
      sinImputar: sinImp,
      enFacturas: suma(del.filter((p) => esDocumento(p.tipo)), (p) => p.residual),
      diasMax: atrasos.length ? Math.max(...atrasos) : null,
      vendedora: [...porVendedora.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      ultimoCobro: cc.length ? cc.reduce((m, c) => (c.fecha > m ? c.fecha : m), "") : null,
      diasPago: cc.length ? promedioPonderado(cc.map((c) => ({ valor: c.dias, peso: c.ars }))) : null,
      noLlamar: noLlamar({ saldo: saldoCli, sinImputar: sinImp }),
      rechazoRiesgo: rechazoEnRiesgo({ rechazado, otrosDebitos, sinImputar: sinImp }),
      avisos,
    });
  }
  clientes.sort((a, b) => b.saldo - a.saldo);
  const conSaldo = clientes.filter((c) => c.saldo >= 1);

  // 5. Aging (indicadores 3–5 y 7).
  const itemsNetos = partidas.filter((p) => p.neto > 0).map((p) => ({ tramo: p.tramo, ars: p.neto, pub: esPub(p.partnerId) }));
  const tramos = tramosCob(sumarTramos(itemsNetos));
  const tramosEstado = tramosCob(sumarTramos(itemsNetos.filter((i) => i.pub)));
  const tramosPrivados = tramosCob(sumarTramos(itemsNetos.filter((i) => !i.pub)));
  const tramosOdoo = tramosCob(sumarTramos(partidas.filter((p) => esDocumento(p.tipo)).map((p) => ({ tramo: tramoDe(diasEntre(p.vencOdoo ?? p.venc, hoy)), ars: p.residual }))));
  const afavor = aFavor.map((a) => ({ partnerId: a.partnerId, nombre: nombre(a.partnerId), ars: a.ars }));
  const tramo = (k: ClaveTramo) => tramos.find((t) => t.clave === k)?.monto.ars ?? 0;
  const venc30 = suma([...TRAMOS_MAS_30], tramo);
  const venc90 = tramo("d90_mas");

  const enFacturas = partidas.filter((p) => p.tipo === "factura" && p.residual > 0);
  const totFact = suma(enFacturas, (p) => p.residual);
  const sinPlazoSaldo = suma(enFacturas.filter((p) => !facturas.get(p.moveId)?.invoice_payment_term_id), (p) => p.residual);
  const pctSinPlazoSaldo = totFact > 0 ? (sinPlazoSaldo / totFact) * 100 : null;
  const porSector = (pub: boolean) => {
    const its = itemsNetos.filter((i) => i.pub === pub);
    return {
      ars: suma(clientes.filter((c) => c.publico === pub), (c) => c.saldo),
      venc60: suma(its.filter((i) => TRAMOS_MAS_60.includes(i.tramo)), (i) => i.ars),
      venc90: suma(its.filter((i) => i.tramo === "d90_mas"), (i) => i.ars),
    };
  };

  // 6. Concentración (indicador 6).
  const conc = concentracion(clientes.map((c) => c.saldo), saldo);
  const top = conSaldo[0];

  // 7. Rechazos y cobros sin imputar (indicadores 8 y 9).
  const mov = (p: PartidaCob): MovRechazo => ({ moveId: p.moveId, partnerId: p.partnerId, cliente: nombre(p.partnerId), comprobante: p.comprobante, fecha: p.fecha, dias: diasEntre(p.fecha, hoy), ars: Math.abs(p.residual), detalle: p.detalle });
  const cliPorId = new Map(clientes.map((c) => [c.partnerId, c]));
  const listaRech = partidas.filter((p) => p.tipo === "cheque_rechazado").map(mov).sort((a, b) => b.ars - a.ars);
  const totalRech = suma(listaRech, (r) => r.ars);
  const riesgo = suma(clientes, (c) => c.rechazoRiesgo);
  const listaSin: MovSinImputar[] = partidas
    .filter((p) => p.tipo === "sin_imputar")
    .map((p) => {
      const c = cliPorId.get(p.partnerId);
      return { ...mov(p), diario: p.diario, compensa: !!c && c.rechazado + c.otrosDebitos > 0 };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalSin = suma(listaSin, (x) => x.ars);
  const compensan = suma(listaSin.filter((x) => x.compensa), (x) => x.ars);

  // 8. DSO (indicador 11): el saldo al cierre de cada mes contra lo facturado con IVA.
  let dsoD: DetalleCobranzas["dso"] = null;
  if (saldos && ventas) {
    const serie: MesDso[] = [];
    for (const mes of mesesEntre(desde12, hoy)) {
      if (mes >= hoy.slice(0, 7)) break; // el mes en curso es "hoy"
      const s = saldos.porMes.filter(([m]) => m <= mes).at(-1)?.[1];
      if (s == null) continue;
      const fin = finDeMes(mes);
      const vent = ventanaDso(fin, primera);
      const v = sumaVentana(ventas, fin, vent);
      serie.push({ mes, saldo: s, ventas: v, ventana: vent, dias: calcDso(s, v, vent) });
    }
    const ventHoy = ventanaDso(hoy, primera);
    const cerrados = serie.filter((m) => m.dias != null);
    dsoD = {
      hoy: calcDso(saldos.total, sumaVentana(ventas, hoy, ventHoy), ventHoy),
      ventanaHoy: ventHoy,
      cierreAnterior: serie.at(-1) ?? null,
      promedio12: cerrados.length ? suma(cerrados, (m) => m.dias ?? 0) / cerrados.length : null,
      serie,
    };
  }

  // 9. Cobrado por mes (indicador 13) y días reales de cobro por mes (12).
  const cobradoD: MesCobrado[] | null = cobrado
    ? mesesEntre(desde12, hoy).map((mes) => {
        const m = cobrado.meses.get(mes);
        const cc = (cobros ?? []).filter((c) => c.fecha.startsWith(mes));
        return {
          mes,
          parcial: mes === hoy.slice(0, 7),
          monto: m ? { ars: m.ars, usd: m.usd } : { ars: 0, usd: 0 },
          dinero: m?.dinero ?? 0,
          retenciones: m?.retenciones ?? 0,
          ajustes: m?.ajustes ?? 0,
          porMedio: m?.porMedio ?? { transferencia: 0, cheques: 0, efectivo: 0, otro: 0 },
          rechazosDevoluciones: cobrado.rechazos.get(mes) ?? 0,
          diasReales: cobros ? promedioPonderado(cc.map((c) => ({ valor: c.dias, peso: c.ars }))) : null,
        };
      })
    : null;

  const detalle: DetalleCobranzas = {
    hoy,
    diasSinPlazo: cfg.diasSinPlazo,
    saldo,
    saldoContable: saldos ? saldos.total : null,
    composicion,
    cantFacturas: new Set(partidas.filter((p) => p.tipo === "factura").map((p) => p.moveId)).size,
    clientesConSaldo: conSaldo.length,
    tramos,
    saldoAFavor: { ars: suma(afavor, (a) => a.ars), clientes: afavor },
    tramosOdoo,
    tramosEstado,
    tramosPrivados,
    pctSinPlazoSaldo,
    sector: { patron: cfg.patron, manuales: cfg.publicos.length + cfg.privados.length, publico: porSector(true), privado: porSector(false) },
    concentracion: {
      top10Pct: conc.top10Pct,
      hhi: conc.hhi,
      mayor: top && saldo > 0 ? { partnerId: top.partnerId, nombre: top.nombre, pct: (top.saldo / saldo) * 100, ars: top.saldo, diasMax: top.diasMax, publico: top.publico } : null,
    },
    clientes,
    vendedoras: [...new Set(clientes.map((c) => c.vendedora).filter((v): v is string => !!v))].sort(),
    partidas,
    rechazados: { total: totalRech, riesgo, compensado: totalRech - riesgo, lista: listaRech },
    debitos: partidas.filter((p) => p.tipo === "debito").map(mov),
    sinImputar: { total: totalSin, contraFacturas: totalSin - compensan, compensan, lista: listaSin },
    dso: dsoD,
    cobrado: cobradoD,
    faltan,
  };

  return {
    cifras: await armarCifras(detalle, ctx, { venc30, venc90 }),
    detalle,
    avisos: armarAvisos(detalle, sinPlazo),
    decisiones: armarDecisiones(detalle),
    oraciones: armarOraciones(detalle),
  };
}

// ─── Cifras, avisos, decisiones y narrativa ─────────────────────────────────────────────

const M = (ars: number): Valor => monto(ars);
const pctV = (n: number | null | undefined, decimales = 0): Valor => (n == null || !Number.isFinite(n) ? sinDato("No hay saldo por cobrar") : { tipo: "pct", n, decimales });
const nodoCliente = (id: number) => ({ tipo: "cliente", v: String(id) });
const cierra = (a: number, b: number) => Math.abs(a - b) < Math.max(2, Math.abs(b) * 0.0005);

async function comparacionHistoria(ctx: CtxCalculo, kpi: string, actual: number, hoy: string): Promise<Comparacion> {
  const base = "vs hace una semana";
  try {
    const h = await historiaCifra(ctx.supabase(), kpi, { hasta: `${sumarDias(hoy, -7)}T23:59:59-03:00`, limite: 1 });
    const v = h[0]?.cifra.valor;
    if (v?.tipo === "monto" && v.monto.ars > 0) return { delta: (actual / v.monto.ars - 1) * 100, base, polaridad: polaridadDe(kpi) };
  } catch {
    // sin Supabase (script, migración sin aplicar): sin historia
  }
  return { delta: null, base, polaridad: polaridadDe(kpi), motivo: "Todavía no hay historia guardada" };
}

async function armarCifras(d: DetalleCobranzas, ctx: CtxCalculo, t: { venc30: number; venc90: number }): Promise<Cifra[]> {
  const controlOk = d.saldoContable == null || cierra(d.saldoContable, d.saldo);
  const pctV30 = d.saldo > 0 ? (t.venc30 / d.saldo) * 100 : null;
  const mesActual = d.cobrado?.find((m) => m.parcial) ?? null;
  const nRech = d.rechazados.lista.length;
  const cifras: Cifra[] = [
    {
      kpi: "por_cobrar",
      valor: M(d.saldo),
      regla: "saldo",
      confianza: !controlOk
        ? { nivel: "ver", motivo: "No cierra con el saldo contable de la cuenta" }
        : d.sinImputar.total > 0 || d.rechazados.total > 0
          ? { nivel: "inc", motivo: "Cobros sin imputar y rechazos por asiento manual" }
          : { nivel: "ok" },
      contexto: [`${d.cantFacturas} facturas + rechazos − cobros sin imputar · ${d.clientesConSaldo} clientes`],
    },
    {
      kpi: "vencido_30",
      valor: M(t.venc30),
      regla: "saldo",
      confianza: d.pctSinPlazoSaldo != null && d.pctSinPlazoSaldo > 10 ? { nivel: "inc", motivo: "Muchas facturas sin plazo de pago" } : { nivel: "ok" },
      comparaciones: [await comparacionHistoria(ctx, "vencido_30", t.venc30, d.hoy)],
      valorMeta: pctV30,
      contexto: [{ valor: pctV(pctV30) }, " del total · +90 días: ", { valor: M(t.venc90), nodo: { tipo: "vencido_30", g: "tramo" } }],
    },
  ];
  if (d.dso) {
    const c = d.dso.cierreAnterior;
    cifras.push({
      kpi: "dso",
      valor: d.dso.hoy == null ? sinDato("No hay facturación en la ventana") : { tipo: "dias", n: d.dso.hoy },
      confianza: { nivel: "ok" },
      valorMeta: d.dso.hoy,
      comparaciones: [
        c?.dias != null && d.dso.hoy != null
          ? { delta: (d.dso.hoy / c.dias - 1) * 100, base: `vs cierre ${mesEtq(c.mes)}`, polaridad: polaridadDe("dso") }
          : { delta: null, base: "vs cierre del mes anterior", polaridad: polaridadDe("dso"), motivo: "Sin facturación para comparar" },
      ],
      contexto: d.dso.promedio12 != null ? ["promedio 12 meses: ", { valor: { tipo: "dias", n: d.dso.promedio12 } }] : undefined,
    });
  } else {
    cifras.push({ kpi: "dso", valor: sinDato(d.faltan.dso ?? "Odoo no respondió"), confianza: { nivel: "inc", motivo: "Falta la facturación o el saldo por mes" } });
  }
  cifras.push(
    {
      kpi: "rechazados",
      valor: M(d.rechazados.total),
      regla: "saldo",
      confianza: nRech ? { nivel: "inc", motivo: "Cargados a mano, se detectan por texto" } : { nivel: "ok" },
      contexto: nRech
        ? [`${nRech} ${nRech === 1 ? "cheque" : "cheques"} · ⬤ en riesgo `, { valor: M(d.rechazados.riesgo) }, " · ", { valor: M(d.rechazados.compensado) }, " ya compensados con cobros posteriores"]
        : ["Ningún cheque rechazado abierto"],
    },
    {
      kpi: "sin_imputar",
      valor: M(d.sinImputar.total),
      regla: "saldo",
      confianza: { nivel: "ok" },
      contexto: d.sinImputar.lista.length
        ? [`${d.sinImputar.lista.length} partidas · `, { valor: M(d.sinImputar.contraFacturas) }, " contra facturas abiertas (ya pagaron y figuran como deuda) · ", { valor: M(d.sinImputar.compensan) }, " compensan rechazos y débitos"]
        : ["Todos los cobros están imputados"],
    },
    {
      kpi: "cobrado",
      valor: mesActual ? monto(mesActual.monto.ars, mesActual.monto.usd ?? null) : sinDato(d.faltan.cobrado ?? "Odoo no respondió"),
      confianza: mesActual ? { nivel: "ok" } : { nivel: "inc", motivo: "No se pudo leer el cobrado" },
      contexto: mesActual ? [`${mesEtq(mesActual.mes)} al ${fcorta(d.hoy)} · con IVA`] : undefined,
    },
    {
      kpi: "concentracion",
      valor: pctV(d.concentracion.mayor?.pct),
      confianza: { nivel: "ok" },
      valorMeta: d.concentracion.mayor?.pct ?? null,
      contexto: d.concentracion.mayor ? [`${nombreLindo(d.concentracion.mayor.nombre)} · los 10 primeros son el `, { valor: pctV(d.concentracion.top10Pct) }] : undefined,
    },
  );
  return cifras;
}

function armarAvisos(d: DetalleCobranzas, sinPlazo: [number, number] | null): Aviso[] {
  const avisos: Aviso[] = [];
  if (d.saldoContable != null && !cierra(d.saldoContable, d.saldo)) {
    avisos.push({
      id: "cobranzas_control", nivel: "ver", origen: "auto", afecta: ["por_cobrar"], quien: "Administración", que: "Revisar las partidas de Deudores locales.",
      aviso: ["Por cobrar no cierra con la contabilidad: ", { valor: M(d.saldo), kpi: "por_cobrar" }, " contra ", { valor: M(d.saldoContable) }],
    });
  }
  if (d.sinImputar.total > 0) {
    const nombres = (l: MovSinImputar[]) => [...new Set([...l].sort((a, b) => b.ars - a.ars).map((x) => nombreLindo(x.cliente)))].slice(0, 3).join(", ");
    const contra = d.sinImputar.lista.filter((x) => !x.compensa);
    const comp = d.sinImputar.lista.filter((x) => x.compensa);
    avisos.push({
      id: "sin_imputar", nivel: "ver", origen: "auto", afecta: ["por_cobrar", "sin_imputar"], quien: "Administración", que: "Imputar cada cobro a su factura.",
      aviso: ["Cobros sin imputar: ", { valor: M(d.sinImputar.total), kpi: "sin_imputar" }, ` en ${d.sinImputar.lista.length} partidas`],
      detalle: [
        { valor: M(d.sinImputar.contraFacturas) },
        ` van contra facturas abiertas: esos clientes figuran como deudores aunque ya pagaron${contra.length ? ` (${nombres(contra)})` : ""}.`,
        ...(comp.length ? ([" Los otros ", { valor: M(d.sinImputar.compensan) }, ` compensan cheques rechazados y débitos (${nombres(comp)}).`] as Frase) : []),
      ],
    });
  }
  if (sinPlazo && sinPlazo[1] > 0 && sinPlazo[0] / sinPlazo[1] > 0.1) {
    avisos.push({
      id: "sin_plazo", nivel: "inc", origen: "auto", afecta: ["vencido_30", "cobertura"], quien: "Administración", que: "Cargar el plazo de pago en cada cliente.",
      aviso: [`${Math.round((sinPlazo[0] / sinPlazo[1]) * 100)} % de las facturas ${d.hoy.slice(0, 4)} sin plazo de pago`],
      detalle: d.pctSinPlazoSaldo != null ? [`El ${Math.round(d.pctSinPlazoSaldo)} % del saldo en facturas no tiene plazo. Se usa emisión + ${d.diasSinPlazo} días.`] : undefined,
    });
  }
  if (d.rechazados.lista.length) {
    avisos.push({
      id: "rechazos_manual", nivel: "inc", origen: "auto", afecta: ["rechazados", "por_cobrar"], quien: "Administración", que: "Registrar el rechazo con el circuito de cheques y nota de débito.",
      aviso: ["Cheques rechazados cargados como asientos manuales"],
      detalle: ["No reabren la factura: quedan fuera de los reportes que miran sólo facturas."],
    });
  }
  for (const c of d.clientes) {
    c.avisos.forEach((a, i) =>
      avisos.push({
        id: `cobranzas_partida_${c.partnerId}_${i}`, nivel: "inf", origen: "auto", afecta: ["por_cobrar"], quien: "Administración", que: "Confirmar los comprobantes antes de reclamar.",
        aviso: [`${nombreLindo(c.nombre)}: ${a}`],
      }),
    );
  }
  return avisos;
}

function armarDecisiones(d: DetalleCobranzas): Decision[] {
  const out: Decision[] = [];
  const mayor = d.concentracion.mayor;
  if (mayor && mayor.pct > 30 && (mayor.diasMax ?? 0) > 0) {
    const nodo = nodoCliente(mayor.partnerId);
    const nom = nombreLindo(mayor.nombre);
    out.push({
      id: `cobranzas_concentracion_${mayor.partnerId}`,
      sev: (mayor.diasMax ?? 0) > 90 ? "rojo" : "ambar",
      pantalla: "cobranzas",
      duenoSugerido: "Jorge",
      vence: null,
      corto: [`${nom}: `, { valor: M(mayor.ars), nodo }, `, ${mayor.diasMax} días de atraso`],
      que: [`${nom}: `, { valor: M(mayor.ars), nodo }, ", el ", { valor: pctV(mayor.pct) }, ` de lo que nos deben; ${mayor.diasMax} días de atraso máximo`],
      pregunta: mayor.publico ? "¿Carta documento o reunión con el organismo?" : "¿Carta documento o reunión con el cliente?",
      ver: nodo,
    });
  }
  if (d.rechazados.riesgo > 0) {
    const enRiesgo = d.clientes.filter((c) => c.rechazoRiesgo > 0).sort((a, b) => b.rechazoRiesgo - a.rechazoRiesgo);
    const lista: Frase = [];
    enRiesgo.forEach((c, i) => {
      if (i > 0) lista.push(i === enRiesgo.length - 1 ? " y " : ", ");
      lista.push(`${nombreLindo(c.nombre).replace(/^Consorcio (de )?Propietarios /i, "")} `, { valor: M(c.rechazoRiesgo), nodo: nodoCliente(c.partnerId) });
    });
    out.push({
      id: "rechazados",
      sev: "rojo",
      pantalla: "cobranzas",
      duenoSugerido: null,
      vence: null,
      corto: ["Cheques rechazados: ", { valor: M(d.rechazados.riesgo), kpi: "rechazados" }, " en riesgo real"],
      que: [
        "Cheques rechazados: ", { valor: M(d.rechazados.riesgo), kpi: "rechazados" }, " en riesgo real (", ...lista, ")",
        ...(d.rechazados.compensado > 0 ? (["; otros ", { valor: M(d.rechazados.compensado) }, " ya están compensados con cobros sin imputar"] as Frase) : []),
      ],
      pregunta: "¿Quién los gestiona?",
      ver: { tipo: "rechazados" },
    });
  }
  return out;
}

function armarOraciones(d: DetalleCobranzas): Oracion[] {
  const out: Oracion[] = [];
  const mayor = d.concentracion.mayor;
  if (mayor && mayor.pct > 30) {
    out.push({
      id: "cobranzas_concentracion",
      prioridad: 90,
      frase: [
        `${nombreLindo(mayor.nombre)} nos debe `, { valor: M(mayor.ars), kpi: "vencido_30", nodo: nodoCliente(mayor.partnerId) },
        ", el ", { valor: pctV(mayor.pct) }, " de lo que nos deben", mayor.diasMax ? `, con ${mayor.diasMax} días de atraso.` : ".",
      ],
    });
  }
  if (d.rechazados.riesgo > 0) {
    out.push({ id: "cobranzas_rechazados", prioridad: 70, frase: ["Hay ", { valor: M(d.rechazados.riesgo), kpi: "rechazados" }, " en cheques rechazados sin recuperar."] });
  }
  if (d.sinImputar.contraFacturas > 0) {
    out.push({ id: "cobranzas_sin_imputar", prioridad: 40, frase: ["Hay ", { valor: M(d.sinImputar.contraFacturas), kpi: "sin_imputar" }, " de cobros sin imputar: esos clientes ya pagaron y figuran como deudores."] });
  }
  return out;
}

export const calculador = definirCalculador<DetalleCobranzas>({ pantalla: "cobranzas", calcular });

// ─── Para La semana ─────────────────────────────────────────────────────────────────────

export type ResumenCobranzas = {
  /** Tarjeta "¿Quién nos debe?": Por cobrar vencido +30 (valorMeta = % del por cobrar), con el contexto de concentración. */
  tarjeta: Cifra | null;
  /** Para el mini-gráfico de la tarjeta (<BarraTramos tramos={…} />). */
  tramos: TramoCob[];
  /** "45 % de lo que nos deben es de 1 cliente (Ministerio del Interior)". */
  contexto: Frase | null;
  porCobrar: Cifra | null;
  dso: Cifra | null;
  /** Candidatas a la narrativa, con `prioridad`: concentración 90, rechazos 70, sin imputar 40. */
  oraciones: Oracion[];
  /** "Para decidir": mayor deudor (> 30 % y atrasado) y cheques rechazados en riesgo. */
  decisiones: Decision[];
  /** Avisos de calidad de Cobranzas (sin imputar, sin plazo, rechazos manuales, duplicadas). */
  avisos: Aviso[];
};

/**
 * Lo que La semana toma de Cobranzas. En calculo/semana.ts:
 *
 *   import { resumenCobranzas, type DetalleCobranzas } from "./cobranzas.ts";
 *   const cob = resumenCobranzas(await ctx.pantalla<DetalleCobranzas>("cobranzas"));
 *
 * Nada de Cobranzas es reservado (socios).
 */
export function resumenCobranzas(r: ResultadoCalculador<DetalleCobranzas>): ResumenCobranzas {
  const de = (kpi: string) => r.cifras.find((c) => c.kpi === kpi) ?? null;
  const v30 = de("vencido_30");
  const mayor = r.detalle?.concentracion?.mayor ?? null;
  const contexto: Frase | null = mayor ? [{ valor: pctV(mayor.pct) }, ` de lo que nos deben es de 1 cliente (${nombreLindo(mayor.nombre)})`] : null;
  return {
    tarjeta: v30 ? { ...v30, contexto: contexto ?? v30.contexto } : null,
    tramos: r.detalle?.tramos ?? [],
    contexto,
    porCobrar: de("por_cobrar"),
    dso: de("dso"),
    oraciones: r.oraciones ?? [],
    decisiones: r.decisiones ?? [],
    avisos: r.avisos,
  };
}
