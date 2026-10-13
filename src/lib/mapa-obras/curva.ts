// Fechas del mapa de obras en hora argentina, y la curva de obras en la calle del histórico.
//
// PURO y con tests (curva.test.ts).
//
// POR QUÉ LA HORA ARGENTINA: los `datetime` de Odoo vienen en UTC ("2026-03-24 22:33:05").
// El código anterior les pegaba una "Z" y contaba días desde ahí, y un armado cargado a las
// 22 h de Buenos Aires (01 h UTC del día siguiente) quedaba un día corrido. Acá todo se pasa
// primero a la fecha de Buenos Aires y recién después se cuenta.

import type { EstadoObra, PuntoCurva } from "./tipos.ts";

const ZONA = "America/Argentina/Buenos_Aires";
const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA });

/** La fecha de la importación masiva: muchas ventas tienen ésta como fecha de armado. */
export const FECHA_IMPORTACION = "2026-03-24";

/** Hoy en Buenos Aires, "YYYY-MM-DD". */
export function hoyAr(ahora: Date = new Date()): string {
  return formatoDia.format(ahora);
}

/**
 * Un valor de Odoo como fecha argentina "YYYY-MM-DD".
 *  · `date` ("2026-10-01"): ya es un día calendario, va tal cual.
 *  · `datetime` ("2026-03-24 22:33:05", en UTC): se convierte a Buenos Aires.
 *  · false / vacío / basura: null.
 */
export function fechaAr(valor: string | false | null | undefined): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const v = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}Z`);
  return Number.isNaN(d.getTime()) ? null : formatoDia.format(d);
}

/** Días calendario de `desde` a `hasta` (YYYY-MM-DD). Negativo si `hasta` es antes. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

/** "2026-03-24" + n días. */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lo que la curva necesita de cada obra (ObraMapa lo cumple). */
export type ObraEnCurva = { estado: EstadoObra; fechaArmado: string | null; fechaDesarme: string | null };

/** ¿La obra estaba armada ese día? Armada ese día o antes y, si se desarmó, después. */
export function enLaCalleEl(o: ObraEnCurva, fecha: string): boolean {
  if (!o.fechaArmado || o.fechaArmado > fecha) return false;
  if (o.estado !== "desarmada") return true;
  // Una desarmada sin fecha de desarme no se sabe hasta cuándo estuvo: contarla siempre
  // inflaría todo el histórico, así que no cuenta (83 de 371 al 12/10/2026).
  return o.fechaDesarme != null && o.fechaDesarme > fecha;
}

/**
 * Cuántas obras había en la calle cada semana, desde la importación (24/03/2026, desde ahí
 * las fechas de Odoo son confiables) hasta hoy. Un punto por semana y el último es hoy,
 * aunque no caiga justo en una semana: la curva termina en lo que se ve en el mapa.
 */
export function curvaEnLaCalle(obras: ObraEnCurva[], hoy: string, desde: string = FECHA_IMPORTACION): PuntoCurva[] {
  const fechas: string[] = [];
  for (let f = desde; f <= hoy; f = sumarDias(f, 7)) fechas.push(f);
  if (fechas.length && fechas[fechas.length - 1] !== hoy) fechas.push(hoy);
  return fechas.map((fecha) => ({ fecha, enLaCalle: obras.filter((o) => enLaCalleEl(o, fecha)).length }));
}
