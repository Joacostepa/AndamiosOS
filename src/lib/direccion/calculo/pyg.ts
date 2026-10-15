// Lectura del resultado mensual desde Odoo (sólo lectura: un read_group por cuenta y mes).
// Lo usan Socios y Calidad; la lógica pura está en pyg-reglas.ts.

import { readGroup } from "../odoo-lectura.ts";
import { codigoDeCuenta, mesDeGrupo, resultadoPorMes, TIPOS_RESULTADO, type FilaPyg, type MesPyg } from "./pyg-reglas.ts";

/** Resultado por mes desde `desde` ('AAAA-MM-DD') hasta `hasta` inclusive. */
export async function leerResultadoMensual(desde: string, hasta: string): Promise<Record<string, MesPyg>> {
  const grupos = await readGroup<Record<string, unknown>>(
    "account.move.line",
    [["parent_state", "=", "posted"], ["date", ">=", desde], ["date", "<=", hasta], ["account_id.account_type", "in", [...TIPOS_RESULTADO]]],
    ["balance:sum"],
    ["account_id", "date:month"],
  );
  const filas: FilaPyg[] = [];
  for (const g of grupos) {
    const mes = mesDeGrupo(g);
    const codigo = codigoDeCuenta(g.account_id);
    if (!mes || !codigo) continue;
    filas.push({ codigo, mes, balance: Number(g.balance) || 0 });
  }
  return resultadoPorMes(filas);
}
