// Totales de un presupuesto: subtotal, IVA, total, canon locativo y renovación.
//
// REGLA DURA (criterio §4.1): la renovación se calcula SOLO sobre el canon locativo, nunca
// sobre el subtotal. Quedan afuera los ítems de única vez (ingeniería, S&H, gestoría, flete,
// viáticos, mano de obra, venta). Y con bonificación, sobre el valor de LISTA (§4.6).
//
// La skill vieja detectaba "única vez" buscando palabras en la descripción; acá cada línea lo
// trae marcado desde el producto, así un flete escondido en el subtotal no se cuela.

import { alPeso, type Linea } from "./tipos.ts";
import { enLetras } from "./letras.ts";

export type Totales = {
  /** Suma de las líneas base: lo que va en la oferta y en `amount_untaxed` de Odoo. */
  subtotal: number;
  iva: number;
  total: number;
  /** Base de la renovación: líneas base que no son de única vez, a valor de lista. */
  canonLocativo: number;
  renovacion: { pct: number; base: number; monto: number } | null;
  adicionales: number;
  opcionales: number;
  manoDeObra: number;
  /** Peso de la mano de obra (y viáticos) sobre el subtotal, en %. null sin subtotal. */
  pesoManoDeObraPct: number | null;
  subtotalEnLetras: string;
};

export function calcularTotales(
  lineas: Linea[],
  opciones: { ivaPct: number; renovacionPct: number | null; renovacionBase?: number | null },
): Totales {
  const base = lineas.filter((l) => l.seccion === "base");
  const subtotal = base.reduce((a, l) => a + l.importe, 0);
  const iva = alPeso((subtotal * opciones.ivaPct) / 100);
  const canonLocativo = base.filter((l) => !l.unicaVez).reduce((a, l) => a + l.importeLista, 0);
  const manoDeObra = base.filter((l) => l.esManoDeObra || l.id === "viaticos").reduce((a, l) => a + l.importe, 0);

  let renovacion: Totales["renovacion"] = null;
  if (opciones.renovacionPct !== null && opciones.renovacionPct > 0) {
    const b = opciones.renovacionBase ?? canonLocativo;
    renovacion = { pct: opciones.renovacionPct, base: b, monto: alPeso((b * opciones.renovacionPct) / 100) };
  }

  return {
    subtotal,
    iva,
    total: subtotal + iva,
    canonLocativo,
    renovacion,
    adicionales: lineas.filter((l) => l.seccion === "adicional").reduce((a, l) => a + l.importe, 0),
    opcionales: lineas.filter((l) => l.seccion === "opcional").reduce((a, l) => a + l.importe, 0),
    manoDeObra,
    pesoManoDeObraPct: subtotal > 0 ? Math.round((manoDeObra / subtotal) * 1000) / 10 : null,
    subtotalEnLetras: enLetras(subtotal),
  };
}
