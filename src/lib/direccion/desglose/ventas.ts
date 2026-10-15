// Nodos de desglose de Ventas (§7.3: cifra → desglose → lista → Odoo).
//
//   facturado_neto  ?desde&hasta                    clientes del período (top 30 + resto) → factCliente
//   factCliente     ?v=<partner>&desde&hasta        comprobantes del cliente (nivel 2, CSV, ↗ Odoo)
//   pct_nc          ?desde&hasta                    NC reales y probables refacturaciones (↗ Odoo)
//   nueva_vs_renov  ?desde&hasta                    qué facturamos por tipo
//   resultado       ?mes | ?desde&hasta ('AAAA-MM') rubros → resultadoRubro (por defecto, el último mes cerrado)
//   resultadoRubro  ?rubro&desde&hasta              cuentas del rubro
//   vendido_ordenes ?desde&hasta                    órdenes confirmadas (lo que mira Odoo), con IVA
//   cotizado_vivo                                   cotizaciones vivas y lo que queda fuera
//
// Todos salen de las lecturas cacheadas de la pantalla (calculo/ventas.ts): no releen Odoo si
// la pantalla ya se calculó. Los ajustes excluidos del resultado (retiros cargados como
// gasto, circuitos especiales) son de socios: acá no se muestran.
//
// calculo/ventas.ts se importa en el momento (import dinámico): usa la caché de Next, y el
// registro de nodos lo cargan también los tests de node (desglose.test.ts).

import { tcPromedioMes } from "../dolar.ts";
import { flarga, fcorta, mesEtq, mesNombre, nf, nombreLindo, sinDato } from "../formato.ts";
import { VIDA_UTIL_REF_MESES, cuentasDeRubro, rubrosDe } from "../calculo/ventas-armar.ts";
import { INICIO_ODOO, RUBRO, armarResultado, composicion, mesesSinIibb, type RubroId } from "../calculo/ventas-reglas.ts";
import type { FilaDesglose, Monto, NodoRef, SeccionDesglose } from "../tipos.ts";
import { definirNodo, paginar, type DefNodo } from "./contrato.ts";

const lecturas = () => import("../calculo/ventas.ts");

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const suma = <T,>(xs: readonly T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
const m = (ars: number, usd?: number | null): Monto => (usd === undefined ? { ars } : { ars, usd });
const sumaMontos = (xs: readonly Monto[]): Monto => ({ ars: suma(xs, (x) => x.ars), usd: xs.some((x) => x.usd == null) ? null : suma(xs, (x) => x.usd) });

/** El rango del NodoRef (desde/hasta); por defecto, el mes en curso. Nunca después de hoy. */
export function rangoDe(ref: NodoRef, hoy: string): { desde: string; hasta: string; etq: string } {
  let desde = FECHA.test(ref.desde ?? "") ? ref.desde! : `${hoy.slice(0, 7)}-01`;
  let hasta = FECHA.test(ref.hasta ?? "") ? ref.hasta! : hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde < INICIO_ODOO) desde = INICIO_ODOO;
  if (hasta > hoy) hasta = hoy;
  return { desde, hasta, etq: `${flarga(desde)} → ${flarga(hasta)}` };
}

/** Meses 'AAAA-MM' del NodoRef (mes, o desde/hasta); por defecto, el último mes cerrado. */
export function mesesDe(ref: NodoRef, hoy: string, disponibles: readonly string[]): string[] {
  if (MES.test(ref.mes ?? "")) return disponibles.includes(ref.mes!) ? [ref.mes!] : [];
  const d = MES.test(ref.desde ?? "") ? ref.desde! : null;
  const h = MES.test(ref.hasta ?? "") ? ref.hasta! : null;
  if (d && h) return disponibles.filter((x) => x >= (d < h ? d : h) && x <= (d < h ? h : d));
  const cerrados = disponibles.filter((x) => x < hoy.slice(0, 7));
  return cerrados.length ? [cerrados[cerrados.length - 1]] : disponibles.slice(-1);
}

const etqMeses = (ms: readonly string[]) => (ms.length === 1 ? `${mesNombre(ms[0])} ${ms[0].slice(0, 4)}` : `${mesEtq(ms[0])} a ${mesEtq(ms[ms.length - 1])}`);

// ─── Facturado ──────────────────────────────────────────────────────────────────────────

const facturadoNeto = definirNodo({
  tipo: "facturado_neto",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const r = rangoDe(ref, ctx.hoy);
    const { docs, clientes } = await (await lecturas()).baseFacturas(ctx.hoy);
    const del = docs.filter((d) => d.fecha >= r.desde && d.fecha <= r.hasta);
    const porCli = new Map<number, { ars: number; usd: number; n: number }>();
    for (const d of del) {
      const x = porCli.get(d.cli) ?? { ars: 0, usd: 0, n: 0 };
      x.ars += d.ars; x.usd += d.usd ?? 0; x.n++;
      porCli.set(d.cli, x);
    }
    const total = m(suma(del, (d) => d.ars), suma(del, (d) => d.usd));
    const todas = [...porCli.entries()].sort((a, b) => b[1].ars - a[1].ars);
    const max = Math.max(1, ...todas.map(([, x]) => x.ars));
    const resto = todas.slice(30);
    const filas: FilaDesglose[] = todas.slice(0, 30).map(([cli, x]) => ({
      id: String(cli),
      titulo: nombreLindo(clientes[cli] ?? `Cliente ${cli}`),
      sub: `${x.n} comprobante${x.n === 1 ? "" : "s"}${total.ars ? ` · ${nf((x.ars / total.ars) * 100)} %` : ""}`,
      valor: { tipo: "monto", monto: m(x.ars, x.usd) },
      barra: Math.max(0, x.ars) / max,
      hijo: { tipo: "factCliente", v: String(cli), desde: r.desde, hasta: r.hasta },
    }));
    if (resto.length) {
      filas.push({ id: "resto", titulo: `Resto (${resto.length} clientes)`, valor: { tipo: "monto", monto: m(suma(resto, ([, x]) => x.ars), suma(resto, ([, x]) => x.usd)) }, atenuada: true });
    }
    return {
      titulo: `Facturado neto · ${r.etq}`,
      cifra: { tipo: "monto", monto: total },
      sub: `${del.length} comprobantes · ${porCli.size} clientes · sin IVA`,
      secciones: [{ filas, cierre: { suma: m(suma(todas, ([, x]) => x.ars), suma(todas, ([, x]) => x.usd)), cifra: total, texto: "la cifra de la tarjeta" } }],
    };
  },
});

const factCliente = definirNodo({
  tipo: "factCliente",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const r = rangoDe(ref, ctx.hoy);
    const cli = Number(ref.v);
    const { docs, clientes } = await (await lecturas()).baseFacturas(ctx.hoy);
    const del = docs.filter((d) => d.cli === cli && d.fecha >= r.desde && d.fecha <= r.hasta).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
    const total = m(suma(del, (d) => d.ars), suma(del, (d) => d.usd));
    const { filas, pagina } = paginar(del, ctx.pagina);
    return {
      titulo: nombreLindo(clientes[cli] ?? `Cliente ${ref.v ?? ""}`),
      cifra: del.length ? { tipo: "monto", monto: total } : sinDato("Sin comprobantes en el período"),
      sub: `${del.length} comprobantes · ${r.etq} · sin IVA`,
      csv: true,
      pagina,
      secciones: [{
        filas: filas.map((d) => ({
          id: String(d.id),
          titulo: d.nombre,
          sub: `${flarga(d.fecha)}${d.usd ? ` · dólar ${nf(d.ars / d.usd, 2)}` : d.usd == null ? " · sin dólar de su fecha" : ""}`,
          valor: { tipo: "monto", monto: m(d.ars, d.usd) },
          etiqueta: d.nc ? { texto: "NC", tono: "neutro" } : undefined,
          odoo: { modelo: "account.move", id: d.id },
        })),
        cierre: { suma: total, cifra: total, texto: "lo facturado al cliente" },
      }],
    };
  },
});

// ─── Notas de crédito ───────────────────────────────────────────────────────────────────

const notasCredito = definirNodo({
  tipo: "pct_nc",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const r = rangoDe(ref, ctx.hoy);
    const { docs, clientes, refact } = await (await lecturas()).baseFacturas(ctx.hoy);
    const reemplazo = new Map(refact);
    const porId = new Map(docs.map((d) => [d.id, d]));
    const del = docs.filter((d) => d.fecha >= r.desde && d.fecha <= r.hasta);
    const bruto = suma(del.filter((d) => !d.nc), (d) => d.ars);
    const ncs = del.filter((d) => d.nc).sort((a, b) => a.ars - b.ars);
    const reales = ncs.filter((d) => !reemplazo.has(d.id));
    const re = ncs.filter((d) => reemplazo.has(d.id));
    const anulado = (xs: typeof ncs) => m(-suma(xs, (d) => d.ars), -suma(xs, (d) => d.usd));
    const fila = (d: (typeof ncs)[number]): FilaDesglose => {
      const f = porId.get(reemplazo.get(d.id) ?? -1);
      return {
        id: String(d.id),
        titulo: d.nombre,
        sub: `${flarga(d.fecha)} · ${nombreLindo(clientes[d.cli] ?? "")}${f ? ` · la reemplaza ${f.nombre} del ${fcorta(f.fecha)}` : ""}`,
        valor: { tipo: "monto", monto: m(-d.ars, d.usd == null ? null : -d.usd) },
        odoo: { modelo: "account.move", id: d.id },
      };
    };
    const pr = paginar(reales, ctx.pagina);
    const pe = paginar(re, ctx.pagina);
    const secciones: SeccionDesglose[] = [
      { titulo: "No se refacturaron (reales)", filas: pr.filas.map(fila), cierre: { suma: anulado(reales), cifra: anulado(reales), texto: "las notas de crédito reales" } },
      { titulo: "Probable refacturación", filas: pe.filas.map(fila), cierre: { suma: anulado(re), cifra: anulado(re), texto: "las refacturadas" }, nota: "Mismo cliente, ±15 % del monto, factura nueva dentro de 10 días: no se perdió plata." },
    ];
    return {
      titulo: `Notas de crédito · ${r.etq}`,
      cifra: bruto > 0 ? { tipo: "pct", n: (-suma(reales, (d) => d.ars) / bruto) * 100, decimales: 1 } : sinDato("No hubo facturas en el período"),
      sub: `${ncs.length} notas de crédito · ${reales.length} sin refacturar · % sobre lo facturado bruto, sin IVA`,
      csv: true,
      pagina: pr.pagina.total >= pe.pagina.total ? pr.pagina : pe.pagina,
      secciones,
    };
  },
});

// ─── Qué facturamos ─────────────────────────────────────────────────────────────────────

const nuevaVsRenov = definirNodo({
  tipo: "nueva_vs_renov",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const r = rangoDe(ref, ctx.hoy);
    const V = await lecturas();
    const [comp, { docs }] = await Promise.all([V.baseComposicion(ctx.hoy), V.baseFacturas(ctx.hoy)]);
    const filas = composicion(comp.filas, r.desde, r.hasta);
    const tot = suma(filas, (x) => x.ars);
    const del = docs.filter((d) => d.fecha >= r.desde && d.fecha <= r.hasta);
    const ren = filas.find((x) => x.tipo === "renovacion");
    const max = Math.max(1, ...filas.map((x) => x.ars));
    return {
      titulo: `Qué facturamos · ${r.etq}`,
      cifra: tot > 0 ? { tipo: "pct", n: ((ren?.ars ?? 0) / tot) * 100 } : sinDato("No hubo facturación en el período"),
      sub: "renovaciones sobre lo facturado · renglones de factura, sin IVA",
      avisos: [{ texto: "Los anticipos no se pueden separar entre nuevo y renovación. Los productos no tienen categoría en Odoo: la clasificación es por nombre.", tono: "gris" }],
      secciones: [{
        filas: filas.map((x) => ({
          id: x.tipo,
          titulo: x.nombre,
          sub: tot ? `${nf((x.ars / tot) * 100)} %` : undefined,
          valor: { tipo: "monto", monto: m(x.ars, x.usd) },
          barra: Math.max(0, x.ars) / max,
        })),
        cierre: { suma: m(tot, suma(filas, (x) => x.usd)), cifra: m(suma(del, (d) => d.ars), suma(del, (d) => d.usd)), texto: "el facturado neto del período" },
      }],
    };
  },
});

// ─── Resultado ──────────────────────────────────────────────────────────────────────────

const GRUPOS = [["ingreso", "Ingresos"], ["costo_directo", "Costo directo"], ["estructura", "Estructura"], ["financiero", "Financiero"]] as const;

const resultado = definirNodo({
  tipo: "resultado",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const base = await (await lecturas()).baseResultado(ctx.hoy);
    const disponibles = [...new Set(base.filas.map((f) => f.mes))].sort();
    const meses = mesesDe(ref, ctx.hoy, disponibles);
    if (!meses.length) return { titulo: "Resultado de gestión", cifra: sinDato("Sin datos contables para ese mes"), secciones: [] };
    const { meses: mr, filas, gestion } = rubrosDe(base, ctx.hoy, ctx.dolar, meses);
    const soloParcial = mr.every((x) => x.parcial);
    const ingresos = suma(mr, (x) => x.ingresos);
    const todos = armarResultado(base.filas, disponibles, ctx.hoy, (ym) => tcPromedioMes(ctx.dolar, ym));
    const sinIibb = mesesSinIibb(todos).filter((x) => meses.includes(x.mes));
    const desde = meses[0];
    const hasta = meses[meses.length - 1];
    const secciones: SeccionDesglose[] = GRUPOS.map(([g, t]) => ({
      titulo: t,
      filas: filas.filter((x) => x.grupo === g && Math.abs(x.monto.ars) >= 1).map((x) => ({
        id: x.id,
        titulo: x.nombre,
        valor: { tipo: "monto" as const, monto: x.monto },
        hijo: { tipo: "resultadoRubro", rubro: x.id, desde, hasta },
      })),
    }));
    secciones.push({
      filas: [],
      cierre: soloParcial
        ? { nota: "Mes en curso: sin sueldos ni Ingresos Brutos devengados. No comparar con meses cerrados." }
        : { suma: sumaMontos(filas.map((x) => x.monto)), cifra: gestion, texto: "el resultado de gestión" },
      nota: "Sin los ajustes y cuadres que quedan fuera del resultado de gestión (cuenta 888888, retiros cargados como gasto, circuitos especiales). En USD, cada mes al dólar promedio del mes.",
    });
    const avisos: { texto: string; tono: "aten" | "gris" }[] = [];
    if (base.andamiosArs != null && base.andamiosArs > 0 && !((base.amortizacionAcumArs ?? 0) > 0)) {
      avisos.push({ texto: `◐ Sin amortización de andamios: ARS ${nf(base.andamiosArs / 1e6, 1)} M a valor histórico; a ${VIDA_UTIL_REF_MESES / 12} años de vida útil serían unos ARS ${nf(base.andamiosArs / VIDA_UTIL_REF_MESES / 1e6, 1)} M por mes (referencia, no contable).`, tono: "gris" });
    }
    for (const s of sinIibb) avisos.push({ texto: `${mesNombre(s.mes).replace(/^./, (c) => c.toUpperCase())} no tiene Ingresos Brutos devengados: el resultado está sobreestimado en unos ARS ${nf(s.estimado / 1e6, 1)} M.`, tono: "aten" });
    if (mr.some((x) => x.parcial)) avisos.push({ texto: "Mes en curso: sin sueldos devengados, no comparar con meses cerrados.", tono: "gris" });
    return {
      titulo: `Resultado de gestión · ${etqMeses(meses)}`,
      cifra: soloParcial ? sinDato("Mes en curso: sin sueldos devengados") : { tipo: "monto", monto: gestion },
      sub: soloParcial ? "mes en curso" : `margen ${ingresos > 0 ? `${nf((gestion.ars / ingresos) * 100, 1)} %` : "sin dato"} · sin IVA`,
      avisos,
      secciones,
    };
  },
});

const resultadoRubro = definirNodo({
  tipo: "resultadoRubro",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const rubro = ref.rubro as RubroId;
    const def = RUBRO[rubro];
    if (!def || def.grupo === "excluido") return { titulo: "Rubro", cifra: sinDato("Ese rubro no está en el resultado de gestión"), secciones: [] };
    const base = await (await lecturas()).baseResultado(ctx.hoy);
    const disponibles = [...new Set(base.filas.map((f) => f.mes))].sort();
    const meses = mesesDe(ref, ctx.hoy, disponibles);
    const cuentas = cuentasDeRubro(base, ctx.hoy, ctx.dolar, meses, rubro).filter((c) => Math.abs(c.monto.ars) >= 1);
    const total = sumaMontos(cuentas.map((c) => c.monto));
    return {
      titulo: `${def.nombre} · ${meses.length ? etqMeses(meses) : "sin meses"}`,
      cifra: { tipo: "monto", monto: total },
      sub: "por cuenta · sin IVA · gastos en negativo",
      csv: true,
      secciones: [{
        filas: cuentas.map((c) => ({ id: String(c.cuenta), titulo: c.nombre, sub: c.codigo, valor: { tipo: "monto", monto: c.monto } })),
        cierre: { suma: total, cifra: total, texto: "el rubro" },
      }],
    };
  },
});

// ─── Comercial ──────────────────────────────────────────────────────────────────────────

const vendidoOrdenes = definirNodo({
  tipo: "vendido_ordenes",
  pantalla: "ventas",
  async resolver(ref, ctx) {
    const r = rangoDe(ref, ctx.hoy);
    const k = await (await lecturas()).baseComercial(ctx.hoy);
    const reconf = new Set(k.reconfirmaciones.map(([, o]) => o));
    const del = k.confirmadas.filter(([d]) => d >= r.desde && d <= r.hasta).sort((a, b) => b[1] - a[1]);
    const total = m(suma(del, ([, v]) => v));
    const { filas, pagina } = paginar(del, ctx.pagina);
    return {
      titulo: `Vendido según Odoo · ${r.etq}`,
      cifra: { tipo: "monto", monto: total },
      sub: `${del.length} órdenes confirmadas · con IVA · no es venta`,
      avisos: [{ texto: "Es lo que muestra el tablero Comercial de Odoo: órdenes con fecha de confirmación en el período, con IVA. Al cancelar y reconfirmar una orden, Odoo reescribe la fecha y la vuelve a contar entera.", tono: "aten" }],
      csv: true,
      pagina,
      secciones: [{
        filas: filas.map(([d, v, id, nombre, cliente]) => ({
          id: String(id),
          titulo: `${nombre} · ${nombreLindo(cliente)}`,
          sub: `confirmada ${flarga(d)}`,
          valor: { tipo: "monto", monto: m(v) },
          etiqueta: reconf.has(id) ? { texto: "reconfirmada", tono: "aten" } : undefined,
          odoo: { modelo: "sale.order", id },
        })),
        cierre: { suma: total, cifra: total, texto: "lo que muestra Odoo" },
      }],
    };
  },
});

const cotizadoVivo = definirNodo({
  tipo: "cotizado_vivo",
  pantalla: "ventas",
  async resolver(_ref, ctx) {
    const k = await (await lecturas()).baseComercial(ctx.hoy);
    const total = m(k.vivo.ars);
    const { filas, pagina } = paginar(k.vivo.filas, ctx.pagina);
    const esperado = k.conversion.pct != null
      ? `esperado: ${nf(k.conversion.pct, 1)} % (conversión histórica en monto, ${mesEtq(k.conversion.desde)} a ${mesEtq(k.conversion.hasta)})`
      : "todavía sin conversión histórica";
    return {
      titulo: "Cotizado vivo",
      cifra: { tipo: "monto", monto: total },
      sub: `${k.vivo.cantidad} cotizaciones · sin IVA · ${esperado}`,
      avisos: k.concentracion
        ? [{ texto: `El ${nf(k.concentracion.pct)} % del cotizado vivo es de un solo usuario que convirtió el ${nf(k.concentracion.conversionPct, 1)} % de sus cotizaciones en 12 meses: conviene confirmar si son cotizaciones reales.`, tono: "aten" }]
        : [],
      csv: true,
      pagina,
      secciones: [
        {
          filas: filas.map((o) => ({ id: String(o.id), titulo: `${o.nombre} · ${nombreLindo(o.cliente)}`, sub: `creada ${flarga(o.creada)}`, valor: { tipo: "monto", monto: m(o.ars) }, odoo: { modelo: "sale.order", id: o.id } })),
          cierre: { suma: m(suma(k.vivo.filas, (o) => o.ars)), cifra: total, texto: "el cotizado vivo" },
        },
        {
          titulo: "Fuera del total",
          filas: k.vivo.excluidas.map((x) => ({ id: x.motivo, titulo: x.motivo, sub: `${x.cantidad} cotizaciones`, valor: { tipo: "monto", monto: m(x.ars) }, atenuada: true })),
          nota: "Borradores de más de ARS 1.000 que no cuentan como venta posible.",
        },
      ],
    };
  },
});

export const nodos: DefNodo[] = [facturadoNeto, factCliente, notasCredito, nuevaVsRenov, resultado, resultadoRubro, vendidoOrdenes, cotizadoVivo];
