// Formato de Dirección: montos, unidades, chips, marcas de confianza y fechas.
//
// Una sola fuente para servidor y cliente (sin imports de Next ni de React). Porta las
// funciones de la maqueta (docs/direccion/maqueta.html §2 y "Piezas comunes") con dos
// cambios de la revisión: "s/d" se dice "Sin dato" y nunca se muestra 0 por un dato que falta.
//
// REGLAS (diseno.md §3 y §7.5):
//  · Período = sin IVA, en USD cada documento al dólar de su fecha (Monto.usd).
//  · Saldo = con IVA, en USD al dólar de hoy (Monto sin usd → ars / tcHoy).
//  · USD 422 k · USD 13,3 k · USD 1,56 M · ARS 682,3 M · ARS 5.039 M · ARS 450.000
//    (miles con ".", decimales con ","; ~3 cifras significativas).

import type { CierreDesglose, Comparacion, Confianza, Frase, Moneda, Monto, Regla, TcDia, Valor } from "./tipos.ts";

export const SIN_DATO = "Sin dato";

// ─── Números ───────────────────────────────────────────────────────────────────────────

export const nf = (n: number, d = 0): string =>
  Number(n).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** "34 %" · "Sin dato" si no es un número. */
export const pct = (n: number | null | undefined, d = 0): string =>
  n == null || !Number.isFinite(n) ? SIN_DATO : `${nf(n, d)} %`;

/** Un número en una moneda, abreviado como en la maqueta. null/NaN → "Sin dato". */
export function fmtMon(v: number | null | undefined, cur: Moneda): string {
  if (v == null || !Number.isFinite(v)) return SIN_DATO;
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  let t: string;
  if (cur === "USD") t = a >= 1e6 ? `${nf(a / 1e6, 2)} M` : a >= 1e5 ? `${nf(a / 1e3)} k` : a >= 1e3 ? `${nf(a / 1e3, 1)} k` : nf(a);
  else t = a >= 1e9 ? `${nf(a / 1e6)} M` : a >= 1e6 ? `${nf(a / 1e6, 1)} M` : nf(a);
  return `${cur} ${s}${t}`;
}

/** Contexto de formato del cliente: la moneda elegida y el dólar de hoy. */
export type CtxFormato = { moneda: Moneda; tc: TcDia | null };

/**
 * El monto en la moneda pedida, como número. Período: usa `usd` (dólar de cada documento).
 * Saldo (sin `usd`): ars ÷ dólar de hoy. Sin dólar de hoy → null (y se muestra "Sin dato").
 */
export function montoEn(m: Monto | null | undefined, moneda: Moneda, tc: TcDia | null): number | null {
  if (!m || m.ars == null || !Number.isFinite(m.ars)) return null;
  if (moneda === "ARS") return m.ars;
  if (m.usd != null && Number.isFinite(m.usd)) return m.usd;
  return tc && tc.valor > 0 ? m.ars / tc.valor : null;
}

/** Un monto formateado en la moneda elegida (la regla período/saldo la decide el Monto). */
export function mon(m: Monto | null | undefined, ctx: CtxFormato): string {
  return fmtMon(montoEn(m, ctx.moneda, ctx.tc), ctx.moneda);
}

/** La unidad + la regla, siempre visible debajo de la cifra (§3.7). */
export function unidad(regla: Regla, moneda: Moneda): string {
  const usd = moneda === "USD";
  switch (regla) {
    case "periodo": return `${moneda} · sin IVA${usd ? " · dólar de cada factura" : ""}`;
    case "saldo": return `${moneda} · con IVA${usd ? " · dólar de hoy" : ""}`;
    case "caja": return `${moneda} · saldo${usd ? " · dólar de hoy" : " · dólares billete al dólar de hoy"}`;
    case "foto": return `${moneda} · sin IVA · foto de hoy`;
    case "socios": return `${moneda} · ${usd ? "dólar de cada movimiento" : "pesos de cada mes"}`;
    case "resultado": return `${moneda} · sin IVA${usd ? " · dólar promedio del mes" : ""}`;
  }
}

/** Cualquier Valor como texto. Lo que falta dice "Sin dato" (el motivo va aparte). */
export function formatearValor(v: Valor, ctx: CtxFormato): string {
  switch (v.tipo) {
    case "monto": return mon(v.monto, ctx);
    case "cantidad": return v.unidad ? `${nf(v.n)} ${v.unidad}` : nf(v.n);
    case "pct": return pct(v.n, v.decimales ?? 0);
    case "dias": return `${nf(v.n)} ${v.n === 1 ? "día" : "días"}`;
    case "fecha": return `${v.prefijo ? `${v.prefijo} ` : ""}${fcorta(v.iso)}`;
    case "texto": return v.texto;
    case "sin_dato": return SIN_DATO;
  }
}

export const esSinDato = (v: Valor): v is { tipo: "sin_dato"; motivo: string } => v.tipo === "sin_dato";

// Atajos para armar valores en los calculadores.
export const sinDato = (motivo: string): Valor => ({ tipo: "sin_dato", motivo });
export const monto = (ars: number | null | undefined, usd?: number | null): Valor =>
  ars == null || !Number.isFinite(ars) ? sinDato("No se pudo calcular") : { tipo: "monto", monto: usd === undefined ? { ars } : { ars, usd } };

/** La frase en texto plano (para Compartir y para aria-label). */
export function fraseAPlano(frase: Frase, ctx: CtxFormato): string {
  return frase.map((p) => (typeof p === "string" ? p : formatearValor(p.valor, ctx))).join("");
}

// ─── Chips y marcas ────────────────────────────────────────────────────────────────────

export type TonoChip = "bien" | "mal" | "neutro" | "sd";
export type Chip = { tono: TonoChip; texto: string; titulo?: string };

/**
 * Chip de comparación (§4.4): ▲ 12 % a igual día sep. El color sale de la polaridad;
 * menos de 3 % es "≈" gris; sin dato, chip punteado con el motivo en el título.
 */
export function chip(c: Comparacion): Chip {
  const unidadC = c.unidad ?? "%";
  if (c.delta == null || !Number.isFinite(c.delta)) {
    return { tono: "sd", texto: `sin dato · ${c.base}`, titulo: c.motivo ?? c.base };
  }
  const a = Math.abs(c.delta);
  if (a < 3 && unidadC === "%") return { tono: "neutro", texto: `≈ ${c.base}` };
  const sube = c.delta > 0;
  const bien = c.polaridad === "↑" ? sube : c.polaridad === "↓" ? !sube : null;
  const cifra = nf(a, unidadC === "%" ? 0 : 1);
  return {
    tono: bien == null ? "neutro" : bien ? "bien" : "mal",
    texto: `${sube ? "▲" : "▼"} ${cifra} ${unidadC === "pp" ? "puntos" : "%"} ${c.base}`,
  };
}

export type Marca = { nivel: Confianza; icono: "✓" | "⚠" | "◐"; etiqueta: string; motivo?: string };

/** Marca de confianza (§6.4): ✓ Confiable · ⚠ A verificar · ◐ Incompleto. */
export function marca(nivel: Confianza, motivo?: string): Marca {
  const m = motivo?.trim() || undefined;
  if (nivel === "ok") return { nivel, icono: "✓", etiqueta: "Confiable", motivo: m };
  if (nivel === "ver") return { nivel, icono: "⚠", etiqueta: "A verificar", motivo: m };
  return { nivel, icono: "◐", etiqueta: "Incompleto", motivo: m };
}

/**
 * ¿Cierra la lista con la cifra? Tolerancia: 2 unidades o 0,05 % (redondeos).
 * Comparar SIEMPRE en la misma moneda (en USD, la suma de los USD de cada documento).
 */
export function estadoCierre(suma: number, cifra: number): { ok: boolean; diferencia: number } {
  const diferencia = cifra - suma;
  return { ok: Math.abs(diferencia) < Math.max(2, Math.abs(cifra) * 0.0005), diferencia };
}

/** El texto del control de cierre de un desglose, en la moneda elegida. */
export function textoCierre(c: CierreDesglose, ctx: CtxFormato): { ok: boolean; texto: string } {
  if ("nota" in c) return { ok: false, texto: c.nota };
  const s = montoEn(c.suma, ctx.moneda, ctx.tc);
  const k = montoEn(c.cifra, ctx.moneda, ctx.tc);
  if (s == null || k == null) return { ok: false, texto: `Total de la lista ${SIN_DATO.toLowerCase()}: falta el dólar.` };
  const e = estadoCierre(s, k);
  const quien = c.texto ?? "la cifra";
  if (e.ok) return { ok: true, texto: `Total ${fmtMon(s, ctx.moneda)} = ${quien} ✓` };
  return { ok: false, texto: `Total de la lista ${fmtMon(s, ctx.moneda)}; diferencia ${fmtMon(e.diferencia, ctx.moneda)}${c.explica ? `: ${c.explica}` : ""}.` };
}

// ─── Fechas (ISO sin zona: todo es día argentino) ───────────────────────────────────────

export const MES_NOM = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;
export const MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
export const DIA_C = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

const ZONA = "America/Argentina/Buenos_Aires";

/** Hoy en Buenos Aires, 'AAAA-MM-DD'. */
export function hoyBA(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** Hora de Buenos Aires 'HH:MM' de un instante. */
export function horaBA(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Día de Buenos Aires 'AAAA-MM-DD' de un instante. */
export const diaBA = (instante: string): string => hoyBA(new Date(instante));

/** "jue 15/10 04:30" de un instante (para "Datos de Odoo al…"). */
export const instanteCorto = (instante: string): string => `${fdia(diaBA(instante))} ${horaBA(instante)}`;

const dt = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const sumarDias = (s: string, n: number): string => { const d = dt(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const diasEntre = (a: string, b: string): number => Math.round((dt(b).getTime() - dt(a).getTime()) / 864e5);
export const fcorta = (s: string | null | undefined): string => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");
export const flarga = (s: string | null | undefined): string => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
export const diaSemana = (s: string): string => DIA_C[dt(s).getUTCDay()];
export const fdia = (s: string): string => `${diaSemana(s)} ${fcorta(s)}`;
/** Último día del mes 'AAAA-MM'. */
export const finMes = (ym: string): string => { const [y, m] = ym.split("-").map(Number); return iso(new Date(Date.UTC(y, m, 0, 12))); };
/** "oct-26". */
export const mesEtq = (ym: string): string => `${MES_C[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`;
/** "octubre" (en prosa, los meses van con el nombre completo). */
export const mesNombre = (ym: string): string => MES_NOM[Number(ym.slice(5, 7)) - 1];
/** Lunes de la semana de una fecha. */
export const lunesDe = (s: string): string => sumarDias(s, -((dt(s).getUTCDay() + 6) % 7));
/** "Semana del 12/10 al 18/10". */
export const textoSemana = (hoy: string): string => `Semana del ${fcorta(lunesDe(hoy))} al ${fcorta(sumarDias(lunesDe(hoy), 6))}`;

// ─── Nombres ───────────────────────────────────────────────────────────────────────────

/** "MINISTERIO DEL INTERIOR" → "Ministerio del Interior" (sólo si viene todo en mayúsculas). */
export function nombreLindo(s: string | null | undefined): string {
  if (!s) return "";
  const corto = s.split(",")[0].trim();
  if (corto !== corto.toUpperCase()) return corto;
  return corto
    .toLowerCase()
    .replace(/(^|\s|-|\.)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Del|De|La|Las|Los|Y|E)\b/g, (w) => w.toLowerCase())
    .replace(/\b(S\.?a|S\.r\.l|Srl|Sa)\b\.?/gi, (w) => w.toUpperCase());
}
