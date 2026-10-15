// Reglas PURAS de Socios (retiros). Sin Odoo ni Supabase: reciben las líneas contables ya
// leídas y devuelven el detalle de la pantalla. Fuente: finanzas_definiciones.md §7.
//
// CÓMO SE REGISTRAN LOS RETIROS EN ODOO (relevado)
//  1. Cuentas particulares en pesos (1.1.4.02.09 Jorge, 1.1.4.02.10 Gabriel). Débito = retiro,
//     crédito = devolución o compensación (p. ej. el alquiler de Cucha Cucha contra Gabriel).
//     Se excluyen los asientos "Dolarización…" y "Reclasificación temporal…".
//  2. Dolarización manual: un asiento por mes y socio pasa el neto a 1.1.4.02.11 / .12 (USD).
//     Ahí están también los "Retiros históricos" anuales 2020–2025. Un mes sin ese asiento
//     está "sin pasar a dólares en Odoo"; Dirección lo calcula igual.
//  3. Retiros en dólares billete cargados como GASTO en 4.2.1.04.19 ("RETIRO SOCIO JR/GS");
//     "Fondeo cuenta socios" se reparte 50/50; lo demás de esa cuenta no es retiro.
//  4. Dividendos pagados: débitos en 2.1.5.01.00 ("DIV-2024 JR/GS").
//
// MONTOS: pesos de cada mes = `balance` (contable); USD = cada movimiento al dólar de su
// fecha (si la línea está en USD, su `amount_currency`). Período → Monto { ars, usd }.

import { tcEn, type SerieDolar } from "../dolar.ts";
import { mesEtq, mesNombre } from "../formato.ts";
import type { Aviso, Frase, Monto } from "../tipos.ts";

export type SocioClave = "jorge" | "gabriel";

export type DefSocio = { clave: SocioClave; nombre: string; corto: string; sigla: "JR" | "GS"; cuentaArs: string; cuentaUsd: string };

/** Sólo hay cuentas para Jorge y Gabriel (§7.1). Los códigos son el plan de cuentas, no datos. */
export const SOCIOS: readonly DefSocio[] = [
  { clave: "jorge", nombre: "Jorge Riveros", corto: "Jorge", sigla: "JR", cuentaArs: "1.1.4.02.09", cuentaUsd: "1.1.4.02.11" },
  { clave: "gabriel", nombre: "Gabriel Stepansky", corto: "Gabriel", sigla: "GS", cuentaArs: "1.1.4.02.10", cuentaUsd: "1.1.4.02.12" },
];

export const CUENTA_RETIRO_GASTO = "4.2.1.04.19";
export const CUENTA_DIVIDENDOS = "2.1.5.01.00";
export const CUENTA_SIN_ASIGNAR = "1.1.4.02.03";

/** Todas las cuentas que lee Socios. */
export const CUENTAS_SOCIOS: readonly string[] = [
  ...SOCIOS.flatMap((s) => [s.cuentaArs, s.cuentaUsd]),
  CUENTA_RETIRO_GASTO,
  CUENTA_DIVIDENDOS,
  CUENTA_SIN_ASIGNAR,
];

/** Una línea contable normalizada (account.move.line). */
export type LineaSocios = {
  id: number;
  fecha: string;
  codigo: string;
  /** Nombre del asiento (move_id[1]). */
  asiento: string;
  asientoId: number | null;
  /** Etiqueta de la línea (name). */
  nombre: string;
  balance: number;
  montoMoneda: number;
  moneda: string;
  /** Cuándo y quién la cargó (para "última dolarización"). */
  creada?: string | null;
  creador?: string | null;
};

export type TipoLinea =
  | { tipo: "particular"; socio: SocioClave }
  | { tipo: "gasto"; partes: { socio: SocioClave; factor: number }[] }
  | { tipo: "dividendo"; socio: SocioClave }
  | { tipo: "dividendo_declarado" }
  | { tipo: "dolarizacion"; socio: SocioClave }
  | { tipo: "historico"; socio: SocioClave }
  | { tipo: "excluida"; motivo: string }
  | { tipo: "no_retiro" }
  | { tipo: "sin_asignar" }
  | { tipo: "sin_clasificar" };

const RE_EXCLUIR_PARTICULAR = /dolarizaci[oó]n|reclasificaci[oó]n temporal/i;

function siglaEn(texto: string): SocioClave | null {
  const jr = /\bJR\b/.test(texto);
  const gs = /\bGS\b/.test(texto);
  if (jr === gs) return null;
  return jr ? "jorge" : "gabriel";
}

/** Qué es cada línea para Socios (§7.2). */
export function clasificarLinea(l: LineaSocios): TipoLinea {
  const sArs = SOCIOS.find((s) => s.cuentaArs === l.codigo);
  if (sArs) {
    if (RE_EXCLUIR_PARTICULAR.test(l.asiento)) return { tipo: "excluida", motivo: "asiento de dolarización o reclasificación" };
    return { tipo: "particular", socio: sArs.clave };
  }
  const sUsd = SOCIOS.find((s) => s.cuentaUsd === l.codigo);
  if (sUsd) return /retiros hist[oó]ricos/i.test(`${l.asiento} ${l.nombre}`) ? { tipo: "historico", socio: sUsd.clave } : { tipo: "dolarizacion", socio: sUsd.clave };
  if (l.codigo === CUENTA_RETIRO_GASTO) {
    const m = /RETIRO\s+SOCIO\s+(JR|GS)\b/i.exec(l.nombre);
    if (m) return { tipo: "gasto", partes: [{ socio: m[1].toUpperCase() === "JR" ? "jorge" : "gabriel", factor: 1 }] };
    if (/fondeo cuenta socios/i.test(l.nombre)) return { tipo: "gasto", partes: [{ socio: "jorge", factor: 0.5 }, { socio: "gabriel", factor: 0.5 }] };
    return { tipo: "no_retiro" };
  }
  if (l.codigo === CUENTA_DIVIDENDOS) {
    if (l.balance <= 0) return { tipo: "dividendo_declarado" };
    const s = siglaEn(l.nombre);
    return s ? { tipo: "dividendo", socio: s } : { tipo: "sin_clasificar" };
  }
  if (l.codigo === CUENTA_SIN_ASIGNAR) return { tipo: "sin_asignar" };
  return { tipo: "sin_clasificar" };
}

// ─── Montos ────────────────────────────────────────────────────────────────────────────

/** Acumulador de un Monto de período: pesos + USD de cada movimiento (null si faltó un dólar). */
type Acum = { ars: number; usd: number | null };
const nuevo = (): Acum => ({ ars: 0, usd: 0 });
function sumar(a: Acum, ars: number, usd: number | null): void {
  a.ars += ars;
  a.usd = a.usd == null || usd == null ? null : a.usd + usd;
}
const aMonto = (a: Acum): Monto => ({ ars: redondear(a.ars), usd: a.usd == null ? null : redondear(a.usd) });
const redondear = (n: number) => Math.round(n * 100) / 100;

/** USD de una línea: la línea en USD vale su amount_currency; la de pesos, al dólar de su fecha. */
export function usdDeLinea(l: Pick<LineaSocios, "moneda" | "montoMoneda" | "balance" | "fecha">, dolar: SerieDolar): number | null {
  if (l.moneda === "USD") return l.montoMoneda;
  const tc = tcEn(dolar, l.fecha);
  return tc ? l.balance / tc.valor : null;
}

export function sumarMontos(ms: readonly Monto[]): Monto {
  const a = nuevo();
  for (const m of ms) sumar(a, m.ars, m.usd ?? null);
  return aMonto(a);
}

// ─── Agregado ──────────────────────────────────────────────────────────────────────────

export type MovSocio = {
  /** Débitos (retiros): cuenta particular + dólares cargados como gasto. */
  bruto: Monto;
  /** Créditos (devoluciones y compensaciones), en negativo. */
  compensaciones: Monto;
  /** La parte de 4.2.1.04.19 (retiros en dólares cargados como gasto). Ya está en bruto/neto. */
  comoGasto: Monto;
  /** bruto + compensaciones. */
  neto: Monto;
  dividendos: Monto;
  /** neto + dividendos. */
  total: Monto;
  /** Lo que Odoo pasó a dólares ese mes (1.1.4.02.11/.12). null = sin dolarizar. */
  dolarizadoOdooUsd: number | null;
  sinDolarizar: boolean;
  /** Hubo movimientos en la cuenta particular. */
  conMovimientos: boolean;
};

export type MesSocios = {
  mes: string;
  etiqueta: string;
  /** Mes en curso (sin sueldos devengados: no se compara con el resultado). */
  parcial: boolean;
  socios: Record<SocioClave, MovSocio>;
  total: Monto;
  sinDolarizar: boolean;
};

export type PuntoAcumulado = { etiqueta: string; usd: number };

export type ResumenSocio = {
  clave: SocioClave;
  nombre: string;
  corto: string;
  /** Año en curso. */
  anio: { total: Monto; neto: Monto; dividendos: Monto; comoGasto: Monto };
  /** Últimos 12 meses. */
  doce: { total: Monto; dividendos: Monto };
  /** Saldo de la cuenta particular en pesos: lo que todavía no pasó a dólares en Odoo (saldo). */
  pendienteDolarizar: Monto;
  /** Saldo acumulado de la cuenta particular en USD según Odoo (2020 → última dolarización). */
  saldoUsdOdoo: number;
  /** Serie para el gráfico: históricos anuales + dolarizaciones mensuales, acumulada. */
  acumulado: PuntoAcumulado[];
};

export type LineaNoRetiro = { id: number; fecha: string; asiento: string; asientoId: number | null; nombre: string; ars: number };

export type AgregadoRetiros = {
  meses: MesSocios[];
  socios: ResumenSocio[];
  mesesSinDolarizar: string[];
  ultimaDolarizacion: { mes: string; cargada: string | null; por: string | null } | null;
  /** Cuenta 1608 sin asignar (saldo, pesos). */
  sinAsignar: Monto;
  /** Dividendos declarados y no pagados (saldo de 2.1.5.01.00, en positivo). */
  dividendosPendientes: Monto;
  /** Débitos en 4.2.1.04.19 que no son retiro (no tienen socio). */
  noRetiro: LineaNoRetiro[];
  /** Líneas que no se supo a quién asignar (se informan, no se reparten). */
  sinClasificar: number;
  /** Movimientos sin dólar para su fecha (anteriores a la primera cotización). */
  sinDolar: number;
};

const MOV_VACIO = () => ({ bruto: nuevo(), comp: nuevo(), gasto: nuevo(), div: nuevo(), dolar: null as number | null, mov: false });

/** Meses 'AAAA-MM' entre dos inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  const [yh, mh] = hasta.split("-").map(Number);
  while (y < yh || (y === yh && m <= mh)) {
    salida.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return salida;
}

/** Suma n meses a 'AAAA-MM'. */
export function moverMes(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/**
 * Agrega las líneas en meses y socios. `desde`/`hasta` son 'AAAA-MM' (el inicio de la
 * historia y el mes en curso). Las líneas pueden venir de cualquier fecha: los saldos
 * (pendiente de dolarizar, acumulado USD, 1608, dividendos pendientes) usan todas.
 */
export function agregarRetiros(lineas: readonly LineaSocios[], dolar: SerieDolar, opts: { desde: string; hasta: string }): AgregadoRetiros {
  const meses = mesesEntre(opts.desde, opts.hasta);
  const porMes = new Map(meses.map((m) => [m, { jorge: MOV_VACIO(), gabriel: MOV_VACIO() }]));
  const saldoArs: Record<SocioClave, number> = { jorge: 0, gabriel: 0 };
  const saldoUsd: Record<SocioClave, number> = { jorge: 0, gabriel: 0 };
  const historicos: Record<SocioClave, { fecha: string; usd: number }[]> = { jorge: [], gabriel: [] };
  const dolarizaciones: Record<SocioClave, { fecha: string; usd: number }[]> = { jorge: [], gabriel: [] };
  let sinAsignar = 0;
  let dividendosSaldo = 0;
  let sinClasificar = 0;
  let sinDolar = 0;
  let ultima: LineaSocios | null = null;
  const noRetiro: LineaNoRetiro[] = [];

  for (const l of lineas) {
    const t = clasificarLinea(l);
    const mes = l.fecha.slice(0, 7);
    const enRango = porMes.get(mes);
    const usd = usdDeLinea(l, dolar);
    if (t.tipo === "particular" || t.tipo === "excluida") {
      const s = SOCIOS.find((x) => x.cuentaArs === l.codigo)!.clave;
      saldoArs[s] += l.balance;
    }
    switch (t.tipo) {
      case "particular": {
        if (!enRango) break;
        if (usd == null) sinDolar++;
        const m = enRango[t.socio];
        m.mov = true;
        sumar(l.balance >= 0 ? m.bruto : m.comp, l.balance, usd);
        break;
      }
      case "gasto": {
        if (!enRango) break;
        if (usd == null) sinDolar++;
        for (const p of t.partes) {
          const m = enRango[p.socio];
          sumar(l.balance >= 0 ? m.bruto : m.comp, l.balance * p.factor, usd == null ? null : usd * p.factor);
          sumar(m.gasto, l.balance * p.factor, usd == null ? null : usd * p.factor);
        }
        break;
      }
      case "dividendo": {
        dividendosSaldo += l.balance;
        if (!enRango) break;
        if (usd == null) sinDolar++;
        sumar(enRango[t.socio].div, l.balance, usd);
        break;
      }
      case "dividendo_declarado":
        dividendosSaldo += l.balance;
        break;
      case "dolarizacion": {
        saldoUsd[t.socio] += l.montoMoneda;
        dolarizaciones[t.socio].push({ fecha: l.fecha, usd: l.montoMoneda });
        if (enRango) enRango[t.socio].dolar = (enRango[t.socio].dolar ?? 0) + l.montoMoneda;
        if (!ultima || l.fecha > ultima.fecha) ultima = l;
        break;
      }
      case "historico":
        saldoUsd[t.socio] += l.montoMoneda;
        historicos[t.socio].push({ fecha: l.fecha, usd: l.montoMoneda });
        break;
      case "no_retiro":
        if (l.balance > 0) noRetiro.push({ id: l.id, fecha: l.fecha, asiento: l.asiento, asientoId: l.asientoId, nombre: l.nombre, ars: l.balance });
        break;
      case "sin_asignar":
        sinAsignar += l.balance;
        break;
      case "sin_clasificar":
        sinClasificar++;
        break;
      case "excluida":
        break;
    }
  }

  const salidaMeses: MesSocios[] = meses.map((mes) => {
    const d = porMes.get(mes)!;
    const socios = {} as Record<SocioClave, MovSocio>;
    for (const s of SOCIOS) {
      const x = d[s.clave];
      const neto = nuevo();
      sumar(neto, x.bruto.ars + x.comp.ars, x.bruto.usd == null || x.comp.usd == null ? null : x.bruto.usd + x.comp.usd);
      const total = nuevo();
      sumar(total, neto.ars + x.div.ars, neto.usd == null || x.div.usd == null ? null : neto.usd + x.div.usd);
      socios[s.clave] = {
        bruto: aMonto(x.bruto),
        compensaciones: aMonto(x.comp),
        comoGasto: aMonto(x.gasto),
        neto: aMonto(neto),
        dividendos: aMonto(x.div),
        total: aMonto(total),
        dolarizadoOdooUsd: x.dolar == null ? null : redondear(x.dolar),
        sinDolarizar: x.dolar == null,
        conMovimientos: x.mov,
      };
    }
    return {
      mes,
      etiqueta: mesEtq(mes),
      parcial: mes === opts.hasta,
      socios,
      total: sumarMontos(SOCIOS.map((s) => socios[s.clave].total)),
      sinDolarizar: SOCIOS.some((s) => socios[s.clave].sinDolarizar),
    };
  });

  const anio = opts.hasta.slice(0, 4);
  const delAnio = salidaMeses.filter((m) => m.mes.startsWith(anio));
  const doce = salidaMeses.filter((m) => m.mes >= moverMes(opts.hasta, -11));

  const resumenes: ResumenSocio[] = SOCIOS.map((s) => {
    const k = s.clave;
    // Serie acumulada: históricos por año + dolarizaciones mensuales, en orden de fecha.
    let acc = 0;
    const acumulado: PuntoAcumulado[] = [];
    for (const h of [...historicos[k]].sort((a, b) => a.fecha.localeCompare(b.fecha))) acumulado.push({ etiqueta: h.fecha.slice(0, 4), usd: redondear((acc += h.usd)) });
    const porMesDol = new Map<string, number>();
    for (const d of dolarizaciones[k]) porMesDol.set(d.fecha.slice(0, 7), (porMesDol.get(d.fecha.slice(0, 7)) ?? 0) + d.usd);
    for (const [mes, usd] of [...porMesDol.entries()].sort((a, b) => a[0].localeCompare(b[0]))) acumulado.push({ etiqueta: mesEtq(mes), usd: redondear((acc += usd)) });
    return {
      clave: k,
      nombre: s.nombre,
      corto: s.corto,
      anio: {
        total: sumarMontos(delAnio.map((m) => m.socios[k].total)),
        neto: sumarMontos(delAnio.map((m) => m.socios[k].neto)),
        dividendos: sumarMontos(delAnio.map((m) => m.socios[k].dividendos)),
        comoGasto: sumarMontos(delAnio.map((m) => m.socios[k].comoGasto)),
      },
      doce: { total: sumarMontos(doce.map((m) => m.socios[k].total)), dividendos: sumarMontos(doce.map((m) => m.socios[k].dividendos)) },
      pendienteDolarizar: { ars: redondear(saldoArs[k]) },
      saldoUsdOdoo: redondear(saldoUsd[k]),
      acumulado,
    };
  });

  // Un mes está sin dolarizar si algún socio con movimientos no tiene el asiento.
  const mesesSinDolarizar = salidaMeses
    .filter((m) => SOCIOS.some((s) => m.socios[s.clave].sinDolarizar && m.socios[s.clave].conMovimientos))
    .map((m) => m.mes);

  const u = ultima as LineaSocios | null;
  return {
    meses: salidaMeses,
    socios: resumenes,
    mesesSinDolarizar,
    ultimaDolarizacion: u ? { mes: u.fecha.slice(0, 7), cargada: u.creada ? u.creada.slice(0, 10) : null, por: u.creador ?? null } : null,
    sinAsignar: { ars: redondear(sinAsignar) },
    dividendosPendientes: { ars: redondear(-dividendosSaldo) },
    noRetiro,
    sinClasificar,
    sinDolar,
  };
}

// ─── Retiros contra el resultado ───────────────────────────────────────────────────────

export type ResultadoMes = { mes: string; gestion: Monto };

export type RetirosSobreResultado = {
  desde: string;
  hasta: string;
  retiros: Monto;
  resultado: Monto;
  /** % en dólares (cada movimiento a su dólar / resultado al dólar promedio del mes). */
  pctUsd: number | null;
  /** % en pesos de cada mes. */
  pctArs: number | null;
};

const pct = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b <= 0 ? null : Math.round((a / b) * 1000) / 10;

/**
 * Retiros / resultado de gestión en un conjunto de meses (sólo los que tienen resultado).
 * null si no hay meses con resultado (p. ej. en enero no hay meses cerrados del año).
 */
export function retirosSobreResultado(meses: readonly MesSocios[], resultado: readonly ResultadoMes[]): RetirosSobreResultado | null {
  const res = new Map(resultado.map((r) => [r.mes, r.gestion]));
  const usados = meses.filter((m) => res.has(m.mes));
  if (usados.length === 0) return null;
  const retiros = sumarMontos(usados.map((m) => m.total));
  const resTot = sumarMontos(usados.map((m) => res.get(m.mes)!));
  return {
    desde: usados[0].mes,
    hasta: usados[usados.length - 1].mes,
    retiros,
    resultado: resTot,
    pctUsd: pct(retiros.usd, resTot.usd),
    pctArs: pct(retiros.ars, resTot.ars),
  };
}

/** "ene–sep 2026" (o "sep 2026" si es un solo mes). */
export function etiquetaRango(desde: string, hasta: string): string {
  const c = (m: string) => mesEtq(m).slice(0, 3);
  if (desde === hasta) return `${c(desde)} ${desde.slice(0, 4)}`;
  if (desde.slice(0, 4) === hasta.slice(0, 4)) return `${c(desde)}–${c(hasta)} ${hasta.slice(0, 4)}`;
  return `${mesEtq(desde)} a ${mesEtq(hasta)}`;
}

/** "septiembre y octubre" · "julio, agosto y septiembre". */
export function listaMeses(meses: readonly string[]): string {
  const n = meses.map(mesNombre);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

// ─── Circuitos de facturación (Contingencias) ──────────────────────────────────────────

export type GrupoCircuito = { diario: string; mes: string; ars: number };
export type FilaCircuito = { nombre: string; ars: number; pct: number | null };

function repartir(grupos: readonly GrupoCircuito[]): FilaCircuito[] {
  const t = new Map<string, number>();
  for (const g of grupos) t.set(g.diario, (t.get(g.diario) ?? 0) + g.ars);
  const tot = [...t.values()].reduce((a, v) => a + v, 0);
  return [...t.entries()]
    .filter(([, v]) => Math.abs(v) >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, ars]) => ({ nombre, ars: redondear(ars), pct: tot > 0 ? Math.round((ars / tot) * 1000) / 10 : null }));
}

/** Facturación (sin IVA) por diario: el mes en curso y los últimos 12 meses. */
export function agregarCircuitos(grupos: readonly GrupoCircuito[], mesActual: string): { mes: FilaCircuito[]; doce: FilaCircuito[] } {
  const desde12 = moverMes(mesActual, -11);
  return {
    mes: repartir(grupos.filter((g) => g.mes === mesActual)),
    doce: repartir(grupos.filter((g) => g.mes >= desde12 && g.mes <= mesActual)),
  };
}

// ─── Política de retiros ───────────────────────────────────────────────────────────────

/** El contenido guardado en direccion_politica_retiros (versionado). */
export type PoliticaRetiros = {
  /** % de Jorge; Gabriel es el resto. */
  proporcionJorge: number;
  /** Tope de retiros sobre el resultado de gestión (%), opcional. */
  topeResultadoPct?: number | null;
  /** Tope de retiros sobre la caja generada (%), opcional. */
  topeCajaPct?: number | null;
  /** Cada cuánto se compensan (texto libre: "mensual", "trimestral"). */
  frecuencia?: string | null;
  nota?: string | null;
};

/** Valida lo que viene de Supabase (jsonb): null si no sirve. */
export function leerPolitica(contenido: unknown): PoliticaRetiros | null {
  if (!contenido || typeof contenido !== "object") return null;
  const c = contenido as Record<string, unknown>;
  const p = Number(c.proporcionJorge);
  if (!Number.isFinite(p) || p < 0 || p > 100) return null;
  const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);
  return { proporcionJorge: p, topeResultadoPct: num(c.topeResultadoPct), topeCajaPct: num(c.topeCajaPct), frecuencia: txt(c.frecuencia), nota: txt(c.nota) };
}

export type DesvioSocio = { clave: SocioClave; acordado: Monto; desvio: Monto; /** |desvío| < 5 % de lo acordado. */ enLinea: boolean };

/**
 * Lo acordado para cada socio = total retirado × su proporción; desvío = real − acordado.
 * No compara a una persona con la otra: compara a cada uno con lo que acordaron.
 */
export function desvioContraPolitica(porSocio: readonly { clave: SocioClave; total: Monto }[], politica: PoliticaRetiros): DesvioSocio[] {
  const total = sumarMontos(porSocio.map((s) => s.total));
  return porSocio.map((s) => {
    const prop = (s.clave === "jorge" ? politica.proporcionJorge : 100 - politica.proporcionJorge) / 100;
    const acordado: Monto = { ars: redondear(total.ars * prop), usd: total.usd == null ? null : redondear(total.usd * prop) };
    const desvio: Monto = { ars: redondear(s.total.ars - acordado.ars), usd: s.total.usd == null || acordado.usd == null ? null : redondear(s.total.usd - acordado.usd) };
    const base = acordado.usd ?? acordado.ars;
    const d = desvio.usd ?? desvio.ars;
    return { clave: s.clave, acordado, desvio, enLinea: base !== 0 ? Math.abs(d / base) < 0.05 : Math.abs(d) < 1 };
  });
}

// ─── Avisos de calidad de retiros (reservados) ─────────────────────────────────────────

/** Los avisos de calidad que salen de Socios. Todos reservados: sólo los ven los socios. */
export function avisosRetiros(a: Pick<AgregadoRetiros, "mesesSinDolarizar" | "ultimaDolarizacion" | "noRetiro" | "socios" | "meses">, hasta: string): Aviso[] {
  const avisos: Aviso[] = [];
  if (a.mesesSinDolarizar.length) {
    const u = a.ultimaDolarizacion;
    const detalle: Frase = ["Dirección los calcula igual desde las cuentas en pesos, al dólar de cada movimiento."];
    if (u) detalle.push(` Última dolarización: ${mesNombre(u.mes)}${u.cargada ? `, cargada el ${u.cargada.slice(8, 10)}/${u.cargada.slice(5, 7)}` : ""}${u.por ? ` por ${u.por}` : ""}.`);
    avisos.push({
      id: "retiros_sin_dolarizar",
      nivel: "inc",
      reservado: true,
      origen: "auto",
      aviso: [`Retiros de ${listaMeses(a.mesesSinDolarizar)} sin pasar a dólares en Odoo`],
      desde: `${a.mesesSinDolarizar[0]}-01`,
      afecta: ["retiros"],
      quien: u?.por ?? "Administración",
      que: "Cargar la dolarización mensual (idealmente automática).",
      detalle,
    });
  }
  const desde12 = moverMes(hasta, -11);
  const gasto12 = sumarMontos(a.meses.filter((m) => m.mes >= desde12).flatMap((m) => SOCIOS.map((s) => m.socios[s.clave].comoGasto)));
  if (Math.abs(gasto12.ars) >= 1) {
    avisos.push({
      id: "retiros_gasto",
      nivel: "inc",
      reservado: true,
      origen: "auto",
      aviso: ["Retiros en dólares billete cargados como gasto (", { valor: { tipo: "monto", monto: gasto12 }, nodo: { tipo: "retirosGasto" } }, " en 12 meses)"],
      desde: null,
      afecta: ["retiros", "resultado"],
      quien: "Contador",
      que: "Reimputar a la cuenta particular de cada socio.",
      detalle: [`Cuenta ${CUENTA_RETIRO_GASTO}. Acá se cuentan como retiro y se sacan del resultado; no aparecían en el tablero viejo de Retiros.`],
    });
  }
  if (a.noRetiro.length) {
    const ars = a.noRetiro.reduce((t, l) => t + l.ars, 0);
    const primera = [...a.noRetiro].sort((x, y) => x.fecha.localeCompare(y.fecha))[0];
    avisos.push({
      id: "debito_4219",
      nivel: "inf",
      reservado: true,
      origen: "auto",
      aviso: [{ valor: { tipo: "monto", monto: { ars } }, nodo: { tipo: "retirosGasto" } }, " en la cuenta de retiros en dólares que no es retiro"],
      desde: primera.fecha,
      afecta: ["retiros", "resultado"],
      quien: "Contador",
      que: "Reimputar a la cuenta que corresponda.",
      detalle: [`${a.noRetiro.map((l) => `${l.asiento.split(" (")[0]} del ${l.fecha.slice(8, 10)}/${l.fecha.slice(5, 7)} ("${l.nombre.slice(0, 60)}")`).join("; ")}, cargado en ${CUENTA_RETIRO_GASTO}. No cuenta ni como retiro ni como gasto del resultado.`],
    });
  }
  return avisos;
}
