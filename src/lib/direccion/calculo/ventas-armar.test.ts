import { test } from "node:test";
import assert from "node:assert/strict";
import { armarResumen, armarVentas, type EntradaVentas } from "./ventas-armar.ts";
import { filtrarReservado } from "../reservado.ts";
import type { BaseFacturas, BaseResultado } from "./ventas-datos.ts";
import type { Doc, FilaCuentaMes } from "./ventas-reglas.ts";
import type { ResultadoCalculador } from "../tipos.ts";

const HOY = "2026-10-15";
let sec = 1;
const doc = (fecha: string, ars: number, cli = 1, o: Partial<Doc> = {}): Doc => ({ id: sec++, fecha, ars, usd: ars / 1000, nc: ars < 0, cli, nombre: `FA ${sec}`, rev: null, ...o });

const docs: Doc[] = [
  doc("2026-09-03", 1_000_000), doc("2026-09-10", 500_000, 2), doc("2026-09-25", 2_000_000),
  doc("2026-10-02", 1_200_000), doc("2026-10-08", 3_000_000, 2), doc("2026-10-09", -100_000),
];
const facturas: BaseFacturas = { docs, clientes: { 1: "CLIENTE UNO SA", 2: "MINISTERIO DEL INTERIOR" }, refact: [] };
const fila = (mes: string, codigo: string, balance: number, tipo = "expense"): FilaCuentaMes => ({ mes, cuenta: codigo.length, codigo, nombre: codigo, tipo, balance });
const resultado: BaseResultado = {
  filas: [
    fila("2026-08", "4.1.1.01.02", -3_000_000, "income"), fila("2026-08", "4.2.1.04.01", 1_000_000), fila("2026-08", "4.2.1.07.03", 100_000), fila("2026-08", "4.2.1.04.19", 400_000),
    fila("2026-09", "4.1.1.01.02", -3_500_000, "income"), fila("2026-09", "4.2.1.04.01", 1_000_000), fila("2026-09", "4.2.1.04.19", 300_000),
    fila("2026-10", "4.1.1.01.02", -4_000_000, "income"),
  ],
  andamiosArs: 600_000_000,
  amortizacionAcumArs: 0,
};
const dolar = [{ fecha: "2026-08-01", valor: 1000 }, { fecha: "2026-09-01", valor: 1000 }, { fecha: "2026-10-01", valor: 1000 }];
const base = (o: Partial<EntradaVentas> = {}): EntradaVentas => ({
  hoy: HOY, params: {}, dolar, tc: { fecha: HOY, valor: 1000 }, facturas,
  composicion: { ok: true, datos: { filas: [["2026-10-02", "renovacion", 1_200_000, 1200], ["2026-10-08", "nuevo", 3_000_000, 3000], ["2026-10-09", "nuevo", -100_000, -100]], renglones: 3, sinClasificar: 0 } },
  resultado: { ok: true, datos: resultado },
  comercial: { ok: false, motivo: "No pudimos leer las cotizaciones y el CRM de Odoo" },
  abono: { ok: false, motivo: "Lo calcula En la calle y todavía no está disponible" },
  ...o,
});

test("mes en curso: facturado a igual día, comparaciones en USD y en pesos", () => {
  const r = armarVentas(base());
  const fact = r.cifras.find((c) => c.id === "facturado")!;
  assert.deepEqual(fact.valor, { tipo: "monto", monto: { ars: 4_100_000, usd: 4100 } });
  // 1–15/10 (4,1 M) contra 1–15/09 (1,5 M).
  assert.ok(Math.abs(fact.comparaciones![0].delta! - (4.1 / 1.5 - 1) * 100) < 1e-9);
  assert.equal(fact.comparaciones![0].base, "a igual día sep");
  assert.equal(r.detalle.comparacionesArs.facturado.length, 1);
  assert.deepEqual(fact.nodo, { tipo: "facturado_neto", desde: "2026-10-01", hasta: HOY });
  assert.equal(r.detalle.periodo.siguiente, null, "no hay período siguiente");
  assert.deepEqual(r.detalle.periodo.anterior, { g: "mes", p: "2026-09" });
  assert.equal(r.detalle.periodo.vsOpciones.find((o) => o.valor === "anioAnterior")!.disponible, false);
});

test("lo que falta es sin dato con el motivo, nunca 0", () => {
  const r = armarVentas(base());
  const abono = r.cifras.find((c) => c.id === "abono")!;
  assert.equal(abono.valor.tipo, "sin_dato");
  const res = r.cifras.find((c) => c.id === "resultado")!;
  assert.equal(res.valor.tipo, "sin_dato", "octubre en curso no tiene resultado");
  assert.match((res.valor as { motivo: string }).motivo, /sueldos/);
  assert.equal(r.detalle.comercial.estado, "sin_dato");
  assert.equal(r.detalle.vendido.estado, "sin_dato");
  const sinComp = armarVentas(base({ composicion: { ok: false, motivo: "No pudimos leer los renglones" } }));
  assert.equal(sinComp.cifras.find((c) => c.id === "renovacion")!.valor.tipo, "sin_dato");
  // Semana: el resultado se cierra por mes.
  const sem = armarVentas(base({ params: { g: "semana", p: "2026-10-12" } }));
  assert.match((sem.cifras.find((c) => c.id === "resultado")!.valor as { motivo: string }).motivo, /por mes/);
  assert.equal(sem.detalle.ganamos, null);
});

test("trimestre con el mes en curso: el resultado suma sólo los meses cerrados", () => {
  const r = armarVentas(base({ params: { g: "trimestre", p: "2026-Q3" } }));
  const res = r.cifras.find((c) => c.id === "resultado")!;
  // Julio sin datos contables; agosto 3,0 − 1,0 − 0,1 = 1,9 M; septiembre 3,5 − 1,0 = 2,5 M.
  assert.deepEqual(res.valor, { tipo: "monto", monto: { ars: 4_400_000, usd: 4400 } });
  assert.match(res.confianza.motivo!, /septiembre sin Ingresos Brutos/);
  const anio = armarVentas(base({ params: { g: "anio", p: "2026" } }));
  assert.equal(anio.detalle.ganamos!.estado, "ok");
  const filas = (anio.detalle.ganamos as { filas: { mes: string; gestion: unknown }[] }).filas;
  assert.equal(filas.find((f) => f.mes === "2026-10")!.gestion, null, "octubre: sin dato · sin sueldos devengados");
  // Lo de socios (ajustes con retiros cargados como gasto) va en detalle.reservado y se recorta.
  assert.ok(anio.detalle.reservado);
  const recortado = filtrarReservado({ ...anio, pantalla: "ventas", tc: null } as ResultadoCalculador<typeof anio.detalle>, false);
  assert.equal("reservado" in (recortado.detalle as object), false);
  assert.ok(!JSON.stringify(recortado).includes("ajustesPorMes"));
});

test("composición cierra con el facturado y las renovaciones salen de ahí", () => {
  const r = armarVentas(base());
  const c = r.detalle.composicion;
  assert.equal(c.estado, "ok");
  if (c.estado !== "ok") return;
  assert.equal(c.total.ars, c.facturado.ars);
  const ren = r.cifras.find((x) => x.id === "renovacion")!;
  assert.equal(ren.valor.tipo, "pct");
  assert.ok(Math.abs((ren.valor as { n: number }).n - (1_200_000 / 4_100_000) * 100) < 1e-9);
});

test("avisos y decisión de amortización; nada reservado en el resumen", () => {
  const r = armarVentas(base());
  const ids = r.avisos.map((a) => a.id);
  assert.ok(ids.includes("iibb_2026-09"));
  assert.ok(ids.includes("sin_amort"));
  assert.ok(ids.includes("sin_historia"));
  assert.deepEqual(r.decisiones!.map((d) => d.id), ["amortizacion"]);
  const s = armarResumen(base());
  assert.equal(s.mes, "2026-10");
  assert.equal(s.dia, 15);
  assert.equal(s.resultado!.valor.tipo, "monto");
  assert.deepEqual(s.resultado!.nodo, { tipo: "resultado", mes: "2026-09" });
  assert.equal(s.margen!.anterior!.mes, "2026-08");
  // Sin el mayor cliente del mes (el 2) la variación cambia mucho: se informa.
  assert.equal(s.sinMayorCliente!.cliente, "Ministerio del Interior");
  assert.ok(s.oraciones[0].frase.some((p) => typeof p === "string" && p.includes("sin Ministerio del Interior")));
  assert.ok(!JSON.stringify(s).includes("reservado"));
});
