// Qué parámetros de la URL cambian el cálculo de cada pantalla. El resto se ignora: no
// ensucia la clave de caché ni deja que un link raro dispare cálculos nuevos contra Odoo.
// (La moneda NO está acá: se formatea en el cliente, no cambia el cálculo.)

import type { PantallaId } from "./tipos.ts";
import { hoyBA } from "./formato.ts";
import { paramsDePeriodo, periodoDeParams } from "./calculo/ventas-reglas.ts";

export const PARAMS_PANTALLA: Partial<Record<PantallaId, readonly string[]>> = {
  // §7.2: ?g=mes&p=2026-10&vs=anterior (y desde/hasta para "Personalizado").
  ventas: ["g", "p", "vs", "desde", "hasta"],
};

type Fuente = URLSearchParams | Record<string, string | string[] | undefined>;

export function paramsDe(p: PantallaId, q: Fuente, hoy: string = hoyBA()): Record<string, string> {
  const leer = (k: string): string | undefined => {
    if (q instanceof URLSearchParams) return q.get(k) ?? undefined;
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const salida: Record<string, string> = {};
  for (const k of PARAMS_PANTALLA[p] ?? []) {
    const v = leer(k);
    if (v && /^[\w:-]{1,20}$/.test(v)) salida[k] = v;
  }
  return p === "ventas" ? canonicoVentas(salida, hoy) : salida;
}

/**
 * El período de Ventas en su forma única: cualquier variante (un `p` mal formado, un `vs`
 * que no aplica, un mes futuro) cae en el mismo período válido, así cada período es UNA
 * entrada de caché y no una lectura nueva a Odoo por cada link raro. La vista por defecto
 * (mes en curso vs anterior) queda sin parámetros: es la que guarda el snapshot.
 */
export function canonicoVentas(params: Record<string, string>, hoy: string): Record<string, string> {
  const { per, vs } = periodoDeParams(params, hoy);
  const c = paramsDePeriodo(per, vs);
  const def = periodoDeParams({}, hoy);
  return JSON.stringify(c) === JSON.stringify(paramsDePeriodo(def.per, def.vs)) ? {} : c;
}
