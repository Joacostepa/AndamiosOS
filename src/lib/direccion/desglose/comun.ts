// Nodos comunes a todo el sector. Sirven también de EJEMPLO del contrato.
//
// "dolar": las cotizaciones del USD que usa Dirección (las de Odoo), de la más nueva a la
// más vieja, paginadas. Lo abre el "Dólar 1.617,30" del encabezado.

import { fcorta, flarga, fdia, nf } from "../formato.ts";
import { definirNodo, paginar, type DefNodo } from "./contrato.ts";

const dolar = definirNodo({
  tipo: "dolar",
  pantalla: "semana",
  async resolver(_ref, ctx) {
    const serie = [...ctx.dolar].reverse();
    if (!ctx.tc || serie.length === 0) {
      return { titulo: "Dólar de Odoo", cifra: { tipo: "sin_dato", motivo: "Odoo no tiene cotizaciones del dólar" }, secciones: [] };
    }
    const { filas, pagina } = paginar(serie, ctx.pagina);
    return {
      titulo: "Dólar de Odoo",
      cifra: { tipo: "texto", texto: nf(ctx.tc.valor, 2) },
      sub: `Cotización del ${flarga(ctx.tc.fecha)} · pesos por dólar · res.currency.rate`,
      secciones: [
        {
          titulo: "Cotizaciones",
          filas: filas.map((t, i) => {
            const anterior = serie[(pagina.actual - 1) * 50 + i + 1];
            const delta = anterior ? (t.valor / anterior.valor - 1) * 100 : null;
            return {
              id: t.fecha,
              titulo: fdia(t.fecha),
              sub: delta == null ? undefined : `${delta >= 0 ? "▲" : "▼"} ${nf(Math.abs(delta), 2)} % vs ${fcorta(anterior!.fecha)}`,
              valor: { tipo: "texto", texto: nf(t.valor, 2) },
            };
          }),
          nota: "Saldos: al dólar de hoy. Facturas y movimientos: al dólar de su fecha (la última cotización anterior o igual).",
        },
      ],
      pagina,
    };
  },
});

export const nodos: DefNodo[] = [dolar];
