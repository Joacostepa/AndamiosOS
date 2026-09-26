// Venta de material — sólo el cálculo de referencia.
//
// Criterio §2.4: SIEMPRE se pregunta con qué plazo se amortiza (36 meses de canon, 24 meses
// —equivalente a la lista propia en USD— u otro); no hay default. Acá se calcula el precio
// derivado del canon de lista (sin el recargo del alquiler) por la cantidad de meses elegida.
//
// NO arma la línea de Odoo: la tabla de productos no tiene uno de "venta de material" y la
// regla es no inventar productos. El resultado se usa para conversar el número; la línea la
// define Joaquín (qué producto de Odoo corresponde).

import { alPeso, numero, pesos, type Resultado, type Tarifas } from "./tipos.ts";
import type { PiezaDeLista } from "./alquiler.ts";

export type EntradaVenta = {
  piezas: { codigo: string; cantidad: number }[];
  /** "A" / "B" (meses de Parámetros) o un número de meses que haya dicho Joaquín. */
  amortizacion: "A" | "B" | number;
};

export function cotizarVentaMaterial(
  e: EntradaVenta,
  lista: { id: string; piezas: PiezaDeLista[] },
  t: Tarifas,
): Resultado<{ meses: number; canonMensual: number; precioVenta: number }> {
  const meses = e.amortizacion === "A" ? t.venta.amortizacionAMeses : e.amortizacion === "B" ? t.venta.amortizacionBMeses : e.amortizacion;
  const porCodigo = new Map(lista.piezas.map((p) => [p.codigo, p]));
  const avisos: Resultado["avisos"] = [];
  let canon = 0;
  for (const p of e.piezas) {
    const pieza = porCodigo.get(p.codigo);
    if (!pieza) {
      avisos.push({ nivel: "bloqueo", codigo: "pieza_inexistente", texto: `El código ${p.codigo} no está en la lista ${lista.id}.` });
      continue;
    }
    canon += pieza.precio * p.cantidad;
  }
  const precioVenta = alPeso(canon * meses);
  avisos.push({
    nivel: "advertencia",
    codigo: "venta_sin_producto",
    texto: `Precio de referencia: canon de lista ${pesos(canon)} × ${numero(meses, 0)} meses = ${pesos(precioVenta)}. No hay producto de Odoo para venta de material: Joaquín define con cuál se carga. Dejá escrito en la nota de la orden el plazo usado.`,
  });
  return { lineas: [], avisos, pendientes: [], detalle: { meses, canonMensual: alPeso(canon), precioVenta } };
}
