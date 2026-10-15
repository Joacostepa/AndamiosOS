import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INICIO_ODOO,
  armarResultado,
  bandaRitmo,
  composicion,
  concentracionCotizado,
  conversionHistorica,
  cotizadoVivo,
  emparejarNC,
  facturado,
  facturadoComparado,
  familiaDe,
  familiaDominante,
  historiaOrdenes,
  mediana,
  mesesCompletos,
  mesesSinIibb,
  moverPer,
  notasCredito,
  perValido,
  periodoDeParams,
  rango,
  rangoComparado,
  rubroDeCuenta,
  tiempoAprobacion,
  tipoDeRenglon,
  ultimos12,
  variacion,
  type Doc,
  type FilaCuentaMes,
  type Orden,
} from "./ventas-reglas.ts";

const HOY = "2026-10-15";
let sec = 1;
const doc = (fecha: string, ars: number, o: Partial<Doc> = {}): Doc => ({ id: sec++, fecha, ars, usd: ars / 1000, nc: ars < 0, cli: 1, nombre: `D${sec}`, rev: null, ...o });

test("período por defecto: el mes en curso; lo inválido vuelve al mes en curso", () => {
  assert.deepEqual(periodoDeParams({}, HOY), { per: { g: "mes", ref: "2026-10" }, vs: "anterior" });
  assert.deepEqual(periodoDeParams({ g: "mes", p: "2026-13" }, HOY).per, { g: "mes", ref: "2026-10" });
  assert.deepEqual(periodoDeParams({ g: "mes", p: "2025-06" }, HOY).per, { g: "mes", ref: "2026-10" }, "antes del inicio de Odoo");
  assert.deepEqual(periodoDeParams({ g: "mes", p: "2027-01" }, HOY).per, { g: "mes", ref: "2026-10" }, "futuro");
  assert.deepEqual(periodoDeParams({ g: "trimestre" }, HOY).per, { g: "trimestre", ref: "2026-Q4" });
  assert.deepEqual(periodoDeParams({ g: "semana", p: "2026-10-15" }, HOY).per, { g: "semana", ref: "2026-10-12" }, "la semana arranca el lunes");
  assert.deepEqual(periodoDeParams({ g: "pers", desde: "2026-10-10", hasta: "2026-09-01" }, HOY).per, { g: "pers", ref: "", desde: "2026-09-01", hasta: "2026-10-10" });
  // El promedio de 6 sólo existe para meses.
  assert.equal(periodoDeParams({ g: "anio", vs: "promedio6" }, HOY).vs, "anterior");
  assert.equal(periodoDeParams({ g: "mes", vs: "promedio6" }, HOY).vs, "promedio6");
});

test("rango: en curso se corta en hoy y cuenta los días", () => {
  const r = rango({ g: "mes", ref: "2026-10" }, HOY);
  assert.equal(r.desde, "2026-10-01");
  assert.equal(r.hasta, HOY);
  assert.equal(r.enCurso, true);
  assert.equal(r.transcurridos, 15);
  assert.equal(r.total, 31);
  assert.equal(r.etq, "Octubre 2026");
  assert.equal(rango({ g: "trimestre", ref: "2026-Q3" }, HOY).etq, "3.º trimestre 2026");
  assert.equal(rango({ g: "trimestre", ref: "2026-Q3" }, HOY).finNat, "2026-09-30");
  assert.equal(rango({ g: "semana", ref: "2026-10-12" }, HOY).etq, "Semana del 12/10 al 18/10");
  assert.equal(rango({ g: "anio", ref: "2025" }, HOY).recortadoInicio, true);
});

test("moverPer y perValido", () => {
  assert.equal(moverPer({ g: "mes", ref: "2026-01" }, -1).ref, "2025-12");
  assert.equal(moverPer({ g: "trimestre", ref: "2026-Q1" }, -1).ref, "2025-Q4");
  assert.equal(moverPer({ g: "trimestre", ref: "2026-Q4" }, 1).ref, "2027-Q1");
  assert.deepEqual(moverPer({ g: "pers", ref: "", desde: "2026-10-01", hasta: "2026-10-10" }, -1), { g: "pers", ref: "", desde: "2026-09-21", hasta: "2026-09-30" });
  assert.equal(perValido({ g: "mes", ref: "2025-10" }, HOY), false);
  assert.equal(perValido({ g: "mes", ref: "2025-11" }, HOY), true);
  assert.equal(perValido({ g: "mes", ref: "2026-11" }, HOY), false);
  assert.equal(perValido({ g: "anio", ref: "2025" }, HOY), true, "toca noviembre y diciembre");
});

test("comparación: a igual día si está en curso; sin historia es sin dato con motivo", () => {
  const c = rangoComparado({ g: "mes", ref: "2026-10" }, "anterior", HOY);
  assert.deepEqual(c, { tipo: "rango", desde: "2026-09-01", hasta: "2026-09-15", finNat: "2026-09-30", etq: "a igual día sep" });
  const cerrado = rangoComparado({ g: "mes", ref: "2026-09" }, "anterior", HOY);
  assert.deepEqual(cerrado, { tipo: "rango", desde: "2026-08-01", hasta: "2026-08-31", finNat: "2026-08-31", etq: "vs ago" });
  // Marzo en curso (31 días) contra febrero (28): no se pasa del fin de febrero.
  assert.equal((rangoComparado({ g: "mes", ref: "2026-03" }, "anterior", "2026-03-31") as { hasta: string }).hasta, "2026-02-28");
  const primero = rangoComparado({ g: "mes", ref: "2025-11" }, "anterior", HOY);
  assert.equal(primero.tipo, "sd");
  assert.match((primero as { motivo: string }).motivo, /empieza en nov-2025/);
  const anio = rangoComparado({ g: "mes", ref: "2026-10" }, "anioAnterior", HOY);
  assert.equal(anio.tipo, "sd");
  assert.match((anio as { motivo: string }).motivo, /noviembre 2026/);
  // Desde noviembre 2026 el año anterior aparece solo.
  assert.equal(rangoComparado({ g: "mes", ref: "2026-11" }, "anioAnterior", "2026-11-20").tipo, "rango");
  const p6 = rangoComparado({ g: "mes", ref: "2026-10" }, "promedio6", HOY);
  assert.equal(p6.tipo, "promedio");
  assert.equal((p6 as { rangos: unknown[] }).rangos.length, 6);
  assert.deepEqual((p6 as { rangos: { desde: string; hasta: string }[] }).rangos[0], { desde: "2026-09-01", hasta: "2026-09-15" });
  assert.equal((rangoComparado({ g: "mes", ref: "2026-01" }, "promedio6", HOY) as { rangos: unknown[] }).rangos.length, 2, "sólo nov y dic 2025");
  assert.equal(rangoComparado({ g: "pers", ref: "", desde: "2026-10-01", hasta: "2026-10-10" }, "anterior", HOY).etq, "mismo largo inmediatamente anterior");
});

test("facturado neto: facturas − NC, sin IVA, USD de cada comprobante", () => {
  const docs = [doc("2026-10-01", 1000), doc("2026-10-05", -200, { usd: -0.25 }), doc("2026-09-30", 500), doc("2026-10-07", 300, { usd: null })];
  const f = facturado(docs, "2026-10-01", "2026-10-31");
  assert.equal(f.ars, 1100);
  assert.equal(f.usd, 1 - 0.25);
  assert.equal(f.brutoArs, 1300);
  assert.equal(f.ncArs, 200);
  assert.equal(f.n, 3);
  assert.equal(f.sinTc, 1);
  assert.equal(facturado(docs, "2026-10-01", "2026-10-31", 1).ars, 0, "sin el cliente");
  assert.equal(variacion(120, 100), 20);
  assert.equal(variacion(120, 0), null, "sin base: sin dato, no infinito");
  assert.equal(facturadoComparado(docs, { tipo: "sd", motivo: "x", etq: "y" }), null);
});

test("NC reales: se empareja con la factura del mismo cliente ±15 % dentro de 10 días, una vez", () => {
  const fOrig = doc("2026-09-01", 1000, { cli: 7 });
  const nc1 = doc("2026-09-10", -1000, { cli: 7, rev: fOrig.id });
  const reemplazo = doc("2026-09-15", 1100, { cli: 7 });
  const nc2 = doc("2026-09-11", -1000, { cli: 7 }); // la misma factura no empareja dos NC
  const nc3 = doc("2026-09-01", -500, { cli: 8 });
  const tarde = doc("2026-09-12", 500, { cli: 8 }); // 11 días: no
  const nc4 = doc("2026-09-20", -1000, { cli: 9 });
  const lejos = doc("2026-09-21", 1200, { cli: 9 }); // 20 %: no
  const docs = [fOrig, nc1, reemplazo, nc2, nc3, tarde, nc4, lejos];
  const r = emparejarNC(docs);
  assert.deepEqual([...r.entries()], [[nc1.id, reemplazo.id]]);
  // La factura que la NC anula no cuenta como refacturación.
  assert.equal(emparejarNC([fOrig, doc("2026-09-01", -1000, { cli: 7, rev: fOrig.id })]).size, 0);
  const nc = notasCredito(docs, r, "2026-09-01", "2026-09-30");
  assert.equal(nc.refactArs, 1000);
  assert.equal(nc.realesArs, 2500);
  assert.equal(nc.totalArs, 3500);
  assert.equal(Math.round(nc.pctReales! * 10) / 10, Math.round((2500 / 3800) * 1000) / 10);
  assert.equal(notasCredito([], r, "2026-09-01", "2026-09-30").pctReales, null);
});

test("banda de ritmo: cocientes 2.º y 5.º de los 6 meses anteriores al mismo día", () => {
  const docs: Doc[] = [];
  // Seis meses cerrados: 100 al día 15 y el resto hasta fin de mes según el cociente.
  const ratios = [1.5, 1.8, 2.0, 2.2, 2.5, 3.0];
  ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].forEach((mes, i) => {
    docs.push(doc(`${mes}-10`, 100_000, { usd: 100 }));
    docs.push(doc(`${mes}-25`, (ratios[i] - 1) * 100_000, { usd: (ratios[i] - 1) * 100 }));
  });
  docs.push(doc("2026-10-05", 200_000, { usd: 200 }));
  const b = bandaRitmo(docs, "2026-10", HOY)!;
  assert.equal(b.meses, 6);
  assert.equal(b.dia, 15);
  assert.ok(Math.abs(b.rLo - 1.8) < 1e-9 && Math.abs(b.rHi - 2.5) < 1e-9);
  assert.ok(Math.abs(b.minUsd - 360) < 1e-6 && Math.abs(b.maxUsd - 500) < 1e-6);
  assert.equal(bandaRitmo(docs, "2026-09", HOY), null, "un mes cerrado no tiene banda");
  assert.equal(bandaRitmo([], "2025-11", "2025-11-10"), null, "sin meses anteriores");
});

test("renglones: anticipo, renovación, familia por producto o por texto", () => {
  assert.equal(tipoDeRenglon("ALQUILER DE ESTRUCTURA MULTIDIRECCIONAL SIN MONTAJE", null), "sin_montaje");
  assert.equal(tipoDeRenglon("ESTRUCTURA MULTIDIRECCIONAL", null), "nuevo");
  assert.equal(tipoDeRenglon("RENOVACIÓN ALQUILER PANTALLA", null), "renovacion");
  assert.equal(tipoDeRenglon(null, "RENOVACIÓN"), "renovacion");
  assert.equal(tipoDeRenglon(null, "PAGO SALDO + RENOVACIÓN"), "anticipos", "anticipo/saldo antes que renovación");
  assert.equal(tipoDeRenglon(null, "Anticipo 50 %"), "anticipos");
  assert.equal(tipoDeRenglon("FLETE CABA", null), "servicios");
  assert.equal(tipoDeRenglon("VALLA PEATONAL", null), "servicios");
  assert.equal(tipoDeRenglon("TABLON METALICO 2.50 m", null), "sin_montaje");
  assert.equal(tipoDeRenglon("CAÑO - 3,20m", null), null, "sin regla: se resuelve con la orden");
  assert.equal(familiaDe("ESCENARIO SET COMPLETO"), "eventos");
  assert.equal(familiaDe("SETTER"), null, "SET es palabra entera");
  assert.equal(familiaDe(""), null);
  assert.equal(familiaDominante([{ producto: "PANTALLA", texto: null, monto: 100 }, { producto: "FLETE", texto: null, monto: 30 }, { producto: "BANDEJA", texto: null, monto: 10 }]), "pantalla");
  assert.equal(familiaDominante([{ producto: null, texto: "nada", monto: 100 }]), null);
});

test("composición: suma por tipo dentro del rango, en el orden de la maqueta", () => {
  const c = composicion([["2026-10-01", "renovacion", 100, 1], ["2026-10-02", "nuevo", 300, 3], ["2026-09-30", "nuevo", 999, 9], ["2026-10-03", "renovacion", 50, 0.5]], "2026-10-01", "2026-10-31");
  assert.deepEqual(c.map((x) => [x.tipo, x.ars, x.usd]), [["nuevo", 300, 3], ["renovacion", 150, 1.5]]);
});

test("resultado: rubros por código de cuenta y resultado de gestión", () => {
  assert.equal(rubroDeCuenta("4.1.1.01.02", "income"), "ing_alquiler");
  assert.equal(rubroDeCuenta("4.1.1.01.04", "income"), "ing_otros_operativos");
  assert.equal(rubroDeCuenta("4.2.1.04.13", "expense"), "personal_operativo");
  assert.equal(rubroDeCuenta("4.2.1.03.12", "expense"), "subalquiler_estructuras");
  assert.equal(rubroDeCuenta("4.2.1.04.15", "expense"), "personal_administrativo");
  assert.equal(rubroDeCuenta("4.2.1.07.03", "expense"), "impuestos");
  assert.equal(rubroDeCuenta("888888", "expense"), "ajustes_no_operativos");
  assert.equal(rubroDeCuenta("4.2.1.04.19", "expense"), "ajustes_no_operativos");
  assert.equal(rubroDeCuenta("4.1.1.03.03", "income_other"), "otros_ingresos");
  assert.equal(rubroDeCuenta("4.2.1.01.020", "income_other"), "otros_ingresos");
  assert.equal(rubroDeCuenta("999998", "expense"), "financieros");
  assert.equal(rubroDeCuenta("4.2.1.03.11", "expense"), "estructura_otros");

  const fila = (mes: string, codigo: string, balance: number, tipo = "expense"): FilaCuentaMes => ({ mes, cuenta: codigo.length, codigo, nombre: codigo, tipo, balance });
  const filas = [
    fila("2026-08", "4.1.1.01.02", -1000, "income"), fila("2026-08", "4.2.1.04.01", 200), fila("2026-08", "4.2.1.03.01", 100), fila("2026-08", "4.1.1.03.03", -10, "income_other"),
    fila("2026-08", "4.2.1.07.03", 30), fila("2026-08", "888888", 50),
    fila("2026-09", "4.1.1.01.02", -1000, "income"), fila("2026-09", "4.2.1.04.01", 200),
    fila("2026-10", "4.1.1.01.02", -500, "income"),
  ];
  const r = armarResultado(filas, ["2026-08", "2026-09", "2026-10"], HOY, () => 1000);
  assert.equal(r[0].ingresos, 1000);
  assert.equal(r[0].costoDirecto, 200);
  assert.equal(r[0].estructura, 130);
  assert.equal(r[0].financiero, 10);
  assert.equal(r[0].gestion, 1000 - 200 - 130 + 10);
  assert.equal(r[0].ajustes, -50, "888888 queda fuera del resultado de gestión");
  assert.equal(r[0].iibb, 30);
  assert.equal(r[2].parcial, true);
  // Septiembre cerrado sin Ingresos Brutos y con agosto que sí tuvo: aviso con el estimado.
  assert.deepEqual(mesesSinIibb(r), [{ mes: "2026-09", estimado: 30 }]);
  assert.deepEqual(mesesCompletos("2026-07-01", "2026-12-31"), ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.deepEqual(mesesCompletos("2025-01-01", "2025-12-31"), ["2025-11", "2025-12"]);
  assert.equal(ultimos12(HOY).length, 12);
  assert.equal(ultimos12(HOY)[0], "2025-11");
  assert.equal(ultimos12("2026-01-10")[0], INICIO_ODOO.slice(0, 7));
});

const orden = (id: number, o: Partial<Orden> = {}): Orden => ({
  id, nombre: `S${String(id).padStart(5, "0")}`, creada: "2026-09-20T12:00:00Z", fechaOrden: null, estado: "draft", sinIva: 1_000_000, conIva: 1_210_000,
  cliente: "Cliente", usuario: 1, oportunidad: null, tipoContrato: "Obra", ...o,
});

test("historia de órdenes: primera confirmación, reconfirmaciones y contratos en edición", () => {
  const h = historiaOrdenes([
    { orden: 1, instante: "2026-01-02T10:00:00Z", viejo: "Cotización", nuevo: "Orden de venta" },
    { orden: 1, instante: "2026-03-01T10:00:00Z", viejo: "Orden de venta", nuevo: "Cancelado" },
    { orden: 1, instante: "2026-03-01T11:00:00Z", viejo: "Cancelado", nuevo: "Cotización" },
    { orden: 1, instante: "2026-03-02T10:00:00Z", viejo: "Cotización", nuevo: "Orden de venta" },
    { orden: 2, instante: "2026-02-01T10:00:00Z", viejo: "Presupuesto", nuevo: "Pedido de venta" },
  ]);
  assert.equal(h.get(1)!.primera, "2026-01-02T10:00:00Z");
  assert.deepEqual(h.get(1)!.reconfirmaciones, ["2026-03-02T10:00:00Z"]);
  assert.equal(h.get(1)!.reabierta, true);
  assert.equal(h.get(2)!.reabierta, false);
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
});

test("tiempo de aprobación: Obra aparte, sólo cotizaciones emitidas", () => {
  const ords = [
    orden(1, { creada: "2026-05-01T00:00:00Z", estado: "sale" }),
    orden(2, { creada: "2026-05-01T00:00:00Z", estado: "sale", tipoContrato: "Simple" }),
    orden(3, { creada: "2026-05-01T00:00:00Z", estado: "sale", sinIva: 500 }), // no emitida
  ];
  const h = historiaOrdenes([
    { orden: 1, instante: "2026-05-11T00:00:00Z", viejo: "Cotización", nuevo: "Orden de venta" },
    { orden: 2, instante: "2026-05-01T00:00:00Z", viejo: "Cotización", nuevo: "Orden de venta" },
    { orden: 3, instante: "2026-05-01T00:00:00Z", viejo: "Cotización", nuevo: "Orden de venta" },
  ]);
  const t = tiempoAprobacion(ords, h, "2025-10-15T03:00:00Z");
  assert.equal(t.n, 2);
  assert.equal(t.nObra, 1);
  assert.equal(t.medianaObra, 10);
  assert.equal(t.pct7Dias, 50);
});

test("cotizado vivo: exclusiones en orden y una por oportunidad", () => {
  const ops = new Map<number, "won" | "lost" | "pending">([[10, "lost"], [11, "won"], [12, "pending"]]);
  const ords = [
    orden(1, { oportunidad: 12, sinIva: 5_000_000 }),
    orden(2, { oportunidad: 12, sinIva: 3_000_000 }), // duplicada: queda la mayor
    orden(3, { oportunidad: 10 }), // perdida
    orden(4, { oportunidad: 11 }), // alternativa de una ganada
    orden(5, { sinIva: 2_000_000_000 }), // absurda
    orden(6, { creada: "2026-06-01T12:00:00Z" }), // más de 90 días
    orden(7), // en edición
    orden(8, { sinIva: 900 }), // menos de ARS 1.000: ni entra
    orden(9, { estado: "sale" }),
  ];
  const h = historiaOrdenes([{ orden: 7, instante: "2026-09-01T00:00:00Z", viejo: "Cancelado", nuevo: "Cotización" }]);
  const v = cotizadoVivo(ords, h, ops, HOY);
  assert.equal(v.cantidad, 1);
  assert.equal(v.ars, 5_000_000);
  assert.deepEqual(Object.fromEntries(v.excluidas.map((x) => [x.motivo, x.cantidad])), {
    "Montos absurdos (mil millones o más)": 1,
    "Duplicadas de la misma oportunidad": 1,
    "Oportunidad perdida": 1,
    "Alternativas de una oportunidad ya ganada": 1,
    "Más de 90 días sin respuesta": 1,
    "Contratos en edición (ya confirmados alguna vez)": 1,
  });
});

test("conversión histórica: cohortes con 60 días cumplidos; ganado inicial sobre emitido", () => {
  const ords = [
    orden(1, { creada: "2026-07-10T12:00:00Z", sinIva: 1000_000, estado: "sale", fechaOrden: "2026-07-20T12:00:00Z" }),
    orden(2, { creada: "2026-07-11T12:00:00Z", sinIva: 3000_000 }),
    orden(3, { creada: "2026-08-20T12:00:00Z", sinIva: 9000_000 }), // agosto: menos de 60 días
    orden(4, { creada: "2026-07-12T12:00:00Z", sinIva: 5_000_000_000 }), // absurda nunca confirmada: no suma al emitido
    orden(5, { creada: "2026-07-12T12:00:00Z", sinIva: 50_000, cliente: "Consumidor Final Anónimo" }),
  ];
  const c = conversionHistorica(ords, new Map(), new Map([[1, 800_000]]), HOY);
  assert.equal(c.emitidoArs, 4_000_000);
  assert.equal(c.ganadoArs, 800_000);
  assert.equal(c.pct, 20);
  assert.equal(c.hasta, "2026-07");
});

test("concentración: un usuario con más del 30 % del vivo que casi no convierte", () => {
  const ords = [orden(1, { usuario: 2, sinIva: 7_000_000 }), orden(2, { usuario: 3, sinIva: 3_000_000 }), ...Array.from({ length: 30 }, (_, i) => orden(100 + i, { usuario: 2, estado: "cancel" }))];
  const v = cotizadoVivo(ords, new Map(), new Map(), HOY);
  const c = concentracionCotizado(v, ords, new Map(), HOY)!;
  assert.equal(c.pct, 70);
  assert.equal(c.conversionPct, 0);
  // Si convierte bien, no hay alerta.
  const ok = [orden(1, { usuario: 2, sinIva: 7_000_000 }), orden(2, { usuario: 2, estado: "sale", fechaOrden: "2026-09-21T00:00:00Z" })];
  assert.equal(concentracionCotizado(cotizadoVivo(ok, new Map(), new Map(), HOY), ok, new Map(), HOY), null);
});

test("cuota salteada: Ministerio factura todos los meses, septiembre sin factura y dos en octubre", async () => {
  const { cuotasSalteadas } = await import("./ventas-reglas.ts");
  let id = 1;
  const f = (cli: number, fecha: string, ars: number, nc = false) => ({ id: id++, fecha, ars, usd: null, nc, cli, nombre: `F${id}`, rev: null });
  const docs = [
    f(1, "2026-06-23", 28_379_628), f(1, "2026-07-27", 28_379_628), f(1, "2026-08-26", 32_912_032),
    f(1, "2026-10-06", 32_912_032), f(1, "2026-10-08", 28_379_628), f(1, "2026-10-08", 28_379_628),
    f(1, "2026-10-08", -32_912_032, true), f(1, "2026-10-08", -32_912_032, true),
    // Cliente que factura todos los meses sin saltear: nada.
    f(2, "2026-06-01", 10), f(2, "2026-07-01", 10), f(2, "2026-08-01", 10), f(2, "2026-09-01", 10), f(2, "2026-10-01", 10),
    // Cliente que dejó de facturar (una sola en octubre): nada.
    f(3, "2026-06-01", 10), f(3, "2026-07-01", 10), f(3, "2026-08-01", 10), f(3, "2026-10-01", 10),
  ];
  const r = cuotasSalteadas(docs, "2026-10-15");
  assert.equal(r.length, 1);
  assert.equal(r[0].cli, 1);
  assert.equal(r[0].mes, "2026-09");
  assert.equal(r[0].cuota, 28_379_628);
  assert.deepEqual(r[0].despues, { mes: "2026-10", facturas: 3 });
});
