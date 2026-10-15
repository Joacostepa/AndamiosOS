// Resultado mensual (P&L) a partir de un read_group de Odoo por cuenta y mes. PURO (sin
// Odoo): lo usan Socios (retiros / resultado) y Calidad (mes cerrado sin Ingresos Brutos,
// cuenta de cuadre). Fuente: finanzas_definiciones.md §6.
//
//  · Signo: −balance (ingreso positivo, gasto negativo).
//  · Resultado de gestión = todo ingreso y gasto MENOS los ajustes excluidos: cuadre 888888,
//    retiros cargados como gasto (4.2.1.04.19) y los circuitos especiales (4.2.1.05.08,
//    4.2.1.03.27, 4.1.1.03.08). Es lo mismo que margen − estructura + financiero.
//  · En USD: pesos del mes ÷ dólar promedio del mes (lo hace quien llama, con tcPromedioMes).

/** Cuentas que no son resultado de la operación (finanzas_definiciones.md §6, "Ajustes excluidos"). */
export const CUENTAS_AJUSTE = ["888888", "4.2.1.04.19", "4.2.1.05.08", "4.2.1.03.27", "4.1.1.03.08"] as const;
/** Ingresos Brutos (gasto). */
export const CUENTA_IIBB = "4.2.1.07.03";
/** Cuenta de cuadre. */
export const CUENTA_CUADRE = "888888";

/** Tipos de cuenta de resultados en Odoo. */
export const TIPOS_RESULTADO = ["income", "income_other", "expense", "expense_depreciation", "expense_direct_cost"] as const;

/** Una fila del read_group (cuenta × mes), ya normalizada. */
export type FilaPyg = { codigo: string; mes: string; balance: number };

export type MesPyg = {
  mes: string;
  /** Resultado de gestión en pesos (−balance sin ajustes). */
  gestion: number;
  /** Ingresos de la operación (4.1.*, sin circuitos especiales). */
  ingresos: number;
  /** Ingresos Brutos devengados (gasto, en positivo). */
  iibb: number;
  /** Cuenta de cuadre 888888 (gasto en positivo). */
  cuadre: number;
};

/** El código de cuenta de un many2one de Odoo ("1.1.4.02.09 Accionistas …" → "1.1.4.02.09"). */
export function codigoDeCuenta(m2o: unknown): string {
  if (!Array.isArray(m2o) || typeof m2o[1] !== "string") return "";
  return m2o[1].trim().split(/\s+/)[0] ?? "";
}

/** 'AAAA-MM' del grupo de un read_group por date:month (usa __range, que no depende del idioma). */
export function mesDeGrupo(fila: Record<string, unknown>, campo = "date:month"): string | null {
  const rango = (fila.__range as Record<string, { from?: string }> | undefined)?.[campo];
  const desde = rango?.from;
  return typeof desde === "string" && /^\d{4}-\d{2}/.test(desde) ? desde.slice(0, 7) : null;
}

/** Agrupa las filas por mes. Meses sin movimientos no aparecen (no se inventan ceros). */
export function resultadoPorMes(filas: readonly FilaPyg[]): Record<string, MesPyg> {
  const ajuste = new Set<string>(CUENTAS_AJUSTE);
  const salida: Record<string, MesPyg> = {};
  for (const f of filas) {
    if (!f.mes || !Number.isFinite(f.balance)) continue;
    const m = (salida[f.mes] ??= { mes: f.mes, gestion: 0, ingresos: 0, iibb: 0, cuadre: 0 });
    const v = -f.balance;
    if (f.codigo === CUENTA_CUADRE) m.cuadre += -v;
    if (f.codigo === CUENTA_IIBB) m.iibb += -v;
    if (ajuste.has(f.codigo)) continue;
    m.gestion += v;
    if (f.codigo.startsWith("4.1.")) m.ingresos += v;
  }
  return salida;
}

/**
 * ¿Le falta el IIBB a este mes? UNA regla para Ventas y Calidad. `previos` = el IIBB de los
 * meses anteriores, en orden; se toman los hasta 3 últimos con IIBB. Falta si el del mes es
 * menos del 20 % de su promedio. Devuelve ese promedio (el estimado de lo que falta) o null.
 */
export function iibbFaltante(previos: readonly number[], actual: number): number | null {
  const con = previos.filter((v) => v > 0).slice(-3);
  if (!con.length) return null;
  const promedio = con.reduce((a, v) => a + v, 0) / con.length;
  return actual < promedio * 0.2 ? promedio : null;
}
