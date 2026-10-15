// El dólar de Dirección: la cotización diaria de Odoo (`res.currency.rate`, moneda USD,
// campo `inverse_company_rate` = pesos por dólar, `name` = fecha). Es la misma que usa el
// cron "Recalcular montos en USD" de Odoo y la que la empresa usa como CCL.
//
// REGLAS (diseno.md §3.4):
//  · Saldos → dólar de HOY (la última cotización con fecha <= hoy).
//  · Flujos de un período → cada documento al dólar de SU fecha (última cotización <= fecha).
//  · Nunca x_residual_usd ni x_monto_usd de Odoo (están rotos o congelados).
//  · Si no hay cotización para una fecha (anterior a la primera), es "Sin dato": no se inventa.
//
// La serie entera son ~1 fila por día desde nov-2025: se lee una vez y se cachea
// (servidor.ts → obtenerSerieDolar, tag "direccion:dolar"). Las búsquedas son puras.

import { searchRead } from "./odoo-lectura.ts";
import type { TcDia } from "./tipos.ts";

/** Serie ordenada por fecha ascendente. */
export type SerieDolar = TcDia[];

/** Lee de Odoo toda la serie del USD hasta `hasta` inclusive (sólo lectura). */
export async function leerSerieDolar(hasta?: string): Promise<SerieDolar> {
  const filas = await searchRead<{ name: string; inverse_company_rate: number }>(
    "res.currency.rate",
    [["currency_id.name", "=", "USD"], ...(hasta ? [["name", "<=", hasta]] : [])],
    ["name", "inverse_company_rate"],
    { order: "name asc", limit: 5000 },
  );
  return normalizarSerie(filas.map((f) => ({ fecha: String(f.name).slice(0, 10), valor: Number(f.inverse_company_rate) })));
}

/** Ordena, descarta cotizaciones inválidas y deja una por fecha (la última leída). */
export function normalizarSerie(filas: TcDia[]): SerieDolar {
  const porFecha = new Map<string, number>();
  for (const f of filas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) || !Number.isFinite(f.valor) || f.valor <= 0) continue;
    porFecha.set(f.fecha, f.valor);
  }
  return [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, valor]) => ({ fecha, valor }));
}

/** La cotización vigente en una fecha: la última con fecha <= `fecha`. null si no hay. */
export function tcEn(serie: SerieDolar, fecha: string): TcDia | null {
  let lo = 0;
  let hi = serie.length - 1;
  let mejor = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (serie[mid].fecha <= fecha) { mejor = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return mejor >= 0 ? serie[mejor] : null;
}

/** El dólar de hoy (con su fecha: se muestra siempre al lado). */
export const tcHoy = (serie: SerieDolar, hoy: string): TcDia | null => tcEn(serie, hoy);

/** Pesos → dólares al TC de una fecha. null si no hay cotización. */
export function aUsd(serie: SerieDolar, ars: number, fecha: string): number | null {
  const tc = tcEn(serie, fecha);
  return tc ? ars / tc.valor : null;
}

/** Dólar promedio de un mes 'AAAA-MM' (promedio simple de las cotizaciones del mes). */
export function tcPromedioMes(serie: SerieDolar, ym: string): number | null {
  const del = serie.filter((t) => t.fecha.startsWith(ym));
  return del.length ? del.reduce((a, t) => a + t.valor, 0) / del.length : null;
}
