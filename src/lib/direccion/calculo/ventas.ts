// Calculador de Ventas (/direccion/ventas?g=&p=&vs=). DUEÑO: quien construye Ventas.
//
// Qué calcula: facturado neto por fecha de factura (USD al dólar de cada factura) en el
// período elegido y su comparación (a igual día / promedio 6 meses), NC reales y
// refacturadas, qué facturamos (nuevo / renovación / anticipos / servicios), lo comercial que
// pide acción, "Vendido según Odoo" y ¿Ganamos? (resultado por rubro y mes, sin el mes en
// curso en los cocientes).
//
// Las lecturas de Odoo (ventas-datos.ts) no dependen del período: se cachean aparte por día
// (10 min, tag direccion:ventas) y cambiar de período sólo rearma (ventas-armar.ts), sin
// volver a Odoo. Las comparten los desgloses (desglose/ventas.ts) y La semana (resumenVentas).

import { cachePantalla } from "../cache.ts";
import { leerSerieDolar, tcHoy } from "../dolar.ts";
import { EscrituraProhibidaError } from "../odoo-lectura.ts";
import type { Cifra } from "../tipos.ts";
import { definirCalculador, type CtxCalculo } from "./contrato.ts";
import { armarResumen, armarVentas, type DetalleVentas, type Parte, type ResumenVentas } from "./ventas-armar.ts";
import { leerComercial, leerComposicion, leerFacturas, leerResultado, type BaseFacturas } from "./ventas-datos.ts";

export type { DetalleVentas, ResumenVentas } from "./ventas-armar.ts";

// ─── Lecturas cacheadas (clave: el día) ─────────────────────────────────────────────────
// La serie del dólar se lee adentro (y no se pasa como argumento) para que la clave de la
// caché sea sólo el día.

export const baseFacturas = cachePantalla("ventas", "ventas:facturas", async (hoy: string) => leerFacturas(hoy, await leerSerieDolar(hoy)));

export const baseComposicion = cachePantalla("ventas", "ventas:composicion", async (hoy: string) => {
  const [dolar, f] = await Promise.all([leerSerieDolar(hoy), baseFacturas(hoy)]);
  return leerComposicion(hoy, dolar, f.docs);
});

export const baseResultado = cachePantalla("ventas", "ventas:resultado", (hoy: string) => leerResultado(hoy));

export const baseComercial = cachePantalla("ventas", "ventas:comercial", (hoy: string) => leerComercial(hoy));

/** Una lectura secundaria: si falla, esa parte queda "Sin dato" (no tumba la pantalla). */
async function parte<T>(p: Promise<T>, que: string): Promise<Parte<T>> {
  try {
    return { ok: true, datos: await p };
  } catch (e) {
    if (e instanceof EscrituraProhibidaError) throw e;
    console.error(`[direccion] ventas: ${que}:`, e instanceof Error ? e.message : e);
    return { ok: false, motivo: `No pudimos leer ${que} de Odoo` };
  }
}

/** "Abono mensual en la calle": lo calcula En la calle. Si todavía no está, sin dato. */
async function abonoDeCalle(ctx: CtxCalculo): Promise<Parte<Cifra>> {
  try {
    const calle = await ctx.pantalla("calle");
    const c = calle.cifras.find((x) => x.kpi === "abono_vigente");
    return c ? { ok: true, datos: c } : { ok: false, motivo: "Lo calcula En la calle y todavía no está disponible" };
  } catch (e) {
    if (e instanceof EscrituraProhibidaError) throw e;
    return { ok: false, motivo: "No pudimos leer En la calle" };
  }
}

export const calculador = definirCalculador<DetalleVentas>({
  pantalla: "ventas",
  async calcular(ctx) {
    // Las facturas son la base de todo: si Odoo no responde, que tire (snapshot + banda).
    const facturas: BaseFacturas = await baseFacturas(ctx.hoy);
    const [composicion, resultado, comercial, abono] = await Promise.all([
      parte(baseComposicion(ctx.hoy), "los renglones de las facturas"),
      parte(baseResultado(ctx.hoy), "la contabilidad del resultado"),
      parte(baseComercial(ctx.hoy), "las cotizaciones y el CRM"),
      abonoDeCalle(ctx),
    ]);
    return armarVentas({ hoy: ctx.hoy, params: ctx.params, dolar: ctx.dolar, tc: ctx.tc, facturas, composicion, resultado, comercial, abono });
  },
});

/**
 * Lo que La semana necesita de Ventas, calculado en vivo con las mismas lecturas cacheadas
 * de esta pantalla (no relee Odoo si Ventas ya se calculó en los últimos 10 minutos).
 *
 *   const v = await resumenVentas(ctx);
 *   v.facturadoMes        → tarjeta "¿Facturamos?" (Cifra; comparación a igual día, en USD)
 *   v.comparacionArs      → la misma comparación en pesos (para el toggle de moneda)
 *   v.sinMayorCliente     → "▲ 18 % sin <cliente>" (null si sacarlo no cambia la lectura)
 *   v.serie               → sparkline de 12 meses (el último, en curso)
 *   v.nc                  → "NC: x % de lo facturado" (reales y brutas)
 *   v.resultado, v.margen → tarjeta "¿Ganamos?" (último mes cerrado; margen vs el anterior, en gris)
 *   v.oraciones           → la oración fija de facturación de la narrativa (id "fact")
 *   v.decisiones          → "¿Qué vida útil acordamos?" (amortización de andamios), si aplica
 *   v.avisos              → calidad: IIBB sin devengar, sin amortización, cuadres 888888
 *
 * Nada de esto es reservado. Tira OdooError si no se pudieron leer las facturas (como un
 * calculador); si falla sólo la contabilidad, `resultado` es null.
 */
export async function resumenVentas(ctx: Pick<CtxCalculo, "hoy" | "dolar" | "tc">): Promise<ResumenVentas> {
  const facturas = await baseFacturas(ctx.hoy);
  const resultado = await parte(baseResultado(ctx.hoy), "la contabilidad del resultado");
  return armarResumen({ hoy: ctx.hoy, dolar: ctx.dolar, tc: ctx.tc ?? tcHoy(ctx.dolar, ctx.hoy), facturas, resultado });
}
