// Reglas PURAS de Caja (sin Odoo, sin Next): qué cuenta es caja, cuentas quietas, cheques,
// aging de proveedores, semanas y escenarios del flujo, cobertura, promedios de gastos y
// retiros. Las usa calculo/caja.ts (que lee Odoo) y las prueba caja-reglas.test.ts.
//
// Fuente: Odoo-Claude/direccion/datos/finanzas_definiciones.md (§1, §2, §4, §5) y la
// maqueta aprobada (bloque "2b": cheques propios después del horizonte, Estado sólo vencido).

import { diasEntre, monto, sinDato, sumarDias } from "../formato.ts";
import type { Cifra } from "../tipos.ts";
import type { DetalleCaja } from "./caja.ts";

// ─── Cuentas de caja (§1.1 y §1.2) ─────────────────────────────────────────────────────

/** Una fila del read_group de account.move.line (asset_cash) agrupado por cuenta y moneda. */
export type GrupoCaja = {
  cuentaId: number;
  /** "1.1.1.02.01 Banco Galicia cta cte en pesos" (el display_name de Odoo). */
  etiqueta: string;
  /** Nombre de la moneda de las líneas ("ARS", "USD"). */
  moneda: string | null;
  balance: number;
  amountCurrency: number;
  /** date:max del grupo. */
  ultima: string | null;
};

export type EstadoCuenta = "confiable" | "quieta" | "a_verificar" | "no_es_caja";

export type CuentaCaja = {
  id: number;
  codigo: string;
  nombre: string;
  moneda: "ARS" | "USD";
  /** Saldo en pesos: las líneas en dólares van al dólar de hoy (sin revaluar en libros). */
  saldoArs: number;
  /** Saldo en dólares (sólo cuentas en dólares). */
  saldoUsd: number | null;
  /** Saldo contable (balance), como está en los libros. */
  saldoContableArs: number;
  ultimoMovimiento: string | null;
  diasSinMovimiento: number | null;
  movimientos30d: number;
  estado: EstadoCuenta;
  /** ¿Suma a la caja disponible? */
  enTotal: boolean;
  /** Efectivo en dólares: no hay arqueo registrado en Odoo. */
  sinArqueo: boolean;
  nota: string;
};

/** Cuentas que Odoo tipifica como caja y no lo son (finanzas_definiciones.md §1.1). */
export const NO_ES_CAJA: Readonly<Record<string, string>> = {
  "1.1.1.01.06": "Es la contabilidad de los cheques de terceros: va a Cheques en cartera, no a la caja.",
  "1.1.1.02.05": "Tarjeta de crédito corporativa tipificada como caja (debería ser pasivo).",
  "1.1.1.02.007": "No es caja: cuenta puente de facturas ARCA a regularizar, mal tipificada como caja.",
};

/** Cuenta quieta: sin movimientos hace más de estos días. */
export const DIAS_QUIETA = 30;
/** Una cuenta quieta que pesa más que esto del total queda a verificar y fuera. */
export const PESO_A_VERIFICAR = 0.05;

/** "1.1.1.02.01 Banco Galicia…" → { codigo, nombre }. */
export function partirEtiqueta(etiqueta: string): { codigo: string; nombre: string } {
  const m = /^(\S+)\s+(.*)$/.exec(etiqueta.trim());
  return m ? { codigo: m[1], nombre: m[2].trim() } : { codigo: etiqueta.trim(), nombre: etiqueta.trim() };
}

/**
 * Arma las cuentas de caja y las clasifica.
 *  · Líneas en pesos: balance. Líneas en dólares: amount_currency × dólar de hoy (el
 *    balance está sin revaluar). Sin dólar de hoy, las de dólares quedan al valor contable.
 *  · No es caja (NO_ES_CAJA) → fuera, con su motivo.
 *  · Quieta (> 30 días sin movimientos): si además pesa > 5 % del total, a verificar y
 *    fuera (así se detecta Borelli sola); si no, se suma con la marca "quieta".
 *  · Cuentas en cero sin movimientos se descartan.
 */
export function clasificarCuentas(
  grupos: GrupoCaja[],
  movimientos30d: Record<number, number>,
  tcHoy: number | null,
  hoy: string,
): CuentaCaja[] {
  const porId = new Map<number, { etiqueta: string; ars: number; usd: number; contable: number; ultima: string | null; hayUsd: boolean }>();
  for (const g of grupos) {
    const a = porId.get(g.cuentaId) ?? { etiqueta: g.etiqueta, ars: 0, usd: 0, contable: 0, ultima: null, hayUsd: false };
    a.contable += g.balance;
    if (g.moneda === "USD") {
      a.usd += g.amountCurrency;
      if (Math.abs(g.amountCurrency) > 0.005) a.hayUsd = true;
      // Sin dólar de hoy, la parte en dólares queda al valor contable.
      if (!tcHoy) a.ars += g.balance;
    } else {
      a.ars += g.balance;
    }
    if (g.ultima && (!a.ultima || g.ultima > a.ultima)) a.ultima = g.ultima;
    porId.set(g.cuentaId, a);
  }

  const base = [...porId.entries()].map(([id, a]) => {
    const { codigo, nombre } = partirEtiqueta(a.etiqueta);
    const moneda: "ARS" | "USD" = a.hayUsd ? "USD" : "ARS";
    // Con dólar de hoy, la parte en dólares va en dólares × dólar de hoy (el balance de esas
    // líneas está sin revaluar y no se usa).
    const saldoArs = a.ars + (tcHoy && a.hayUsd ? a.usd * tcHoy : 0);
    const dias = a.ultima ? diasEntre(a.ultima.slice(0, 10), hoy) : null;
    return { id, codigo, nombre, moneda, saldoArs, saldoUsd: a.hayUsd ? a.usd : null, saldoContableArs: a.contable, ultimoMovimiento: a.ultima ? a.ultima.slice(0, 10) : null, diasSinMovimiento: dias, movimientos30d: movimientos30d[id] ?? 0 };
  });

  const relevantes = base.filter((c) => Math.abs(c.saldoArs) > 1 || c.movimientos30d > 0);
  const candidatas = relevantes.filter((c) => !NO_ES_CAJA[c.codigo]);
  const totalCandidatas = candidatas.reduce((s, c) => s + Math.max(0, c.saldoArs), 0);

  const salida: CuentaCaja[] = relevantes.map((c) => {
    const sinArqueo = c.codigo.startsWith("1.1.1.01") && c.moneda === "USD" && Math.abs(c.saldoArs) > 1;
    if (NO_ES_CAJA[c.codigo]) return { ...c, estado: "no_es_caja", enTotal: false, sinArqueo: false, nota: NO_ES_CAJA[c.codigo] };
    const quieta = c.diasSinMovimiento != null && c.diasSinMovimiento > DIAS_QUIETA;
    const pesa = totalCandidatas > 0 && Math.abs(c.saldoArs) / totalCandidatas > PESO_A_VERIFICAR;
    if (quieta && pesa) {
      return {
        ...c,
        estado: "a_verificar",
        enTotal: false,
        sinArqueo,
        nota: `Sin movimientos hace ${c.diasSinMovimiento} días. No se suma al total hasta que administración lo confirme.`,
      };
    }
    if (quieta) return { ...c, estado: "quieta", enTotal: true, sinArqueo, nota: `Sin movimientos hace ${c.diasSinMovimiento} días; monto chico, se suma. Confirmar el arqueo.` };
    const notaUsd = sinArqueo && c.saldoUsd ? `En libros está a ${Math.round(c.saldoContableArs / c.saldoUsd).toLocaleString("es-AR")} pesos por dólar; acá se toma en dólares, al dólar de hoy. Sin arqueo registrado.` : "";
    return { ...c, estado: "confiable", enTotal: true, sinArqueo, nota: notaUsd };
  });

  return salida.sort((a, b) => Number(b.enTotal) - Number(a.enTotal) || b.saldoArs - a.saldoArs);
}

export type TotalesCaja = {
  disponibleArs: number;
  /** Bancos + efectivo en pesos + FIMA (sin el dólar billete): lo que paga cheques. */
  pesosArs: number;
  dolaresUsd: number;
  dolaresArs: number;
  /** Cuentas quietas a verificar (fuera del total). */
  aVerificarArs: number;
};

export function totalesCaja(cuentas: CuentaCaja[]): TotalesCaja {
  const en = cuentas.filter((c) => c.enTotal);
  const sum = (xs: CuentaCaja[], f: (c: CuentaCaja) => number) => xs.reduce((s, c) => s + f(c), 0);
  return {
    disponibleArs: sum(en, (c) => c.saldoArs),
    pesosArs: sum(en.filter((c) => c.moneda === "ARS"), (c) => c.saldoArs),
    dolaresUsd: sum(en.filter((c) => c.moneda === "USD"), (c) => c.saldoUsd ?? 0),
    dolaresArs: sum(en.filter((c) => c.moneda === "USD"), (c) => c.saldoArs),
    aVerificarArs: sum(cuentas.filter((c) => c.estado === "a_verificar"), (c) => c.saldoArs),
  };
}

// ─── Semanas del flujo (§5) ────────────────────────────────────────────────────────────

export type SemanaRango = { n: number; desde: string; hasta: string; etiqueta: string };

const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

/** Bloques móviles de 7 días desde hoy: S1 = hoy…hoy+6. */
export function semanasDesde(hoy: string, cantidad = 8): SemanaRango[] {
  return Array.from({ length: cantidad }, (_, i) => {
    const desde = sumarDias(hoy, i * 7);
    const hasta = sumarDias(hoy, i * 7 + 6);
    return { n: i + 1, desde, hasta, etiqueta: `${dm(desde)}–${dm(hasta)}` };
  });
}

/**
 * En qué semana cae una fecha (índice 0…7). Antes de hoy: S1 si `vencidoAS1` (lo que ya
 * tendría que haber salido o entrado), si no -1. Después del horizonte: -1.
 */
export function indiceSemana(fecha: string, semanas: SemanaRango[], vencidoAS1 = false): number {
  if (!semanas.length) return -1;
  if (fecha < semanas[0].desde) return vencidoAS1 ? 0 : -1;
  return semanas.findIndex((s) => fecha >= s.desde && fecha <= s.hasta);
}

/** Las fechas de un día fijo del mes entre mañana y `hasta` (sueldos el 4, F.931 el 10…). */
export function fechasDelDia(dia: number, hoy: string, hasta: string): string[] {
  const salida: string[] = [];
  let y = Number(hoy.slice(0, 4));
  let m = Number(hoy.slice(5, 7));
  for (let i = 0; i < 4; i++) {
    const f = `${y}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (f > hoy && f <= hasta) salida.push(f);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return salida;
}

/** 'AAAA-MM' de una fecha corrida n meses. */
export function sumarMeses(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** Los `n` meses cerrados antes del mes de hoy, del más viejo al más nuevo. */
export function mesesCerrados(hoy: string, n = 3): string[] {
  const actual = hoy.slice(0, 7);
  return Array.from({ length: n }, (_, i) => sumarMeses(actual, i - n));
}

/**
 * Fecha estimada de pago de una posición de IVA: el día 20 del tercer mes siguiente
 * (patrón observado: junio se pagó el 21/09, julio vence ~20/10).
 */
export const fechaPagoIva = (posicionYm: string): string => `${sumarMeses(posicionYm, 3)}-20`;

// ─── Cheques (§2.1 y §2.2) ─────────────────────────────────────────────────────────────

export type EstadoCheque = "a_fecha" | "vencido_reciente" | "vencido_a_verificar";

/** a fecha (vence hoy o después) · vencido hace ≤ 7 días (se deposita esta semana) · más viejo, a verificar. */
export function estadoCheque(fechaPago: string, hoy: string): EstadoCheque {
  if (fechaPago >= hoy) return "a_fecha";
  return diasEntre(fechaPago, hoy) <= 7 ? "vencido_reciente" : "vencido_a_verificar";
}

// ─── Por pagar (§4.1) ──────────────────────────────────────────────────────────────────

export type ClaveTramo = "no_vencido" | "d1_30" | "d31_60" | "d61_90" | "d90_mas";
export const TRAMOS: readonly { clave: ClaveTramo; etiqueta: string }[] = [
  { clave: "no_vencido", etiqueta: "No vencido" },
  { clave: "d1_30", etiqueta: "1–30 días" },
  { clave: "d31_60", etiqueta: "31–60 días" },
  { clave: "d61_90", etiqueta: "61–90 días" },
  { clave: "d90_mas", etiqueta: "+90 días" },
];

/** Tramo por días desde el vencimiento (≤ 0 = no vencido). */
export function tramoPorDias(diasVencida: number): ClaveTramo {
  if (diasVencida <= 0) return "no_vencido";
  if (diasVencida <= 30) return "d1_30";
  if (diasVencida <= 60) return "d31_60";
  if (diasVencida <= 90) return "d61_90";
  return "d90_mas";
}

/** Vencimiento de una factura: el de Odoo o, si no hay, la fecha de factura. */
export const vencimiento = (due: string | false | null | undefined, fecha: string | false | null | undefined): string | null =>
  (due || fecha || null) ? String(due || fecha).slice(0, 10) : null;

// ─── Sector público (cobranzas_definiciones.md §7, provisorio) ─────────────────────────

const RE_PUBLICO = /MINISTERIO|ADMINISTRACION NACIONAL|GOBIERNO|MUNICIPALIDAD|GARRAHAN|HOSPITAL|UNIVERSIDAD NACIONAL|SECRETARIA DE|DIRECCION NACIONAL|INSTITUTO NACIONAL|PODER JUDICIAL|ANMAT/;

/** ¿El cliente es el Estado? Por nombre, sin acentos y en mayúsculas (regla provisoria). */
export function esPublico(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  return RE_PUBLICO.test(nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase());
}

// ─── Promedios para el escenario proyectado (§5) ───────────────────────────────────────

export type Supuestos = {
  sueldosMes: number;
  cargasMes: number;
  noRegistradosMes: number;
  fondoCeseMes: number;
  iibbMes: number;
  gastosCorrientesMes: number;
  subalquilerMes: number;
};

const SUELDOS = ["4.2.1.03.01", "4.2.1.04.01"];
const CARGAS = ["4.2.1.03.02", "4.2.1.04.02"];
const NO_REGISTRADOS = ["4.2.1.04.13", "4.2.1.04.15", "4.2.1.04.18"];
const FONDO_CESE = ["4.2.1.04.09", "4.2.1.04.10"];
const IIBB = ["4.2.1.07.03"];
const SUBALQUILER = ["4.2.1.03.12"];
/** De 4.2.1.03.* no son gasto corriente: sueldos y cargas, subalquiler y circuitos especiales (ajuste excluido). */
const FUERA_GASTOS_03 = ["4.2.1.03.01", "4.2.1.03.02", "4.2.1.03.12", "4.2.1.03.27"];
const GASTOS_04 = ["4.2.1.04.03", "4.2.1.04.06", "4.2.1.04.07"];

/**
 * Promedios mensuales (gasto en positivo) de las cuentas de resultado de los meses
 * cerrados. `cuchaArs` = el alquiler compensado con un socio (Cucha Cucha), que se resta
 * de los gastos corrientes porque no sale plata.
 */
export function supuestosDeGastos(porCuenta: { codigo: string; balance: number }[], meses: number, cuchaArs = 0): Supuestos {
  const s = (codigos: string[]) => porCuenta.filter((c) => codigos.includes(c.codigo)).reduce((a, c) => a + c.balance, 0) / meses;
  const gastos03 = porCuenta.filter((c) => c.codigo.startsWith("4.2.1.03.") && !FUERA_GASTOS_03.includes(c.codigo)).reduce((a, c) => a + c.balance, 0);
  const gastos01 = porCuenta.filter((c) => c.codigo.startsWith("4.2.1.01.")).reduce((a, c) => a + c.balance, 0);
  const gastos04 = porCuenta.filter((c) => GASTOS_04.includes(c.codigo)).reduce((a, c) => a + c.balance, 0);
  return {
    sueldosMes: s(SUELDOS),
    cargasMes: s(CARGAS),
    noRegistradosMes: s(NO_REGISTRADOS),
    fondoCeseMes: s(FONDO_CESE),
    iibbMes: s(IIBB),
    gastosCorrientesMes: (gastos01 + gastos03 + gastos04 - cuchaArs) / meses,
    subalquilerMes: s(SUBALQUILER),
  };
}

/** Colchón sugerido: un mes de sueldos (registrados + cargas F.931 + no registrados y contratistas). */
export const colchonSugerido = (s: Supuestos): number => s.sueldosMes + s.cargasMes + s.noRegistradosMes;

/** Mensual → semanal (× 12 ÷ 52). */
export const semanal = (mensual: number): number => (mensual * 12) / 52;

// ─── Retiros para el flujo (§7.2, sólo el neto sin dividendos) ─────────────────────────

export type LineaRetiro = {
  fecha: string;
  codigoCuenta: string;
  /** move_id display + ref + name, para las exclusiones por texto. */
  texto: string;
  /** El name de la línea (para 4.2.1.04.19). */
  nombre: string;
  balance: number;
  amountCurrency: number;
  moneda: string | null;
};

export const CUENTAS_PARTICULARES = ["1.1.4.02.09", "1.1.4.02.10"];
export const CUENTA_RETIROS_GASTO = "4.2.1.04.19";

/**
 * ¿La línea es retiro (o devolución) de un socio?
 *  · Cuentas particulares en pesos: todo menos los asientos de dolarización y las
 *    reclasificaciones temporales.
 *  · 4.2.1.04.19 (retiros en dólares billete cargados como gasto): sólo "RETIRO SOCIO" y
 *    "Fondeo cuenta socios"; no los adelantos ni lo mal imputado.
 */
export function esLineaRetiro(l: LineaRetiro): boolean {
  if (CUENTAS_PARTICULARES.includes(l.codigoCuenta)) return !/dolarizaci|reclasificaci[oó]n temporal/i.test(l.texto);
  if (l.codigoCuenta === CUENTA_RETIROS_GASTO) return !/adelanto/i.test(l.nombre) && /retiro socio|fondeo cuenta socios/i.test(l.nombre);
  return false;
}

/** Retiro neto en dólares de las líneas (cada una al dólar de su fecha). null si falta un dólar. */
export function retiroNetoUsd(lineas: LineaRetiro[], tcDe: (fecha: string) => number | null): number | null {
  let total = 0;
  for (const l of lineas) {
    if (!esLineaRetiro(l)) continue;
    if (l.moneda === "USD") { total += l.amountCurrency; continue; }
    const tc = tcDe(l.fecha);
    if (!tc) return null;
    total += l.balance / tc;
  }
  return total;
}

// ─── Flujo (§5) ────────────────────────────────────────────────────────────────────────

export type Escenario = "proyectado" | "comprometido";
export const ESCENARIOS: Readonly<Record<Escenario, string>> = { proyectado: "Proyectado", comprometido: "Sólo lo comprometido" };

export type Partida = { titulo: string; sub?: string; fecha: string | null; ars: number; odoo?: { modelo: string; id: number } };

export type Concepto = {
  id: string;
  concepto: string;
  tipo: "ingreso" | "egreso";
  /** "comprometido" = ya está en Odoo con fecha; "estimado" = promedio o regla. */
  origen: "comprometido" | "estimado";
  /** En qué escenarios entra. */
  escenarios: Escenario[];
  fuente: string;
  /** Monto (positivo) de cada semana. */
  porSemana: number[];
  /** Documentos que lo componen (cheques, facturas), para el desglose de la semana. */
  partidas?: Partida[];
  /** Sólo socios (retiros): no viaja a quien no tiene direccion-socios. */
  reservado?: boolean;
};

export type FilaFlujo = { n: number; desde: string; hasta: string; etiqueta: string; entra: number; sale: number; saldo: number; pesos: number };

/**
 * Saldo de cada semana de un escenario. El saldo total arranca en la caja disponible y el
 * "en pesos" en la caja sin el dólar billete; todo lo que entra y sale es en pesos.
 */
export function filasFlujo(semanas: SemanaRango[], conceptos: Concepto[], esc: Escenario, saldoInicial: number, saldoInicialPesos: number): FilaFlujo[] {
  let saldo = saldoInicial;
  let pesos = saldoInicialPesos;
  return semanas.map((s, i) => {
    const del = conceptos.filter((c) => c.escenarios.includes(esc));
    const entra = del.filter((c) => c.tipo === "ingreso").reduce((a, c) => a + (c.porSemana[i] ?? 0), 0);
    const sale = del.filter((c) => c.tipo === "egreso").reduce((a, c) => a + (c.porSemana[i] ?? 0), 0);
    saldo += entra - sale;
    pesos += entra - sale;
    return { ...s, entra, sale, saldo, pesos };
  });
}

export type Cobertura = {
  /** true = no baja del colchón en las 8 semanas. */
  mas: boolean;
  /** Semanas completas sobre el colchón (8 si no cae). */
  semanas: number;
  /** Índice de la semana que cae (null si no cae). */
  cae: number | null;
  /** La fecha que se muestra: el último día antes de la semana que cae, o el fin del horizonte. */
  fecha: string;
  /** "Bien hasta el" o "Hasta el". */
  prefijo: string;
  /** Plata en pesos de la semana que cae y cuánto falta para el colchón. */
  pesosCae: number | null;
  faltaArs: number | null;
};

/** Cobertura (§5.1, revisión B12): semanas en que la plata en pesos queda sobre el colchón, como fecha. */
export function cobertura(filas: FilaFlujo[], colchonArs: number): Cobertura {
  const i = filas.findIndex((f) => f.pesos < colchonArs);
  if (i < 0) {
    const fin = filas[filas.length - 1];
    return { mas: true, semanas: filas.length, cae: null, fecha: fin?.hasta ?? "", prefijo: "Bien hasta el", pesosCae: null, faltaArs: null };
  }
  return { mas: false, semanas: i, cae: i, fecha: sumarDias(filas[i].desde, -1), prefijo: "Hasta el", pesosCae: filas[i].pesos, faltaArs: colchonArs - filas[i].pesos };
}

/**
 * El flujo con los retiros de socios (`detalle.reservado.flujo`) en lugar del público.
 *
 * Los retiros son un egreso estimado reservado: el flujo público (`detalle.flujo`) se calcula
 * SIN ellos, así nadie sin direccion-socios puede deducirlos restando renglones del total de
 * la semana; los socios ven el flujo completo. Sin `reservado.flujo` (recortado, o no hubo
 * retiros), devuelve el mismo detalle. Pura.
 */
export function conRetiros(d: DetalleCaja): DetalleCaja {
  const r = d.reservado?.flujo;
  if (!r) return d;
  return { ...d, flujo: { ...d.flujo, escenarios: r.escenarios, cobertura: r.cobertura } };
}

/** El nodo de desglose de la cobertura: con el flujo de socios, el reservado. */
export const tipoNodoCobertura = (d: DetalleCaja): "cobertura" | "coberturaSocios" => (d.reservado?.flujo ? "coberturaSocios" : "cobertura");

/** Reparte un monto en partes iguales en las primeras `n` semanas. */
export function repartir(monto: number, n: number, total = 8): number[] {
  return Array.from({ length: total }, (_, i) => (i < n ? monto / n : 0));
}

/** Suma partidas por semana (índice de `indiceSemana`); las que dan -1 no entran. */
export function porSemana(items: { indice: number; ars: number }[], total = 8): number[] {
  const v = Array.from({ length: total }, () => 0);
  for (const it of items) if (it.indice >= 0 && it.indice < total) v[it.indice] += it.ars;
  return v;
}

// ─── Varios ────────────────────────────────────────────────────────────────────────────

/** "Banco Galicia cta cte en pesos" → "Galicia"; "Financiera Borelli" → "Borelli". */
export function nombreCorto(nombre: string): string {
  const m = /^(?:Banco|Financiera|Inversiones)\s+(\S+)/i.exec(nombre.trim());
  return m ? m[1] : nombre.replace(/\s+-\s+Empresa$/i, "").trim();
}

/** El lunes anterior a hoy (si hoy es lunes, el de la semana pasada). */
export function lunesAnterior(hoy: string): string {
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 dom … 6 sáb
  const atras = dow === 1 ? 7 : dow === 0 ? 6 : dow - 1;
  return sumarDias(hoy, -atras);
}

// ─── Cifra de cobertura (la usan el calculador y la vista, al cambiar de escenario) ───

/** La cifra de Cobertura (fecha) en un escenario, con el otro en la línea de contexto. */
export function cifraCobertura(d: DetalleCaja, esc: Escenario): Cifra {
  const otro: Escenario = esc === "proyectado" ? "comprometido" : "proyectado";
  const c = d.flujo.cobertura[esc];
  const o = d.flujo.cobertura[otro];
  const tipo = tipoNodoCobertura(d);
  if (!(d.flujo.colchon.ars > 0)) {
    return {
      kpi: "cobertura",
      valor: sinDato("No se pudo calcular el colchón mínimo: faltan los sueldos promedio"),
      confianza: { nivel: "inc", motivo: "Falta el colchón mínimo" },
      nodo: { tipo, e: esc },
    };
  }
  return {
    kpi: "cobertura",
    valor: { tipo: "fecha", iso: c.fecha, prefijo: c.prefijo },
    confianza: { nivel: "inc", motivo: "Usa el registro de cheques y facturas sin plazo" },
    valorMeta: c.semanas,
    nodo: { tipo, e: esc },
    contexto: [
      `${ESCENARIOS[otro]}: `,
      { valor: { tipo: "fecha", iso: o.fecha, prefijo: o.prefijo.toLowerCase() }, nodo: { tipo, e: otro } },
      " · colchón mínimo ",
      { valor: monto(d.flujo.colchon.ars) },
      d.flujo.colchon.editado ? "" : " (1 mes de sueldos)",
    ],
  };
}
