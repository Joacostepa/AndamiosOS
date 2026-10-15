// Calculador de Caja (/direccion/caja): ¿cuánta plata hay de verdad y llegamos las
// próximas 8 semanas?
//
// Qué calcula (todo en vivo desde Odoo, sólo lectura; nada del snapshot del 15/10):
//  · Caja disponible por cuenta. Las cuentas quietas (> 30 días sin movimientos) que pesan
//    > 5 % del total quedan "a verificar" y fuera (Borelli); las que Odoo tipifica como caja
//    y no lo son, fuera con su motivo. El dólar billete va en dólares al dólar de hoy.
//  · Cheques en cartera: registro (l10n_latam.check) contra contabilidad (Valores a depositar).
//  · Cheques propios a debitar, dentro y fuera del horizonte de 8 semanas.
//  · Por pagar a proveedores con antigüedad y principales proveedores.
//  · Flujo de 8 semanas en dos escenarios (Proyectado / Sólo lo comprometido), con el
//    colchón mínimo (Supabase, direccion_config; por defecto, 1 mes de sueldos) y la
//    cobertura como fecha. "Queda fuera del flujo, a decidir".
// Reglas: finanzas_definiciones.md §1, §2, §4, §5 y caja-reglas.ts (puras, con test).
//
// RESERVADO: los retiros de socios del escenario proyectado y los dividendos pendientes
// van bajo `detalle.reservado` (se recortan para quien no tiene direccion-socios). Los
// totales por semana sí los incluyen: el saldo proyectado es uno solo para todos.
//
// PARA LA SEMANA: `resumenCaja(resultado)` (abajo) arma las tarjetas, la narrativa, las
// decisiones y los avisos de caja a partir del resultado cacheado de esta pantalla:
//   const r = await ctx.pantalla<DetalleCaja>("caja");
//   const c = resumenCaja(r);   // c.caja, c.cobertura, c.oraciones, c.decisiones, c.avisos

import { definirCalculador, type CtxCalculo } from "./contrato.ts";
import { readGroup, searchRead, searchReadTodo } from "../odoo-lectura.ts";
import { tcEn } from "../dolar.ts";
import { diasEntre, fcorta, fdia, finMes, flarga, mesNombre, monto, nombreLindo, sinDato, sumarDias } from "../formato.ts";
import { historiaCifra } from "../snapshot.ts";
import { esTablaFaltante } from "../supabase.ts";
import { polaridadDe } from "../diccionario.ts";
import { variantes } from "../reservado.ts";
import type { Aviso, Cifra, Comparacion, Decision, Frase, Oracion, ResultadoCalculador, TcDia, Valor } from "../tipos.ts";
import {
  CUENTA_RETIROS_GASTO,
  CUENTAS_PARTICULARES,
  ESCENARIOS,
  TRAMOS,
  cifraCobertura,
  conRetiros,
  tipoNodoCobertura,
  clasificarCuentas,
  cobertura,
  colchonSugerido,
  esPublico,
  estadoCheque,
  fechaPagoIva,
  fechasDelDia,
  filasFlujo,
  indiceSemana,
  lunesAnterior,
  mesesCerrados,
  nombreCorto,
  porSemana,
  repartir,
  retiroNetoUsd,
  semanal,
  semanasDesde,
  sumarMeses,
  supuestosDeGastos,
  totalesCaja,
  tramoPorDias,
  vencimiento,
  type ClaveTramo,
  type Cobertura,
  type Concepto,
  type CuentaCaja,
  type Escenario,
  type EstadoCheque,
  type FilaFlujo,
  type GrupoCaja,
  type LineaRetiro,
  type SemanaRango,
  type Supuestos,
  type TotalesCaja,
} from "./caja-reglas.ts";

export type { Concepto, CuentaCaja, Escenario, FilaFlujo, SemanaRango, Cobertura } from "./caja-reglas.ts";
export { cifraCobertura } from "./caja-reglas.ts";

// ─── Tipos del detalle ─────────────────────────────────────────────────────────────────

export type ChequeTercero = { id: number; numero: string; cliente: string; ars: number; fecha: string; estado: EstadoCheque; pagoId: number | null };
export type ChequePropio = { id: number; numero: string; proveedor: string; ars: number; fecha: string; enFlujo: boolean; pagoId: number | null };
export type ProveedorDeuda = { partnerId: number | null; proveedor: string; saldoArs: number; facturas: number; vencidoArs: number; venceMin: string | null };
export type FueraFlujo = { id: string; concepto: string; ars: number; nota: Frase };

export type DetalleCaja = {
  hoy: string;
  cuentas: CuentaCaja[];
  totales: TotalesCaja;
  /** La cuenta de la que se debitan los cheques propios (Galicia en pesos). */
  cuentaDebitoId: number | null;
  cheques: {
    registro: { cant: number; ars: number };
    contableArs: number;
    aFecha: { cant: number; ars: number };
    recientes: { cant: number; ars: number };
    aVerificar: { cant: number; ars: number; principal: string | null };
    /** A fecha, pero después de las 8 semanas (no entran al flujo). */
    despuesArs: number;
    lista: ChequeTercero[];
  };
  propios: { cant: number; ars: number; enFlujoArs: number; despuesArs: number; lista: ChequePropio[] };
  porPagar: {
    ars: number;
    facturas: number;
    vencidoArs: number;
    aging: { clave: ClaveTramo; etiqueta: string; ars: number }[];
    top: ProveedorDeuda[];
    venceEnHorizonteArs: number;
  };
  flujo: {
    semanas: SemanaRango[];
    saldoInicialArs: number;
    saldoInicialPesosArs: number;
    /** Conceptos visibles para todos (los reservados van en `reservado.conceptos`). */
    conceptos: Concepto[];
    /**
     * Totales por semana SIN los conceptos reservados (así no se deducen los retiros restando
     * renglones). El flujo con retiros, para los socios, va en `reservado.flujo` (conRetiros()).
     */
    escenarios: Record<Escenario, FilaFlujo[]>;
    cobertura: Record<Escenario, Cobertura>;
    escenarioDefecto: Escenario;
    /** Colchón mínimo en pesos. ars 0 = no se pudo calcular el sugerido. */
    colchon: { ars: number; sugeridoArs: number; editado: boolean };
    supuestos: Supuestos & { cobranzaSemanalArs: number | null };
    fuera: FueraFlujo[];
    /** Lo que no se pudo leer y quedó fuera del flujo. */
    faltantes: string[];
  };
  /**
   * Sólo socios: retiros del proyectado, dividendos pendientes y el flujo CON los retiros
   * (escenarios y cobertura; sólo si hubo conceptos reservados). Usar conRetiros(detalle).
   */
  reservado?: {
    conceptos: Concepto[];
    fuera: FueraFlujo[];
    retirosSemanalesArs: number | null;
    flujo?: { escenarios: Record<Escenario, FilaFlujo[]>; cobertura: Record<Escenario, Cobertura> };
  };
};

// ─── Lectura de Odoo ───────────────────────────────────────────────────────────────────

type M2O = [number, string] | false;
const m2oId = (v: M2O | undefined): number | null => (Array.isArray(v) ? v[0] : null);
const m2oNombre = (v: M2O | undefined): string => (Array.isArray(v) ? v[1] : "");

const POSTEADO = ["parent_state", "=", "posted"];

/** Una consulta que puede fallar sin tirar abajo la pantalla (lo que falta queda anotado). */
function opcional<T>(p: Promise<T>): Promise<T | null> {
  return p.catch((e) => {
    console.warn("[direccion] caja:", e instanceof Error ? e.message : e);
    return null;
  });
}

async function leerOdoo(hoy: string) {
  const meses = mesesCerrados(hoy, 3);
  const desdeGastos = `${meses[0]}-01`;
  const hastaGastos = finMes(meses[meses.length - 1]);
  const desdeRetiros = `${sumarMeses(hoy.slice(0, 7), -11)}-01`;

  const [grupos, movs30, terceros, propios, diarios, extractos, proveedores, clientes, deudas, iva, cobranza, gastos, cucha, retiros] = await Promise.all([
    readGroup<{ account_id: M2O; currency_id: M2O; balance: number; amount_currency: number; date: string | false }>(
      "account.move.line",
      [["account_id.account_type", "=", "asset_cash"], POSTEADO, ["date", "<=", hoy]],
      ["balance:sum", "amount_currency:sum", "date:max"],
      ["account_id", "currency_id"],
    ),
    readGroup<{ account_id: M2O; __count: number }>(
      "account.move.line",
      [["account_id.account_type", "=", "asset_cash"], POSTEADO, ["date", "<=", hoy], ["date", ">", sumarDias(hoy, -30)]],
      ["balance:sum"],
      ["account_id"],
    ),
    // Cheques de terceros en cartera: el diario cuya cuenta es Valores a depositar.
    searchRead<{ id: number; name: string; partner_id: M2O; amount: number; payment_date: string | false; payment_id: M2O }>(
      "l10n_latam.check",
      [["current_journal_id.default_account_id.code", "=", "1.1.1.01.06"]],
      ["name", "partner_id", "amount", "payment_date", "payment_id"],
      { limit: 5000, order: "payment_date asc, id asc" },
    ),
    searchRead<{ id: number; name: string; partner_id: M2O; amount: number; payment_date: string | false; payment_id: M2O; original_journal_id: M2O }>(
      "l10n_latam.check",
      [["payment_method_code", "=", "own_checks"], ["issue_state", "=", "handed"]],
      ["name", "partner_id", "amount", "payment_date", "payment_id", "original_journal_id"],
      { limit: 5000, order: "payment_date asc, id asc" },
    ),
    searchRead<{ id: number; name: string; default_account_id: M2O }>("account.journal", [["type", "in", ["bank", "cash"]]], ["name", "default_account_id"], { limit: 500 }),
    opcional(readGroup<{ journal_id: M2O; amount: number; __count: number }>("account.bank.statement.line", [["is_reconciled", "=", false]], ["amount:sum"], ["journal_id"])),
    searchReadTodo<{ id: number; name: string; partner_id: M2O; invoice_date: string | false; invoice_date_due: string | false; amount_residual_signed: number }>(
      "account.move",
      [["move_type", "in", ["in_invoice", "in_refund"]], ["state", "=", "posted"], ["amount_residual", "!=", 0]],
      ["name", "partner_id", "invoice_date", "invoice_date_due", "amount_residual_signed"],
    ),
    opcional(
      searchReadTodo<{ id: number; name: string; partner_id: M2O; invoice_date: string | false; invoice_date_due: string | false; invoice_payment_term_id: M2O; amount_residual_signed: number }>(
        "account.move",
        [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["amount_residual", "!=", 0]],
        ["name", "partner_id", "invoice_date", "invoice_date_due", "invoice_payment_term_id", "amount_residual_signed"],
      ),
    ),
    opcional(readGroup<{ account_id: M2O; balance: number }>("account.move.line", [["account_id.code", "in", ["2.1.3.04.020", "2.1.5.01.00"]], POSTEADO, ["date", "<=", hoy]], ["balance:sum"], ["account_id"])),
    // Posiciones de IVA asentadas y sin pagar.
    opcional(
      searchRead<{ id: number; date: string; move_id: M2O; amount_residual: number }>(
        "account.move.line",
        [["account_id.code", "=", "2.1.3.03.020"], POSTEADO, ["reconciled", "=", false], ["balance", "<", 0], ["date", "<=", hoy]],
        ["date", "move_id", "amount_residual"],
        { limit: 500, order: "date asc" },
      ),
    ),
    // Cobranza de las últimas 12 semanas en Deudores por ventas, desde bancos y cajas.
    opcional(
      readGroup<{ journal_id: M2O; balance: number }>(
        "account.move.line",
        [["account_id.code", "=", "1.1.3.01.010"], POSTEADO, ["move_id.move_type", "=", "entry"], ["journal_id.type", "in", ["bank", "cash"]], ["date", ">=", sumarDias(hoy, -84)], ["date", "<=", sumarDias(hoy, -1)]],
        ["balance:sum"],
        ["journal_id"],
      ),
    ),
    opcional(readGroup<{ account_id: M2O; balance: number }>("account.move.line", [["account_id.code", "=like", "4.2.1.%"], POSTEADO, ["date", ">=", desdeGastos], ["date", "<=", hastaGastos]], ["balance:sum"], ["account_id"])),
    // El alquiler del depósito compensado con un socio: no sale plata.
    opcional(
      searchRead<{ balance: number }>(
        "account.move.line",
        [["account_id.code", "=", "4.2.1.03.18"], ["name", "ilike", "cucha"], POSTEADO, ["date", ">=", desdeGastos], ["date", "<=", hastaGastos]],
        ["balance"],
        { limit: 500 },
      ),
    ),
    opcional(
      searchReadTodo<{ date: string; name: string | false; ref: string | false; move_id: M2O; balance: number; amount_currency: number; currency_id: M2O; account_id: M2O }>(
        "account.move.line",
        [["account_id.code", "in", [...CUENTAS_PARTICULARES, CUENTA_RETIROS_GASTO]], POSTEADO, ["date", ">=", desdeRetiros], ["date", "<=", hoy]],
        ["date", "name", "ref", "move_id", "balance", "amount_currency", "currency_id", "account_id"],
        { order: "date asc, id asc" },
      ),
    ),
  ]);
  return { grupos, movs30, terceros, propios, diarios, extractos, proveedores, clientes, deudas, iva, cobranza, gastos, cucha, retiros, meses };
}

/** El colchón y el escenario guardados en Supabase (direccion_config). Sin tabla: null. */
async function leerConfig(ctx: CtxCalculo): Promise<{ colchonArs: number | null; escenario: Escenario | null }> {
  try {
    const { data, error } = await ctx.supabase().from("direccion_config").select("clave, valor");
    if (error) {
      if (!esTablaFaltante(error)) console.warn("[direccion] caja config:", error.message);
      return { colchonArs: null, escenario: null };
    }
    let colchonArs: number | null = null;
    let escenario: Escenario | null = null;
    for (const c of data ?? []) {
      const v = c.valor as Record<string, unknown> | null;
      if (c.clave === "colchon_minimo" && typeof v?.ars === "number" && Number.isFinite(v.ars) && v.ars > 0) colchonArs = v.ars;
      if (c.clave === "escenario" && (v?.valor === "proyectado" || v?.valor === "comprometido")) escenario = v.valor;
    }
    return { colchonArs, escenario };
  } catch (e) {
    console.warn("[direccion] caja config:", e instanceof Error ? e.message : e);
    return { colchonArs: null, escenario: null };
  }
}

const mon = (ars: number): Valor => monto(ars);
type RefNodo = { tipo: string; [k: string]: string };
const fm = (ars: number, extra: { kpi?: string; nodo?: RefNodo } = {}) => ({ valor: mon(ars), ...extra });
const sumar = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((a, x) => a + f(x), 0);

// ─── El calculador ─────────────────────────────────────────────────────────────────────

export const calculador = definirCalculador<DetalleCaja>({
  pantalla: "caja",
  async calcular(ctx) {
    const hoy = ctx.hoy;
    const tc = ctx.tc?.valor ?? null;
    const [d, config] = await Promise.all([leerOdoo(hoy), leerConfig(ctx)]);
    const sems = semanasDesde(hoy, 8);
    const fin = sems[sems.length - 1].hasta;
    const faltantes: string[] = [];

    // ── Cuentas ──
    const grupos: GrupoCaja[] = d.grupos.map((g) => ({
      cuentaId: m2oId(g.account_id) ?? 0,
      etiqueta: m2oNombre(g.account_id),
      moneda: Array.isArray(g.currency_id) ? g.currency_id[1] : null,
      balance: Number(g.balance) || 0,
      amountCurrency: Number(g.amount_currency) || 0,
      ultima: g.date ? String(g.date) : null,
    }));
    const movs30: Record<number, number> = {};
    for (const m of d.movs30) {
      const id = m2oId(m.account_id);
      if (id) movs30[id] = Number(m.__count) || 0;
    }
    const cuentas = clasificarCuentas(grupos, movs30, tc, hoy);
    const cuentaDeDiario = new Map<number, number>();
    for (const j of d.diarios) {
      const a = m2oId(j.default_account_id);
      if (a) cuentaDeDiario.set(j.id, a);
    }
    // Extractos sin conciliar → nota en la cuenta del diario y aviso informativo.
    // Sólo los que pesan: 5 movimientos o más, o más de un millón (lo chico es ruido).
    const extractos = (d.extractos ?? [])
      .filter((x) => Number(x.__count) >= 5 || Math.abs(Number(x.amount) || 0) >= 1_000_000)
      .map((x) => ({ diarioId: m2oId(x.journal_id), diario: m2oNombre(x.journal_id), cant: Number(x.__count), ars: Number(x.amount) || 0 }));
    for (const x of extractos) {
      const c = cuentas.find((k) => x.diarioId != null && k.id === cuentaDeDiario.get(x.diarioId));
      if (c) c.nota = [c.nota, `${x.cant} movimientos del extracto sin conciliar.`].filter(Boolean).join(" ");
    }
    const totales = totalesCaja(cuentas);
    const contableCheques = cuentas.find((c) => c.codigo === "1.1.1.01.06")?.saldoArs ?? 0;

    // ── Cheques de terceros ──
    const listaTerceros: ChequeTercero[] = d.terceros
      .filter((c) => c.payment_date)
      .map((c) => ({
        id: c.id,
        numero: c.name,
        cliente: nombreLindo(m2oNombre(c.partner_id)) || "Sin cliente",
        ars: Number(c.amount) || 0,
        fecha: String(c.payment_date),
        estado: estadoCheque(String(c.payment_date), hoy),
        pagoId: m2oId(c.payment_id),
      }));
    const aFecha = listaTerceros.filter((c) => c.estado === "a_fecha");
    const recientes = listaTerceros.filter((c) => c.estado === "vencido_reciente");
    const aVerificar = listaTerceros.filter((c) => c.estado === "vencido_a_verificar");
    const registroArs = sumar(listaTerceros, (c) => c.ars);
    const aVerifArs = sumar(aVerificar, (c) => c.ars);
    const principalAVerificar = (() => {
      const n = new Map<string, number>();
      for (const c of aVerificar) n.set(c.cliente, (n.get(c.cliente) ?? 0) + 1);
      const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
      return top && top[1] / aVerificar.length >= 0.5 ? top[0] : null;
    })();
    const entranCheques = [...aFecha, ...recientes].map((c) => ({ c, indice: indiceSemana(c.fecha, sems, true) }));

    // ── Cheques propios ──
    const listaPropios: ChequePropio[] = d.propios
      .filter((c) => c.payment_date)
      .map((c) => ({
        id: c.id,
        numero: c.name,
        proveedor: nombreLindo(m2oNombre(c.partner_id)) || "Sin proveedor",
        ars: Number(c.amount) || 0,
        fecha: String(c.payment_date),
        enFlujo: String(c.payment_date) <= fin,
        pagoId: m2oId(c.payment_id),
      }));
    const diarioDebito = d.propios.map((c) => m2oId(c.original_journal_id)).find((x) => x != null) ?? null;
    const cuentaDebitoId = diarioDebito != null ? (cuentaDeDiario.get(diarioDebito) ?? null) : null;
    const cuentaDebito = cuentas.find((c) => c.id === cuentaDebitoId) ?? null;
    const propiosDespues = listaPropios.filter((c) => !c.enFlujo);

    // ── Proveedores ──
    const facturasProv = d.proveedores.map((f) => {
      const vence = vencimiento(f.invoice_date_due, f.invoice_date) ?? hoy;
      const dias = diasEntre(vence, hoy);
      return {
        id: f.id,
        nombre: f.name,
        partnerId: m2oId(f.partner_id),
        proveedor: nombreLindo(m2oNombre(f.partner_id)) || "Sin proveedor",
        ars: -(Number(f.amount_residual_signed) || 0),
        vence,
        dias,
        tramo: tramoPorDias(dias),
      };
    });
    const porProveedor = new Map<string, ProveedorDeuda>();
    for (const f of facturasProv) {
      const k = String(f.partnerId ?? f.proveedor);
      const p = porProveedor.get(k) ?? { partnerId: f.partnerId, proveedor: f.proveedor, saldoArs: 0, facturas: 0, vencidoArs: 0, venceMin: null };
      p.saldoArs += f.ars;
      p.facturas += 1;
      if (f.dias > 0) p.vencidoArs += f.ars;
      if (!p.venceMin || f.vence < p.venceMin) p.venceMin = f.vence;
      porProveedor.set(k, p);
    }
    const porPagarArs = sumar(facturasProv, (f) => f.ars);
    const provPorVencer = facturasProv.filter((f) => f.vence >= hoy && f.vence <= fin);
    const provVencidos90 = facturasProv.filter((f) => f.dias > 0 && f.dias <= 90);
    const provVencidosMas90 = facturasProv.filter((f) => f.dias > 90);

    // ── Conceptos del flujo: lo comprometido (ya en Odoo con fecha) ──
    const conceptos: Concepto[] = [];
    const ambos: Escenario[] = ["comprometido", "proyectado"];
    conceptos.push({
      id: "cheques_terceros",
      concepto: "Cheques de terceros en cartera (por fecha de pago)",
      tipo: "ingreso",
      origen: "comprometido",
      escenarios: ambos,
      fuente: "Registro de cheques; los vencidos hace 7 días o menos van a la semana 1",
      porSemana: porSemana(entranCheques.map((x) => ({ indice: x.indice, ars: x.c.ars }))),
      partidas: entranCheques
        .filter((x) => x.indice >= 0)
        .map((x) => ({ titulo: `Cheque ${x.c.numero} · ${x.c.cliente}`, fecha: x.c.fecha, ars: x.c.ars, ...(x.c.pagoId ? { odoo: { modelo: "account.payment", id: x.c.pagoId } } : {}) })),
    });
    if (d.clientes) {
      const porVencer = d.clientes
        .map((f) => ({ f, vence: vencimiento(f.invoice_date_due, f.invoice_date) }))
        .filter((x): x is { f: (typeof d.clientes)[number]; vence: string } => !!x.vence && x.vence >= hoy && x.vence <= fin);
      conceptos.push({
        id: "facturas_clientes",
        concepto: "Facturas de clientes por vencer",
        tipo: "ingreso",
        origen: "comprometido",
        escenarios: ["comprometido"],
        fuente: "Facturas de clientes por fecha de vencimiento (en Proyectado las reemplaza la cobranza promedio)",
        porSemana: porSemana(porVencer.map((x) => ({ indice: indiceSemana(x.vence, sems), ars: Number(x.f.amount_residual_signed) || 0 }))),
        partidas: porVencer.map((x) => ({ titulo: `${x.f.name} · ${nombreLindo(m2oNombre(x.f.partner_id))}`, fecha: x.vence, ars: Number(x.f.amount_residual_signed) || 0, odoo: { modelo: "account.move", id: x.f.id } })),
      });
    } else faltantes.push("las facturas de clientes por vencer");
    conceptos.push({
      id: "cheques_propios",
      concepto: "Cheques propios entregados",
      tipo: "egreso",
      origen: "comprometido",
      escenarios: ambos,
      fuente: "Cheques propios entregados, por fecha del cheque; los de fecha pasada van a la semana 1",
      porSemana: porSemana(listaPropios.map((c) => ({ indice: indiceSemana(c.fecha, sems, true), ars: c.ars }))),
      partidas: listaPropios
        .filter((c) => c.enFlujo)
        .map((c) => ({ titulo: `Cheque ${c.numero} · ${c.proveedor}`, fecha: c.fecha, ars: c.ars, ...(c.pagoId ? { odoo: { modelo: "account.payment", id: c.pagoId } } : {}) })),
    });
    conceptos.push({
      id: "proveedores_por_vencer",
      concepto: "Facturas de proveedor por vencer",
      tipo: "egreso",
      origen: "comprometido",
      escenarios: ambos,
      fuente: "Facturas de proveedor por fecha de vencimiento",
      porSemana: porSemana(provPorVencer.map((f) => ({ indice: indiceSemana(f.vence, sems), ars: f.ars }))),
      partidas: provPorVencer.map((f) => ({ titulo: `${f.nombre} · ${f.proveedor}`, fecha: f.vence, ars: f.ars, odoo: { modelo: "account.move", id: f.id } })),
    });
    if (d.iva) {
      // Cada posición asentada y sin pagar, el día 20 del tercer mes siguiente.
      const porPosicion = new Map<string, number>();
      for (const l of d.iva) porPosicion.set(l.date.slice(0, 7), (porPosicion.get(l.date.slice(0, 7)) ?? 0) - (Number(l.amount_residual) || 0));
      for (const [ym, ars] of [...porPosicion.entries()].sort()) {
        if (ars <= 1) continue;
        const pago = fechaPagoIva(ym);
        conceptos.push({
          id: `iva_${ym}`,
          concepto: `IVA de ${mesNombre(ym)} (asentado, sin pagar)`,
          tipo: "egreso",
          origen: "comprometido",
          escenarios: ambos,
          fuente: `Cuenta 2.1.3.03.020; se estima el ${fcorta(pago)} por el patrón de pagos`,
          porSemana: porSemana([{ indice: indiceSemana(pago, sems, true), ars }]),
          partidas: [{ titulo: `Posición de ${mesNombre(ym)}`, fecha: pago, ars }],
        });
      }
    } else faltantes.push("el IVA a pagar");
    const saldoCuenta = (codigo: string): number | null => {
      if (!d.deudas) return null;
      const g = d.deudas.find((x) => m2oNombre(x.account_id).startsWith(codigo + " "));
      return g ? -(Number(g.balance) || 0) : 0;
    };
    const sicore = saldoCuenta("2.1.3.04.020");
    if (sicore == null) faltantes.push("las retenciones de Ganancias");
    else if (sicore > 1) {
      const pago = fechasDelDia(10, hoy, fin)[0];
      if (pago)
        conceptos.push({
          id: "sicore",
          concepto: "Retenciones de Ganancias a depositar (SICORE)",
          tipo: "egreso",
          origen: "comprometido",
          escenarios: ambos,
          fuente: "Cuenta 2.1.3.04.020; el día 10 del mes",
          porSemana: porSemana([{ indice: indiceSemana(pago, sems), ars: sicore }]),
          partidas: [{ titulo: "SICORE", fecha: pago, ars: sicore }],
        });
    }

    // ── Estimados (sólo Proyectado) ──
    const cobranzaSemanal = d.cobranza
      ? -sumar(
          d.cobranza.filter((x) => {
            const id = m2oId(x.journal_id);
            const cta = id != null ? cuentaDeDiario.get(id) : undefined;
            return cuentas.find((c) => c.id === cta)?.codigo !== "1.1.1.01.06"; // sin el diario de cheques
          }),
          (x) => Number(x.balance) || 0,
        ) / 12
      : null;
    if (cobranzaSemanal != null) {
      conceptos.push({
        id: "cobranza",
        concepto: "Cobranza esperada por transferencia y efectivo (promedio de las últimas 12 semanas)",
        tipo: "ingreso",
        origen: "estimado",
        escenarios: ["proyectado"],
        fuente: `Cobros en Deudores por ventas desde bancos y cajas, ${fcorta(sumarDias(hoy, -84))}–${fcorta(sumarDias(hoy, -1))} ÷ 12`,
        porSemana: sems.map(() => cobranzaSemanal),
      });
    } else faltantes.push("la cobranza promedio");
    const vencido90Ars = sumar(provVencidos90, (f) => f.ars);
    if (vencido90Ars > 0)
      conceptos.push({
        id: "proveedores_vencidos",
        concepto: "Facturas de proveedor vencidas hasta 90 días (se reparten en 4 semanas)",
        tipo: "egreso",
        origen: "estimado",
        escenarios: ["proyectado"],
        fuente: "Facturas de proveedor vencidas",
        porSemana: repartir(vencido90Ars, 4),
      });

    const cuchaArs = d.cucha ? sumar(d.cucha, (l) => Number(l.balance) || 0) : 0;
    const supuestos: Supuestos | null = d.gastos
      ? supuestosDeGastos(d.gastos.map((g) => ({ codigo: m2oNombre(g.account_id).split(" ")[0], balance: Number(g.balance) || 0 })), d.meses.length, cuchaArs)
      : null;
    const mesesTxt = `${mesNombre(d.meses[0])}–${mesNombre(d.meses[d.meses.length - 1])}`;
    const mensualEnDia = (id: string, concepto: string, dia: number, ars: number, fuente: string) => {
      const fechas = fechasDelDia(dia, hoy, fin);
      if (!fechas.length || !(ars > 0)) return;
      conceptos.push({
        id,
        concepto,
        tipo: "egreso",
        origen: "estimado",
        escenarios: ["proyectado"],
        fuente,
        porSemana: porSemana(fechas.map((f) => ({ indice: indiceSemana(f, sems), ars }))),
        partidas: fechas.map((f) => ({ titulo: `${concepto} de ${mesNombre(sumarMeses(f.slice(0, 7), -1))}`, fecha: f, ars })),
      });
    };
    if (supuestos) {
      mensualEnDia("sueldos", "Sueldos registrados", 4, supuestos.sueldosMes, `Promedio ${mesesTxt} de 4.2.1.03.01 + 4.2.1.04.01; el día 4`);
      mensualEnDia("cargas", "Cargas sociales F.931", 10, supuestos.cargasMes, `Promedio ${mesesTxt} de 4.2.1.03.02 + 4.2.1.04.02; el día 10`);
      mensualEnDia("fondo_cese", "Fondo de cese + IERIC", 15, supuestos.fondoCeseMes, `Promedio ${mesesTxt} de 4.2.1.04.09 y .10; el día 15`);
      mensualEnDia("iibb", "Ingresos Brutos", 17, supuestos.iibbMes, `Promedio ${mesesTxt} de 4.2.1.07.03; alrededor del 17`);
      if (supuestos.noRegistradosMes > 0)
        conceptos.push({
          id: "no_registrados",
          concepto: "Sueldos no registrados y contratistas (semanal)",
          tipo: "egreso",
          origen: "estimado",
          escenarios: ["proyectado"],
          fuente: `Promedio ${mesesTxt} de 4.2.1.04.13, .15 y .18 × 12 ÷ 52`,
          porSemana: sems.map(() => semanal(supuestos.noRegistradosMes)),
        });
      if (supuestos.gastosCorrientesMes > 0)
        conceptos.push({
          id: "gastos",
          concepto: "Gastos corrientes de obra y estructura todavía no facturados",
          tipo: "egreso",
          origen: "estimado",
          escenarios: ["proyectado"],
          fuente: `Promedio ${mesesTxt} de 4.2.1.01 y 4.2.1.03 (sin sueldos, alquiler compensado, subalquiler ni circuitos especiales) + 4.2.1.04.03/.06/.07, × 12 ÷ 52, desde la semana 3`,
          porSemana: sems.map((_, i) => (i >= 2 ? semanal(supuestos.gastosCorrientesMes) : 0)),
        });
      if (supuestos.subalquilerMes > 0)
        conceptos.push({
          id: "subalquiler",
          concepto: "Subalquiler de estructuras",
          tipo: "egreso",
          origen: "estimado",
          escenarios: ["proyectado"],
          fuente: `Promedio ${mesesTxt} de 4.2.1.03.12 × 12 ÷ 52, desde la semana 3`,
          porSemana: sems.map((_, i) => (i >= 2 ? semanal(supuestos.subalquilerMes) : 0)),
        });
    } else faltantes.push("los sueldos y gastos promedio");

    // Retiros (RESERVADO): neto de 12 meses sin dividendos ÷ 52, al dólar de hoy.
    let retirosSemanales: number | null = null;
    if (d.retiros && tc) {
      const lineas: LineaRetiro[] = d.retiros.map((l) => ({
        fecha: l.date,
        codigoCuenta: m2oNombre(l.account_id).split(" ")[0],
        texto: `${m2oNombre(l.move_id)} ${l.ref || ""} ${l.name || ""}`,
        nombre: l.name || "",
        balance: Number(l.balance) || 0,
        amountCurrency: Number(l.amount_currency) || 0,
        moneda: Array.isArray(l.currency_id) ? l.currency_id[1] : null,
      }));
      const usd = retiroNetoUsd(lineas, (f) => tcEn(ctx.dolar, f)?.valor ?? null);
      if (usd != null) retirosSemanales = (usd / 52) * tc;
    }
    if (retirosSemanales == null) faltantes.push("los retiros de socios");
    else if (retirosSemanales > 0) {
      const r = retirosSemanales;
      conceptos.push({
        id: "retiros",
        concepto: "Retiros de socios (promedio de 12 meses, sin dividendos)",
        tipo: "egreso",
        origen: "estimado",
        escenarios: ["proyectado"],
        fuente: "Retiro neto de 12 meses (cuentas particulares + 4.2.1.04.19) ÷ 52, al dólar de hoy",
        porSemana: sems.map(() => r),
        reservado: true,
      });
    }

    // ── Escenarios, colchón y cobertura ──
    const sugerido = supuestos ? colchonSugerido(supuestos) : 0;
    const colchonArs = config.colchonArs ?? sugerido;
    // Dos flujos: el público (sin conceptos reservados) y, si los hay, el de los socios.
    const armarFlujo = (cs: Concepto[]) => {
      const escenarios: Record<Escenario, FilaFlujo[]> = {
        proyectado: filasFlujo(sems, cs, "proyectado", totales.disponibleArs, totales.pesosArs),
        comprometido: filasFlujo(sems, cs, "comprometido", totales.disponibleArs, totales.pesosArs),
      };
      const cob: Record<Escenario, Cobertura> = { proyectado: cobertura(escenarios.proyectado, colchonArs), comprometido: cobertura(escenarios.comprometido, colchonArs) };
      return { escenarios, cobertura: cob };
    };
    const flujoPublico = armarFlujo(conceptos.filter((c) => !c.reservado));
    const flujoSocios = conceptos.some((c) => c.reservado) ? armarFlujo(conceptos) : null;
    const escenarioDefecto: Escenario = config.escenario ?? "proyectado";

    // ── Queda fuera del flujo, a decidir ──
    const fuera: FueraFlujo[] = [];
    const fueraReservado: FueraFlujo[] = [];
    if (propiosDespues.length) {
      const provs = [...new Set(propiosDespues.map((c) => c.proveedor))].join(", ");
      const fechas = [...new Set(propiosDespues.map((c) => fcorta(c.fecha)))];
      const fechasTxt = fechas.length > 1 ? `${fechas.slice(0, -1).join(", ")} y ${fechas[fechas.length - 1]}` : fechas[0];
      fuera.push({
        id: "propios_despues",
        concepto: `Cheques propios con fecha después del ${fcorta(fin)}`,
        ars: sumar(propiosDespues, (c) => c.ars),
        nota: [`${propiosDespues.length} ${propiosDespues.length === 1 ? "cheque" : "cheques"} a ${provs} del ${fechasTxt}. Ya están entregados: salen del ${cuentaDebito ? nombreCorto(cuentaDebito.nombre) : "banco"} aunque caigan fuera de las 8 semanas.`],
      });
    }
    const dividendos = saldoCuenta("2.1.5.01.00");
    if (dividendos != null && dividendos > 1)
      fueraReservado.push({ id: "dividendos", concepto: "Dividendos pendientes de pago", ars: dividendos, nota: ["Sin fecha. Si se pagan, restarlos de la semana que decidan los socios."] });
    const mas90 = sumar(provVencidosMas90, (f) => f.ars);
    if (mas90 > 1)
      fuera.push({ id: "proveedores_mas_90", concepto: "Facturas de proveedor vencidas hace más de 90 días", ars: mas90, nota: [`${provVencidosMas90.length} facturas. Revisar si se deben de verdad (pueden ser facturas pagadas sin conciliar).`] });
    if (aVerifArs > 1)
      fuera.push({
        id: "cheques_a_verificar",
        concepto: "Cheques de terceros vencidos \"a verificar\"",
        ars: aVerifArs,
        nota: [`${aVerificar.length} cheques vencidos hace más de 7 días: pueden estar rechazados o ya depositados. No se cuentan como ingreso.`],
      });
    if (d.clientes) {
      // Estado: sólo lo vencido (bloque 2b). Vencimiento como en Cobranzas: sin plazo de pago, emisión + 30 días.
      const pub = d.clientes
        .filter((f) => esPublico(m2oNombre(f.partner_id)))
        .map((f) => {
          const conPlazo = Array.isArray(f.invoice_payment_term_id);
          const vence = !conPlazo && f.invoice_date ? sumarDias(String(f.invoice_date), 30) : vencimiento(f.invoice_date_due, f.invoice_date);
          return { ars: Number(f.amount_residual_signed) || 0, dias: vence ? diasEntre(vence, hoy) : 0 };
        });
      const totPub = sumar(pub, (x) => x.ars);
      const vencPub = sumar(pub.filter((x) => x.dias > 0), (x) => x.ars);
      const v30Pub = sumar(pub.filter((x) => x.dias > 30), (x) => x.ars);
      if (vencPub > 1)
        fuera.push({
          id: "estado",
          concepto: "Deuda vencida del Estado",
          ars: vencPub,
          nota: [fm(v30Pub), " a más de 30 días. El saldo total del Estado es ", fm(totPub), ": ", fm(totPub - vencPub), " todavía no vencen. No se cuenta como ingreso salvo confirmación."],
        });
    }

    // ── Avisos de calidad ──
    const avisos: Aviso[] = [];
    for (const c of cuentas.filter((k) => k.estado === "a_verificar")) {
      avisos.push({
        id: `cuenta_quieta_${c.id}`,
        nivel: "ver",
        origen: "auto",
        desde: c.ultimoMovimiento,
        afecta: ["caja_disponible"],
        quien: "Administración / contador",
        aviso: [`${c.nombre} sin movimientos: `, fm(c.saldoArs, { nodo: { tipo: "cuenta", v: String(c.id) } })],
        que: "Pedir el saldo real y regularizar. Mientras tanto no se suma a la caja.",
        detalle: [c.nota],
      });
    }
    const difCheques = registroArs - contableCheques;
    const chequesNoCierran = Math.abs(difCheques) > 1_000_000;
    if (chequesNoCierran) {
      avisos.push({
        id: "cheques",
        nivel: "ver",
        origen: "auto",
        desde: null,
        afecta: ["cheques_cartera", "cobertura"],
        quien: "Administración",
        aviso: ["Cheques: registro ", fm(registroArs, { kpi: "cheques_cartera" }), " vs contabilidad ", fm(contableCheques)],
        que: "Contar los cheques y revisar eCheq en el banco; registrar depósitos y rechazos con el circuito de cheques.",
        detalle: [`${aVerificar.length} cheques por `, fm(aVerifArs), " tienen fecha vencida hace más de una semana y siguen \"en cartera\"."],
      });
    }
    const usdSinArqueo = cuentas.filter((c) => c.sinArqueo && c.enTotal);
    if (usdSinArqueo.length) {
      const c = usdSinArqueo[0];
      avisos.push({
        id: "caja_usd_arqueo",
        nivel: "ver",
        origen: "auto",
        desde: null,
        afecta: ["caja_disponible"],
        quien: "Socios",
        aviso: ["Caja en dólares (", fm(sumar(usdSinArqueo, (k) => k.saldoArs), { nodo: { tipo: "cuenta", v: String(c.id) } }), ") sin arqueo ni revaluación"],
        que: "Arqueo mensual firmado y revaluación a fin de mes.",
        detalle: [c.nota],
      });
    }
    for (const x of extractos) {
      if (x.diarioId == null) continue;
      avisos.push({
        id: `extractos_${x.diarioId}`,
        nivel: "inf",
        origen: "auto",
        desde: null,
        afecta: ["caja_disponible"],
        quien: "Administración",
        aviso: [`${x.diario}: ${x.cant} ${x.cant === 1 ? "movimiento" : "movimientos"} sin conciliar (`, fm(x.ars), ")"],
        que: "Conciliar semanalmente.",
      });
    }
    const posicionesIva = conceptos.filter((c) => c.id.startsWith("iva_"));
    if (posicionesIva.length > 1) {
      avisos.push({
        id: "iva_atrasado",
        nivel: "inf",
        origen: "auto",
        desde: null,
        afecta: ["cobertura"],
        quien: "Contador",
        aviso: [`IVA: ${posicionesIva.length} posiciones asentadas sin pagar (`, fm(sumar(posicionesIva, (c) => sumar(c.partidas ?? [], (p) => p.ars))), ")"],
        que: "Confirmar con el contador si es un plan de pagos.",
        detalle: ["Se paga unos 2,5 meses después del período: cada posición va el día 20 del tercer mes."],
      });
    }
    if (faltantes.length) {
      avisos.push({
        id: "flujo_incompleto",
        nivel: "inc",
        origen: "auto",
        desde: null,
        afecta: ["cobertura"],
        quien: "Sistemas",
        aviso: [`El flujo no incluye ${faltantes.join(", ")}: Odoo no respondió esa consulta.`],
        que: "Tocar \"Actualizar ahora\" en unos minutos.",
      });
    }

    const det: DetalleCaja = {
      hoy,
      cuentas,
      totales,
      cuentaDebitoId,
      cheques: {
        registro: { cant: listaTerceros.length, ars: registroArs },
        contableArs: contableCheques,
        aFecha: { cant: aFecha.length, ars: sumar(aFecha, (c) => c.ars) },
        recientes: { cant: recientes.length, ars: sumar(recientes, (c) => c.ars) },
        aVerificar: { cant: aVerificar.length, ars: aVerifArs, principal: principalAVerificar },
        despuesArs: sumar(aFecha.filter((c) => c.fecha > fin), (c) => c.ars),
        lista: listaTerceros,
      },
      propios: {
        cant: listaPropios.length,
        ars: sumar(listaPropios, (c) => c.ars),
        enFlujoArs: sumar(listaPropios.filter((c) => c.enFlujo), (c) => c.ars),
        despuesArs: sumar(propiosDespues, (c) => c.ars),
        lista: listaPropios,
      },
      porPagar: {
        ars: porPagarArs,
        facturas: facturasProv.length,
        vencidoArs: sumar(facturasProv.filter((f) => f.dias > 0), (f) => f.ars),
        aging: TRAMOS.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, ars: sumar(facturasProv.filter((f) => f.tramo === t.clave), (f) => f.ars) })),
        top: [...porProveedor.values()].sort((a, b) => b.saldoArs - a.saldoArs),
        venceEnHorizonteArs: sumar(provPorVencer, (f) => f.ars),
      },
      flujo: {
        semanas: sems,
        saldoInicialArs: totales.disponibleArs,
        saldoInicialPesosArs: totales.pesosArs,
        conceptos: conceptos.filter((c) => !c.reservado),
        escenarios: flujoPublico.escenarios,
        cobertura: flujoPublico.cobertura,
        escenarioDefecto,
        colchon: { ars: colchonArs, sugeridoArs: sugerido, editado: config.colchonArs != null },
        supuestos: { ...(supuestos ?? { sueldosMes: 0, cargasMes: 0, noRegistradosMes: 0, fondoCeseMes: 0, iibbMes: 0, gastosCorrientesMes: 0, subalquilerMes: 0 }), cobranzaSemanalArs: cobranzaSemanal },
        fuera,
        faltantes,
      },
      reservado: {
        conceptos: conceptos.filter((c) => c.reservado),
        fuera: fueraReservado,
        retirosSemanalesArs: retirosSemanales,
        ...(flujoSocios ? { flujo: flujoSocios } : {}),
      },
    };

    // ── Cifras ──
    const aVerifCuentas = cuentas.filter((c) => c.estado === "a_verificar");
    const cifraCaja: Cifra = {
      kpi: "caja_disponible",
      valor: mon(totales.disponibleArs),
      regla: "caja",
      confianza: usdSinArqueo.length ? { nivel: "ver", motivo: "Caja en dólares sin arqueo" } : { nivel: "ok" },
      comparaciones: [await compararConLunes(ctx, totales.disponibleArs)],
      ...(aVerifCuentas.length ? { contexto: contextoAVerificar(aVerifCuentas) } : {}),
    };
    const cifraCheques: Cifra = {
      kpi: "cheques_cartera",
      valor: chequesNoCierran ? sinDato("El registro y la contabilidad no coinciden") : mon(registroArs),
      regla: "saldo",
      confianza: chequesNoCierran ? { nivel: "ver", motivo: "El registro y la contabilidad no coinciden" } : { nivel: "ok" },
      contexto: ["registro ", fm(registroArs), " vs contabilidad ", fm(contableCheques)],
    };
    const pctVencido = porPagarArs > 0 ? (det.porPagar.vencidoArs / porPagarArs) * 100 : null;
    const cifraPagar: Cifra = {
      kpi: "por_pagar",
      valor: mon(porPagarArs),
      regla: "saldo",
      confianza: { nivel: "ok" },
      contexto: [
        { valor: { tipo: "cantidad", n: facturasProv.length, unidad: facturasProv.length === 1 ? "factura" : "facturas" } },
        ...(pctVencido != null ? [" · ", { valor: { tipo: "pct", n: pctVencido } as Valor }, " figura vencido (casi ninguna tiene plazo cargado)"] : []),
      ],
    };
    const cifraPropios: Cifra = {
      kpi: "cheques_propios",
      valor: mon(det.propios.ars),
      regla: "saldo",
      confianza: { nivel: "ok" },
      contexto: [
        { valor: { tipo: "cantidad", n: det.propios.cant, unidad: det.propios.cant === 1 ? "cheque" : "cheques" } },
        " · no están en \"por pagar\"",
        ...(cuentaDebito ? [` · ${nombreCorto(cuentaDebito.nombre)} en pesos: `, fm(cuentaDebito.saldoArs, { nodo: { tipo: "cuenta", v: String(cuentaDebito.id) } })] : []),
        " · en el flujo ",
        fm(det.propios.enFlujoArs),
        ...(det.propios.despuesArs > 0 ? [`, después del ${fcorta(fin)} `, fm(det.propios.despuesArs)] : []),
      ],
    };

    // Cobertura, decisiones y narrativa dependen del flujo: una versión para los socios (con
    // retiros) y otra para el resto; filtrarReservado deja a cada uno la suya.
    const socios = conRetiros(det);
    const publico: DetalleCaja = { ...det, reservado: undefined };
    const cifrasCob = variantes([cifraCobertura(socios, escenarioDefecto)], [cifraCobertura(publico, escenarioDefecto)]);
    const dyoSocios = decisionesYOraciones(socios);
    const dyoPublico = decisionesYOraciones(publico);
    return {
      cifras: [cifraCaja, cifraCheques, cifraPagar, cifraPropios, ...cifrasCob],
      detalle: det,
      avisos,
      decisiones: variantes(dyoSocios.decisiones, dyoPublico.decisiones),
      oraciones: variantes(dyoSocios.oraciones, dyoPublico.oraciones),
    };
  },
});

/** "vs lun 12/10": la caja disponible del snapshot del lunes anterior (Supabase). */
async function compararConLunes(ctx: CtxCalculo, ars: number): Promise<Comparacion> {
  const lunes = lunesAnterior(ctx.hoy);
  const base = `vs ${fdia(lunes)}`;
  try {
    const h = await historiaCifra(ctx.supabase(), "caja_disponible", { desde: `${lunes}T00:00:00-03:00`, hasta: `${lunes}T23:59:59-03:00`, limite: 1 });
    const v = h[0]?.cifra.valor;
    if (v?.tipo === "monto" && v.monto.ars > 0) return { delta: (ars / v.monto.ars - 1) * 100, base, polaridad: polaridadDe("caja_disponible") };
  } catch {
    // Sin Supabase (script de verificación): no hay historia.
  }
  return { delta: null, base, polaridad: polaridadDe("caja_disponible"), motivo: "Todavía no hay historia guardada" };
}

function contextoAVerificar(cs: CuentaCaja[]): Frase {
  const partes: Frase = [];
  cs.forEach((c, i) => {
    if (i) partes.push(" · ");
    partes.push(fm(c.saldoArs, { nodo: { tipo: "cuenta", v: String(c.id) } }), ` de ${nombreCorto(c.nombre)} fuera del total: sin movimientos desde ${flarga(c.ultimoMovimiento)}`);
  });
  return partes;
}

// ─── Decisiones y narrativa (también para La semana) ───────────────────────────────────

/** Para decidir y oraciones de la narrativa de caja. Pura sobre el detalle. */
export function decisionesYOraciones(d: DetalleCaja): { decisiones: Decision[]; oraciones: Oracion[] } {
  const decisiones: Decision[] = [];
  const oraciones: Oracion[] = [];
  const esc = d.flujo.escenarioDefecto;
  const cob = d.flujo.cobertura[esc];
  const nodoCob = { tipo: tipoNodoCobertura(d), e: esc };
  const fin = d.flujo.semanas[d.flujo.semanas.length - 1];
  const s1Hasta = d.flujo.semanas[0]?.hasta ?? d.hoy;
  const debito = d.cuentas.find((c) => c.id === d.cuentaDebitoId) ?? null;
  const aVerif = d.cuentas.filter((c) => c.estado === "a_verificar");

  // Fondear la cuenta de los cheques: lo comprometido de la semana 1 contra su saldo.
  const s1 = d.flujo.escenarios.comprometido[0];
  if (debito && s1 && s1.sale > debito.saldoArs) {
    const corto = nombreCorto(debito.nombre);
    const egresosS1 = d.flujo.conceptos.filter((c) => c.tipo === "egreso" && c.escenarios.includes("comprometido") && (c.porSemana[0] ?? 0) > 0);
    const chequesS1 = d.propios.lista.filter((c) => c.fecha <= s1Hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const primero = chequesS1[0] ?? null;
    const proximoGrande = d.propios.lista.filter((c) => c.fecha > s1Hasta).sort((a, b) => b.ars - a.ars || a.fecha.localeCompare(b.fecha))[0] ?? null;
    const detalleS1: Frase = [];
    egresosS1.forEach((c, i) => {
      if (i) detalleS1.push(i === egresosS1.length - 1 ? " y " : ", ");
      if (c.id === "cheques_propios" && chequesS1.length === 1) detalleS1.push(`cheque a ${chequesS1[0].proveedor.split(" (")[0]} por `, fm(chequesS1[0].ars), ` el ${fdia(chequesS1[0].fecha)}`);
      else detalleS1.push(`${c.concepto.split(" (")[0].replace(/^IVA de/, "el IVA de").toLowerCase().replace(/^el iva/, "el IVA")} por `, fm(c.porSemana[0]));
    });
    decisiones.push({
      id: "cheques_propios",
      sev: "rojo",
      pantalla: "caja",
      duenoSugerido: "Gabriel",
      vence: primero?.fecha ?? null,
      corto: [`Fondear el ${corto}: salen `, fm(s1.sale), ", hay ", fm(debito.saldoArs)],
      que: [
        "Esta semana salen ",
        fm(s1.sale, { kpi: "cheques_propios" }),
        " ya comprometidos",
        ...(detalleS1.length ? [" (", ...detalleS1, ")"] : []),
        ` y el ${corto} en pesos tiene `,
        fm(debito.saldoArs, { nodo: { tipo: "cuenta", v: String(debito.id) } }),
        ".",
        ...(proximoGrande ? [` El ${fcorta(proximoGrande.fecha)} se debita un cheque a ${proximoGrande.proveedor.split(" (")[0]} por `, fm(proximoGrande.ars), "."] : []),
      ],
      pregunta: "¿Rescatar FIMA o vender dólares, y cuánto?",
      ver: { tipo: "cheques_propios" },
    });
    oraciones.push({ id: "fondeo", prioridad: 92, frase: ["Esta semana salen ", fm(s1.sale, { kpi: "cheques_propios" }), ` ya comprometidos y el ${corto} tiene `, fm(debito.saldoArs), ": hay que fondearlo esta semana."] });
  }

  // Cuentas quietas a verificar (Borelli).
  const todaLaPlata = d.totales.disponibleArs + d.totales.aVerificarArs;
  for (const c of aVerif) {
    decisiones.push({
      id: `cuenta_quieta_${c.id}`,
      sev: "rojo",
      pantalla: "caja",
      duenoSugerido: "Gabriel",
      vence: null,
      corto: [`${nombreCorto(c.nombre)}: `, fm(c.saldoArs), ` sin movimientos desde ${fcorta(c.ultimoMovimiento)}`],
      que: [
        `${nombreCorto(c.nombre)}: `,
        fm(c.saldoArs, { nodo: { tipo: "cuenta", v: String(c.id) } }),
        ` sin movimientos desde ${flarga(c.ultimoMovimiento)}, el `,
        { valor: todaLaPlata > 0 ? { tipo: "pct", n: (c.saldoArs / todaLaPlata) * 100 } : sinDato("Sin caja") },
        " de toda la plata",
      ],
      pregunta: "¿Quién pide el saldo real y para cuándo?",
      ver: { tipo: "cuenta", v: String(c.id) },
    });
  }

  // La plata en pesos cae debajo del colchón.
  if (d.flujo.colchon.ars > 0 && !cob.mas && cob.cae != null) {
    const s = d.flujo.semanas[cob.cae];
    decisiones.push({
      id: "cobertura",
      sev: "ambar",
      pantalla: "caja",
      duenoSugerido: "Gabriel",
      vence: s.desde,
      corto: [`Semana del ${fcorta(s.desde)}: la plata en pesos queda `, fm(cob.faltaArs ?? 0), " debajo del colchón"],
      que: [`En la semana del ${fcorta(s.desde)} la plata en pesos queda en `, fm(cob.pesosCae ?? 0), ", ", fm(cob.faltaArs ?? 0, { kpi: "cobertura", nodo: nodoCob }), ` debajo del colchón mínimo (escenario ${ESCENARIOS[esc].toLowerCase()}).`],
      pregunta: "¿Adelantar cobranza o mover un pago?",
      ver: { tipo: tipoNodoCobertura(d), e: esc },
    });
    oraciones.push({ id: "min", prioridad: 85, frase: [`En la semana del ${fcorta(s.desde)} la plata en pesos queda `, fm(cob.faltaArs ?? 0, { kpi: "cobertura", nodo: nodoCob }), " debajo del colchón."] });
  }

  // Oración fija de caja (siempre va, aunque sea neutra).
  const caja: Frase = ["Hay ", fm(d.totales.disponibleArs, { kpi: "caja_disponible" }), " disponibles y "];
  if (!(d.flujo.colchon.ars > 0)) caja.push("no pudimos calcular hasta cuándo alcanza.");
  else if (cob.mas) caja.push("llegamos bien ", { valor: { tipo: "fecha", iso: fin.hasta, prefijo: "hasta el" }, kpi: "cobertura", nodo: nodoCob }, ".");
  else caja.push("la plata alcanza ", { valor: { tipo: "fecha", iso: cob.fecha, prefijo: "hasta el" }, kpi: "cobertura", nodo: nodoCob }, ".");
  for (const c of aVerif) caja.push(" Aparte, ", fm(c.saldoArs, { nodo: { tipo: "cuenta", v: String(c.id) } }), ` de ${nombreCorto(c.nombre)} a confirmar.`);
  oraciones.unshift({ id: "caja", prioridad: 100, frase: caja });

  return { decisiones, oraciones };
}

// ─── Resumen para La semana ────────────────────────────────────────────────────────────

export type ResumenCaja = {
  /** Tarjeta "¿Cuánta plata hay?": caja disponible, con las cuentas a verificar en el contexto. */
  caja: Cifra | null;
  /** Tarjeta "¿Llegamos?": cobertura como fecha en el escenario por defecto; el otro en el contexto. */
  cobertura: Cifra | null;
  escenario: Escenario;
  /** Colchón mínimo en pesos; `editado` = lo fijó un socio (si no, "1 mes de sueldos"). */
  colchon: { ars: number; editado: boolean };
  /** Mini-gráfico de la tarjeta: plata en pesos al cierre de cada semana (escenario por defecto). */
  sparkPesos: { n: number; desde: string; pesos: number }[];
  /** Narrativa: "caja" (fija, prioridad 100) y candidatas "fondeo" (92) y "min" (85). */
  oraciones: Oracion[];
  /** Para decidir: "cheques_propios" (fondear), "cuenta_quieta_<id>" (Borelli), "cobertura". */
  decisiones: Decision[];
  /** Calidad de los datos de caja (cuentas quietas, cheques, arqueo USD, extractos, IVA). */
  avisos: Aviso[];
  tc: TcDia | null;
};

/**
 * Lo que La semana toma de Caja, sin volver a leer Odoo:
 *   const c = resumenCaja(await ctx.pantalla<DetalleCaja>("caja"));
 * Pasarle el resultado YA RECORTADO para un tipo de usuario (filtrarReservado(r, conSocios)):
 * con socios, la cobertura y el mini-gráfico incluyen los retiros; sin socios, no (y nada de
 * lo que devuelve los deja deducir). Si Caja vino vacía (snapshot viejo), las tarjetas son null.
 */
export function resumenCaja(r: ResultadoCalculador<DetalleCaja>): ResumenCaja {
  const d = r.detalle;
  const esc: Escenario = d?.flujo?.escenarioDefecto ?? "proyectado";
  return {
    caja: r.cifras.find((c) => c.kpi === "caja_disponible") ?? null,
    cobertura: r.cifras.find((c) => c.kpi === "cobertura") ?? null,
    escenario: esc,
    colchon: { ars: d?.flujo?.colchon.ars ?? 0, editado: d?.flujo?.colchon.editado ?? false },
    sparkPesos: (d?.flujo ? conRetiros(d).flujo.escenarios[esc] : []).map((s) => ({ n: s.n, desde: s.desde, pesos: s.pesos })),
    oraciones: (r.oraciones ?? []).filter((o) => !o.reservado),
    decisiones: (r.decisiones ?? []).filter((x) => !x.reservado),
    avisos: r.avisos.filter((a) => !a.reservado),
    tc: r.tc,
  };
}
