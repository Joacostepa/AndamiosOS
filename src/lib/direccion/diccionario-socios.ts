// La definición completa de los indicadores reservados a socios (hoy, Retiros).
//
// NO lo importa ningún componente de cliente (lo controla guardia.test.ts): el servidor lo lee
// en el layout de Dirección y lo pasa al DireccionProvider SÓLO si quien mira tiene
// direccion-socios. Así, el código que baja el navegador no trae qué cuentas y qué método se
// usan para los retiros (diccionario.ts tiene sólo el nombre y la marca `reservado`).

import { DEF, type DefIndicador } from "./diccionario.ts";

const COMPLETAS: Record<string, Pick<DefIndicador, "para" | "calc" | "fuente" | "regla" | "motivo" | "ojo">> = {
  retiros: {
    para: "Cuánto se llevó cada socio, neto de lo que devolvió o compensó, más los dividendos pagados.",
    calc: "Cuentas particulares en pesos (sin los asientos de dolarización) + retiros en dólares cargados como gasto (4.2.1.04.19) + dividendos pagados. En USD, cada movimiento al dólar de su fecha.",
    fuente: "account.move.line · cuentas 1775/1776, 1803, 1667, 1791/1792, 1608",
    regla: "USD · dólar de cada movimiento",
    motivo: "Meses sin pasar a dólares en Odoo",
    ojo: "Puede haber pagos de Ganancias personales sin conciliar en el banco que todavía no son retiro, y saldo sin asignar en la cuenta 1608.",
  },
};

/** Las definiciones reservadas, completas (para socios). */
export function definicionesReservadas(): Record<string, DefIndicador> {
  return Object.fromEntries(Object.entries(COMPLETAS).filter(([id]) => DEF[id]).map(([id, c]) => [id, { ...DEF[id], ...c }]));
}
