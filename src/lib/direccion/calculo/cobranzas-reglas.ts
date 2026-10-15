// Reglas PURAS de Cobranzas (sin Odoo, sin Next): clasificación de partidas, vencimiento
// efectivo, neteo FIFO de los cobros sin imputar, aging, sector público, concentración,
// "no llamar", DSO, prorrateo del cobrado y días reales de cobro. Las usa el calculador
// (./cobranzas.ts) y las prueba cobranzas-reglas.test.ts.
//
// Fuente: Odoo-Claude/direccion/datos/cobranzas_definiciones.md (indicadores 1–13) y la
// lógica de la maqueta aprobada (docs/direccion/maqueta.html §3.3 y §7.4).

import { diasEntre, sumarDias } from "../formato.ts";

// ─── Constantes ─────────────────────────────────────────────────────────────────────────

/** Deudores locales. NO todo asset_receivable: incluye Préstamos al personal. */
export const CODIGO_DEUDORES = "1.1.3.01.010";
/** Facturas sin plazo de pago: vencen a los N días de emitidas (configurable). */
export const DIAS_SIN_PLAZO = 30;
/** Residuos menores a $1 no son partidas (redondeos de conciliación). */
export const RESIDUO_MINIMO = 1;

export type ClaveTramo = "no_vencido" | "d1_30" | "d31_60" | "d61_90" | "d90_mas";
export const TRAMOS: readonly { clave: ClaveTramo; etiqueta: string }[] = [
  { clave: "no_vencido", etiqueta: "No vencido" },
  { clave: "d1_30", etiqueta: "1–30 d" },
  { clave: "d31_60", etiqueta: "31–60 d" },
  { clave: "d61_90", etiqueta: "61–90 d" },
  { clave: "d90_mas", etiqueta: "+90 d" },
];
/** Los tramos de "vencido +30 días". */
export const TRAMOS_MAS_30: readonly ClaveTramo[] = ["d31_60", "d61_90", "d90_mas"];
export const TRAMOS_MAS_60: readonly ClaveTramo[] = ["d61_90", "d90_mas"];

export function tramoDe(diasAtraso: number): ClaveTramo {
  if (diasAtraso <= 0) return "no_vencido";
  if (diasAtraso <= 30) return "d1_30";
  if (diasAtraso <= 60) return "d31_60";
  if (diasAtraso <= 90) return "d61_90";
  return "d90_mas";
}

// ─── Texto ──────────────────────────────────────────────────────────────────────────────

/** Mayúsculas y sin acentos (para reglas por texto). */
export function normalizar(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/** ¿El texto del asiento dice que es un cheque rechazado? ("rechaz", "rchz"). */
export function esTextoRechazo(texto: string | null | undefined): boolean {
  return /RECHAZ|RCHZ/.test(normalizar(texto));
}

// ─── Partidas ───────────────────────────────────────────────────────────────────────────

export type TipoPartida = "factura" | "nc" | "cheque_rechazado" | "debito" | "sin_imputar";

/**
 * Qué es una partida abierta de Deudores locales (indicador 2). null = residuo de centavos.
 * Factura/NC por el tipo del asiento; el resto, por el signo y el texto.
 */
export function clasificarPartida(moveType: string | null | undefined, residual: number, texto: string): TipoPartida | null {
  if (!Number.isFinite(residual) || Math.abs(residual) < RESIDUO_MINIMO) return null;
  if (moveType === "out_invoice") return "factura";
  if (moveType === "out_refund") return "nc";
  if (residual < 0) return "sin_imputar";
  return esTextoRechazo(texto) ? "cheque_rechazado" : "debito";
}

export const esDocumento = (t: TipoPartida): boolean => t === "factura" || t === "nc";

/**
 * Vencimiento efectivo (indicador 3):
 *  · factura con plazo cargado → el vencimiento de la cuota (date_maturity);
 *  · factura sin plazo → fecha de factura + N días;
 *  · rechazos y débitos → la fecha del asiento (se debe desde el rechazo).
 */
export function vencimientoEfectivo(
  p: { tipo: TipoPartida; fecha: string; fechaFactura?: string | null; vencOdoo?: string | null; tienePlazo?: boolean },
  diasSinPlazo: number = DIAS_SIN_PLAZO,
): { venc: string; criterio: string } {
  if (esDocumento(p.tipo)) {
    if (p.tienePlazo && p.vencOdoo) return { venc: p.vencOdoo, criterio: "plazo cargado en Odoo" };
    const base = p.fechaFactura || p.fecha;
    return { venc: sumarDias(base, diasSinPlazo), criterio: `sin plazo: emisión + ${diasSinPlazo} días` };
  }
  return { venc: p.fecha, criterio: p.tipo === "sin_imputar" ? "cobro" : "desde el asiento" };
}

export type PartidaNeteable = { id: number; partnerId: number; residual: number; venc: string; fecha: string };

/**
 * Neteo FIFO por cliente (indicador 4): los créditos abiertos (cobros sin imputar y NC) se
 * aplican a las partidas deudoras más viejas del mismo cliente. Devuelve el neto de cada
 * partida (los créditos quedan en 0) y lo que sobra como saldo a favor (negativo).
 * Σ netos + Σ a favor = Σ residuales.
 */
export function netearFifo<T extends PartidaNeteable>(partidas: readonly T[]): { netas: (T & { neto: number })[]; aFavor: { partnerId: number; ars: number }[] } {
  const porCliente = new Map<number, T[]>();
  for (const p of partidas) {
    const l = porCliente.get(p.partnerId) ?? [];
    l.push(p);
    porCliente.set(p.partnerId, l);
  }
  const neto = new Map<number, number>();
  const aFavor: { partnerId: number; ars: number }[] = [];
  for (const [partnerId, lista] of porCliente) {
    let credito = lista.filter((p) => p.residual < 0).reduce((a, p) => a - p.residual, 0);
    const deudoras = lista
      .filter((p) => p.residual > 0)
      .sort((a, b) => a.venc.localeCompare(b.venc) || a.fecha.localeCompare(b.fecha) || a.id - b.id);
    for (const p of deudoras) {
      const aplica = Math.min(credito, p.residual);
      credito -= aplica;
      neto.set(p.id, p.residual - aplica);
    }
    if (credito > 0.005) aFavor.push({ partnerId, ars: -credito });
  }
  return { netas: partidas.map((p) => ({ ...p, neto: p.residual > 0 ? (neto.get(p.id) ?? p.residual) : 0 })), aFavor };
}

export type TotalTramo = { clave: ClaveTramo; etiqueta: string; ars: number; partidas: number };

/** Suma por tramo. Cuenta como partida toda la que tiene monto distinto de 0 en ese tramo. */
export function sumarTramos(items: readonly { tramo: ClaveTramo; ars: number }[]): TotalTramo[] {
  return TRAMOS.map((t) => {
    const del = items.filter((i) => i.tramo === t.clave && Math.abs(i.ars) >= RESIDUO_MINIMO);
    return { clave: t.clave, etiqueta: t.etiqueta, ars: del.reduce((a, i) => a + i.ars, 0), partidas: del.length };
  });
}

// ─── Sector público ─────────────────────────────────────────────────────────────────────

/** Regla provisoria por nombre (indicador 7), sin acentos y en mayúsculas. */
export const PATRON_PUBLICO = "MINISTERIO|ADMINISTRACION NACIONAL|GOBIERNO|MUNICIPALIDAD|GARRAHAN|HOSPITAL|UNIVERSIDAD NACIONAL|SECRETARIA DE|DIRECCION NACIONAL|INSTITUTO NACIONAL|PODER JUDICIAL|ANMAT";

/**
 * Configuración de Cobranzas (direccion_config, clave "cobranzas"): la regla por nombre, las
 * excepciones a mano (ids de res.partner) y los días de las facturas sin plazo.
 */
export type ConfigCobranzas = { patron: string; publicos: number[]; privados: number[]; diasSinPlazo: number };

export const CONFIG_DEFECTO: ConfigCobranzas = { patron: PATRON_PUBLICO, publicos: [], privados: [], diasSinPlazo: DIAS_SIN_PLAZO };

/** Lee la configuración guardada; lo que falte o no sirva, por defecto. */
export function leerConfigCobranzas(valor: unknown): ConfigCobranzas {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n) && (n as number) > 0) : []);
  let patron = typeof v.patron === "string" && v.patron.trim() ? v.patron.trim() : PATRON_PUBLICO;
  try {
    new RegExp(patron);
  } catch {
    patron = PATRON_PUBLICO;
  }
  const dias = typeof v.diasSinPlazo === "number" && Number.isInteger(v.diasSinPlazo) && v.diasSinPlazo >= 0 && v.diasSinPlazo <= 180 ? v.diasSinPlazo : DIAS_SIN_PLAZO;
  return { patron, publicos: ids(v.publicos), privados: ids(v.privados), diasSinPlazo: dias };
}

/** ¿Es organismo público? Primero lo marcado a mano; si no, la regla por nombre. */
export function sectorDe(partnerId: number, nombre: string, cfg: ConfigCobranzas): { publico: boolean; origen: "manual" | "regla" } {
  if (cfg.publicos.includes(partnerId)) return { publico: true, origen: "manual" };
  if (cfg.privados.includes(partnerId)) return { publico: false, origen: "manual" };
  return { publico: new RegExp(`(^|[^A-Z])(${cfg.patron})`).test(normalizar(nombre)), origen: "regla" };
}

// ─── Concentración ──────────────────────────────────────────────────────────────────────

/**
 * Indicador 6: top 10 % y HHI (Σ participación² de los clientes con saldo > 0, en % del
 * saldo total). null si no hay saldo.
 */
export function concentracion(saldos: readonly number[], total: number): { top10Pct: number | null; hhi: number | null; mayorPct: number | null } {
  if (!(total > 0)) return { top10Pct: null, hhi: null, mayorPct: null };
  const pos = saldos.filter((s) => s > 0).sort((a, b) => b - a);
  const top10 = pos.slice(0, 10).reduce((a, s) => a + s, 0);
  const hhi = pos.reduce((a, s) => a + ((s / total) * 100) ** 2, 0);
  return { top10Pct: (top10 / total) * 100, hhi, mayorPct: pos.length ? (pos[0] / total) * 100 : null };
}

// ─── A quién llamar ─────────────────────────────────────────────────────────────────────

/**
 * "No llamar" (maqueta §3.3): ya pagó al menos la mitad de lo que se le facturó y nadie
 * imputó el cobro. `sinImputar` en positivo; `saldo` es el neto (ya descuenta el cobro).
 */
export function noLlamar(c: { saldo: number; sinImputar: number }): boolean {
  return c.sinImputar > 0 && c.sinImputar >= (c.saldo + c.sinImputar) * 0.5;
}

/**
 * Cheques rechazados de un cliente que siguen en riesgo: lo rechazado que no compensan sus
 * cobros posteriores sin imputar (después de cubrir sus otros débitos). Entre 0 y lo rechazado.
 */
export function rechazoEnRiesgo(c: { rechazado: number; otrosDebitos: number; sinImputar: number }): number {
  if (!(c.rechazado > 0)) return 0;
  return Math.max(0, Math.min(c.rechazado, c.rechazado + c.otrosDebitos - c.sinImputar));
}

/** Nota de crédito que anula una factura (reversed_entry_id): la factura anulada, por nombre. */
export type NcAnulacion = { partnerId: number; fecha: string; anula: string };

/** Ventana para emparejar una refacturación con sus NC (la misma que Ventas: NC_DIAS = 10). */
export const DIAS_REFACTURACION = 10;

type GrupoDup = { partnerId: number; fecha: string; nombres: string[] };

function gruposMismoDiaImporte<T extends { partnerId: number; fecha: string; total: number; nombre: string }>(facturas: readonly T[]): GrupoDup[] {
  const grupos = new Map<string, T[]>();
  for (const f of facturas) {
    if (!(Math.abs(f.total) >= RESIDUO_MINIMO)) continue;
    const k = `${f.partnerId}|${f.fecha}|${Math.round(f.total)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const salida: GrupoDup[] = [];
  for (const g of grupos.values()) {
    // Una factura en cuotas tiene varias líneas: cuenta cada comprobante una vez.
    const nombres = [...new Set(g.map((f) => f.nombre))];
    if (nombres.length >= 2) salida.push({ partnerId: g[0].partnerId, fecha: g[0].fecha, nombres });
  }
  return salida;
}

/**
 * Las facturas anuladas que explica un grupo "mismo día e importe": NC del mismo cliente,
 * dentro de los 10 días, que anulan OTRAS facturas (no las del grupo). Si hay al menos una
 * por cada factura del grupo, es una refacturación (se anularon y se volvieron a emitir), no
 * una duplicada. Caso real: Ministerio, FA-B 585 y 586 del 08/10 reemplazan a 513 y 583,
 * anuladas con las NC-B 51 y 52 el mismo día. null si no la explican.
 */
export function anuladasQueReemplaza(g: GrupoDup, ncs: readonly NcAnulacion[]): string[] | null {
  const anuladas = [...new Set(
    ncs
      .filter((n) => n.partnerId === g.partnerId && !g.nombres.includes(n.anula) && Math.abs(diasEntre(n.fecha, g.fecha)) <= DIAS_REFACTURACION)
      .map((n) => n.anula),
  )];
  return anuladas.length >= g.nombres.length ? anuladas.sort() : null;
}

/**
 * Pares de facturas abiertas del mismo cliente, mismo día y mismo importe (¿duplicada?), SIN
 * las que son una refacturación (ver anuladasQueReemplaza): avisar "¿duplicada?" sobre una
 * factura válida puede terminar en que alguien la anule.
 */
export function posiblesDuplicadas<T extends { partnerId: number; fecha: string; total: number; nombre: string }>(facturas: readonly T[], ncs: readonly NcAnulacion[] = []): Map<number, string[][]> {
  const salida = new Map<number, string[][]>();
  for (const g of gruposMismoDiaImporte(facturas)) {
    if (anuladasQueReemplaza(g, ncs)) continue;
    salida.set(g.partnerId, [...(salida.get(g.partnerId) ?? []), g.nombres]);
  }
  return salida;
}

/** Los grupos "mismo día e importe" que son refacturaciones: qué facturas reemplazan a cuáles. */
export function refacturaciones<T extends { partnerId: number; fecha: string; total: number; nombre: string }>(facturas: readonly T[], ncs: readonly NcAnulacion[]): Map<number, { nuevas: string[]; anuladas: string[]; fecha: string }[]> {
  const salida = new Map<number, { nuevas: string[]; anuladas: string[]; fecha: string }[]>();
  for (const g of gruposMismoDiaImporte(facturas)) {
    const anuladas = anuladasQueReemplaza(g, ncs);
    if (!anuladas) continue;
    salida.set(g.partnerId, [...(salida.get(g.partnerId) ?? []), { nuevas: g.nombres, anuladas, fecha: g.fecha }]);
  }
  return salida;
}

// ─── DSO ────────────────────────────────────────────────────────────────────────────────

/**
 * Indicador 11: saldo ÷ facturado con IVA de la ventana × días de la ventana. La ventana es
 * de 90 días, o menos al principio (Odoo arranca en una fecha: no se inventan ventas antes).
 */
export function ventanaDso(fin: string, primeraFactura: string | null): number {
  if (!primeraFactura) return 90;
  return Math.max(1, Math.min(90, diasEntre(sumarDias(primeraFactura, -1), fin)));
}

export function dso(saldo: number | null, ventas: number | null, dias: number): number | null {
  if (saldo == null || ventas == null || !(ventas > 0) || !Number.isFinite(saldo)) return null;
  return (saldo / ventas) * dias;
}

/** Suma de una serie diaria {fecha → monto} en (fin − dias, fin]. */
export function sumaVentana(diaria: ReadonlyMap<string, number> | readonly [string, number][], fin: string, dias: number): number {
  const desde = sumarDias(fin, -dias);
  let s = 0;
  for (const [f, v] of diaria instanceof Map ? diaria.entries() : (diaria as [string, number][])) if (f > desde && f <= fin) s += v;
  return s;
}

// ─── Cobrado ────────────────────────────────────────────────────────────────────────────

export type ClaseCuenta = "deudores" | "dinero" | "retencion" | "tecnica" | "ajuste";

/** Indicador 13: la contrapartida de un cobro. */
export function claseCuenta(codigo: string): ClaseCuenta {
  const c = codigo.trim();
  if (c === CODIGO_DEUDORES) return "deudores";
  if (c.startsWith("1.1.1.") || c === "98989898") return "dinero";
  if (c.startsWith("1.1.4.")) return "retencion";
  if (c === "6.0.0.00.020") return "tecnica";
  return "ajuste";
}

export type Prorrateo = { credito: number; dinero: number; retenciones: number; ajustes: number };

/**
 * Prorratea el crédito a Deudores de UN asiento según sus contrapartidas con saldo deudor:
 * dinero (1.1.1.*, 98989898), retenciones (1.1.4.*) y ajustes (el resto; no es cobro). La
 * cuenta técnica de base imponible se ignora. Cobrado = dinero + retenciones.
 */
export function prorratearCobro(lineas: readonly { codigo: string; balance: number }[]): Prorrateo {
  const porCuenta = new Map<string, number>();
  for (const l of lineas) porCuenta.set(l.codigo, (porCuenta.get(l.codigo) ?? 0) + l.balance);
  let credito = 0;
  let dinero = 0;
  let ret = 0;
  let aj = 0;
  for (const [codigo, neto] of porCuenta) {
    const c = claseCuenta(codigo);
    if (c === "deudores") credito -= neto;
    else if (c === "tecnica" || neto <= 0) continue;
    else if (c === "dinero") dinero += neto;
    else if (c === "retencion") ret += neto;
    else aj += neto;
  }
  if (!(credito > 0)) return { credito: 0, dinero: 0, retenciones: 0, ajustes: 0 };
  const tot = dinero + ret + aj;
  if (!(tot > 0)) return { credito, dinero: 0, retenciones: 0, ajustes: credito };
  return { credito, dinero: (credito * dinero) / tot, retenciones: (credito * ret) / tot, ajustes: (credito * aj) / tot };
}

export type Medio = "transferencia" | "cheques" | "efectivo" | "otro";

/** El medio de cobro sale del diario del asiento. */
export function medioDeDiario(nombre: string, tipo: string | null | undefined): Medio {
  if (/CHEQUE/.test(normalizar(nombre))) return "cheques";
  if (tipo === "bank") return "transferencia";
  if (tipo === "cash") return "efectivo";
  return "otro";
}

/** Promedio ponderado (días reales de cobro, indicador 12). null si no hay peso. */
export function promedioPonderado(items: readonly { valor: number; peso: number }[]): number | null {
  let p = 0;
  let s = 0;
  for (const i of items) {
    if (!Number.isFinite(i.valor) || !(i.peso > 0)) continue;
    p += i.peso;
    s += i.valor * i.peso;
  }
  return p > 0 ? s / p : null;
}

/** Meses 'AAAA-MM' desde `desde` hasta `hasta` inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = desde.slice(0, 7).split("-").map(Number);
  const fin = hasta.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    if (ym > fin) break;
    out.push(ym);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export type CambioSector = { partnerId: number; sector: "publico" | "privado" | "regla" };

/**
 * Aplica lo que se marcó a mano en "¿Quién es del Estado?" sobre la configuración guardada
 * (sin perder lo de clientes que hoy no tienen saldo). "regla" = sacar la excepción.
 */
export function aplicarCambiosSector(cfg: ConfigCobranzas, cambios: readonly CambioSector[]): ConfigCobranzas {
  const publicos = new Set(cfg.publicos);
  const privados = new Set(cfg.privados);
  for (const c of cambios) {
    publicos.delete(c.partnerId);
    privados.delete(c.partnerId);
    if (c.sector === "publico") publicos.add(c.partnerId);
    if (c.sector === "privado") privados.add(c.partnerId);
  }
  return { ...cfg, publicos: [...publicos].sort((a, b) => a - b), privados: [...privados].sort((a, b) => a - b) };
}
