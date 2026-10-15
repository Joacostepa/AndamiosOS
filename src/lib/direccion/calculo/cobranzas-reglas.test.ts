import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificarPartida,
  concentracion,
  dso,
  esTextoRechazo,
  leerConfigCobranzas,
  medioDeDiario,
  mesesEntre,
  netearFifo,
  noLlamar,
  posiblesDuplicadas,
  promedioPonderado,
  prorratearCobro,
  rechazoEnRiesgo,
  sectorDe,
  sumaVentana,
  sumarTramos,
  tramoDe,
  vencimientoEfectivo,
  ventanaDso,
  CONFIG_DEFECTO,
  aplicarCambiosSector,
} from "./cobranzas-reglas.ts";

test("tramos por días de atraso", () => {
  assert.equal(tramoDe(-5), "no_vencido");
  assert.equal(tramoDe(0), "no_vencido");
  assert.equal(tramoDe(1), "d1_30");
  assert.equal(tramoDe(30), "d1_30");
  assert.equal(tramoDe(31), "d31_60");
  assert.equal(tramoDe(60), "d31_60");
  assert.equal(tramoDe(90), "d61_90");
  assert.equal(tramoDe(91), "d90_mas");
});

test("rechazos por texto, sin mayúsculas ni acentos", () => {
  assert.ok(esTextoRechazo("Cheque rechazado OCRECONSTRUCCIONES SRL"));
  assert.ok(esTextoRechazo("Cheque rchz sin fondos SE FERS"));
  assert.ok(esTextoRechazo("por cheque RECHAZÁDO"));
  assert.ok(!esTextoRechazo("Devolucion Altenis Argentina Srl"));
});

test("clasificar partidas abiertas", () => {
  assert.equal(clasificarPartida("out_invoice", 100, "x"), "factura");
  assert.equal(clasificarPartida("out_refund", -100, "x"), "nc");
  assert.equal(clasificarPartida("entry", -8015000, "Nuevo cheque de terceros"), "sin_imputar");
  assert.equal(clasificarPartida("entry", 6544309, "Cheque rechazado OCRE"), "cheque_rechazado");
  assert.equal(clasificarPartida("entry", 6585425, "Devolucion Altenis"), "debito");
  // residuos de centavos: no son partidas
  assert.equal(clasificarPartida("entry", 0.12, "MIG"), null);
  assert.equal(clasificarPartida("entry", -0.01, "GCBA"), null);
});

test("vencimiento efectivo: plazo cargado, emisión + 30, y desde el asiento", () => {
  assert.deepEqual(vencimientoEfectivo({ tipo: "factura", fecha: "2026-01-23", fechaFactura: "2026-01-23", vencOdoo: "2026-01-23", tienePlazo: false }).venc, "2026-02-22");
  assert.equal(vencimientoEfectivo({ tipo: "factura", fecha: "2026-09-01", fechaFactura: "2026-09-01", vencOdoo: "2026-10-01", tienePlazo: true }).venc, "2026-10-01");
  assert.equal(vencimientoEfectivo({ tipo: "factura", fecha: "2026-09-01", fechaFactura: "2026-09-01", vencOdoo: "2026-09-01", tienePlazo: false }, 15).venc, "2026-09-16");
  assert.equal(vencimientoEfectivo({ tipo: "cheque_rechazado", fecha: "2026-07-01" }).venc, "2026-07-01");
});

test("neteo FIFO: el crédito va a la partida más vieja y lo que sobra queda a favor", () => {
  const p = [
    { id: 1, partnerId: 7, residual: 100, venc: "2026-01-01", fecha: "2026-01-01" },
    { id: 2, partnerId: 7, residual: 50, venc: "2026-03-01", fecha: "2026-02-01" },
    { id: 3, partnerId: 7, residual: -120, venc: "2026-05-01", fecha: "2026-05-01" },
    { id: 4, partnerId: 8, residual: 10, venc: "2026-01-01", fecha: "2026-01-01" },
    { id: 5, partnerId: 8, residual: -15, venc: "2026-02-01", fecha: "2026-02-01" },
  ];
  const r = netearFifo(p);
  const neto = Object.fromEntries(r.netas.map((x) => [x.id, x.neto]));
  assert.deepEqual(neto, { 1: 0, 2: 30, 3: 0, 4: 0, 5: 0 });
  assert.deepEqual(r.aFavor, [{ partnerId: 8, ars: -5 }]);
  // control: Σ netos + a favor = Σ residuales
  const sumaNetos = r.netas.reduce((a, x) => a + x.neto, 0) + r.aFavor.reduce((a, x) => a + x.ars, 0);
  assert.equal(sumaNetos, p.reduce((a, x) => a + x.residual, 0));
});

test("sumar tramos cuenta partidas con monto", () => {
  const t = sumarTramos([
    { tramo: "no_vencido", ars: 10 },
    { tramo: "d90_mas", ars: 5 },
    { tramo: "d90_mas", ars: 0 },
  ]);
  assert.equal(t.length, 5);
  assert.deepEqual(t.find((x) => x.clave === "d90_mas"), { clave: "d90_mas", etiqueta: "+90 d", ars: 5, partidas: 1 });
});

test("sector público por nombre y excepciones a mano", () => {
  const cfg = CONFIG_DEFECTO;
  assert.ok(sectorDe(1, "MINISTERIO DEL INTERIOR", cfg).publico);
  assert.ok(sectorDe(1, "Fundación hospital de pediatría prof. Juan P. Garrahan", cfg).publico);
  assert.ok(sectorDe(1, "Administración Nacional De Medicamentos Alimentos Y Tecnología Medica", cfg).publico);
  assert.ok(sectorDe(1, "Gobierno de la Ciudad de Buenos Aires", cfg).publico);
  assert.ok(!sectorDe(1, "ADMINISTRACION MORINIGO", cfg).publico);
  assert.ok(!sectorDe(1, "ORDEN DE SAN AGUSTIN", cfg).publico);
  const manual = leerConfigCobranzas({ publicos: [9605], privados: [4316] });
  assert.deepEqual(sectorDe(9605, "ORDEN DE SAN AGUSTIN", manual), { publico: true, origen: "manual" });
  assert.deepEqual(sectorDe(4316, "Fundación hospital Garrahan", manual), { publico: false, origen: "manual" });
});

test("config inválida vuelve a los valores por defecto", () => {
  assert.deepEqual(leerConfigCobranzas(null), CONFIG_DEFECTO);
  const c = leerConfigCobranzas({ patron: "([", publicos: [1, "x", -2], diasSinPlazo: 999 });
  assert.equal(c.patron, CONFIG_DEFECTO.patron);
  assert.deepEqual(c.publicos, [1]);
  assert.equal(c.diasSinPlazo, 30);
});

test("concentración: top 10 y HHI sobre clientes con saldo positivo", () => {
  const r = concentracion([50, 30, 20, -5], 95);
  assert.ok(Math.abs(r.mayorPct! - (50 / 95) * 100) < 1e-9);
  assert.ok(Math.abs(r.top10Pct! - (100 / 95) * 100) < 1e-9);
  assert.ok(Math.abs(r.hhi! - (((50 / 95) * 100) ** 2 + ((30 / 95) * 100) ** 2 + ((20 / 95) * 100) ** 2)) < 1e-6);
  assert.deepEqual(concentracion([], 0), { top10Pct: null, hhi: null, mayorPct: null });
});

test("no llamar: pagó al menos la mitad y nadie lo imputó", () => {
  assert.ok(noLlamar({ saldo: 928920, sinImputar: 8015000 }));
  assert.ok(!noLlamar({ saldo: 208_000_000, sinImputar: 0 }));
  assert.ok(!noLlamar({ saldo: 100, sinImputar: 40 }));
});

test("rechazos en riesgo contra compensados", () => {
  assert.equal(rechazoEnRiesgo({ rechazado: 6544309, otrosDebitos: 0, sinImputar: 0 }), 6544309); // OCRE
  assert.equal(rechazoEnRiesgo({ rechazado: 7139306, otrosDebitos: 0, sinImputar: 7339865 }), 0); // Se Fers
  assert.equal(rechazoEnRiesgo({ rechazado: 2139280, otrosDebitos: 0, sinImputar: 2139280 }), 0); // Modular Forma
  assert.equal(rechazoEnRiesgo({ rechazado: 100, otrosDebitos: 50, sinImputar: 80 }), 70);
  assert.equal(rechazoEnRiesgo({ rechazado: 0, otrosDebitos: 6585425, sinImputar: 6585425 }), 0);
});

test("posibles facturas duplicadas: mismo cliente, día e importe", () => {
  const d = posiblesDuplicadas([
    { partnerId: 1, fecha: "2026-10-08", total: 34339351, nombre: "FA-B 585" },
    { partnerId: 1, fecha: "2026-10-08", total: 34339351, nombre: "FA-B 586" },
    { partnerId: 1, fecha: "2026-09-08", total: 34339351, nombre: "FA-B 500" },
    { partnerId: 2, fecha: "2026-10-08", total: 34339351, nombre: "FA-B 587" },
    // una factura en cuotas (dos líneas del mismo comprobante) no es duplicada
    { partnerId: 3, fecha: "2026-10-01", total: 500, nombre: "FA-A 1183" },
    { partnerId: 3, fecha: "2026-10-01", total: 500, nombre: "FA-A 1183" },
  ]);
  assert.deepEqual(d.get(1), [["FA-B 585", "FA-B 586"]]);
  assert.equal(d.has(2), false);
  assert.equal(d.has(3), false);
});

test("refacturación no es duplicada: Ministerio, FA-B 585 y 586 reemplazan a 513 y 583 (anuladas con NC)", async () => {
  const { refacturaciones } = await import("./cobranzas-reglas.ts");
  const facturas = [
    { partnerId: 1, fecha: "2026-10-08", total: 34339351, nombre: "FA-B 585" },
    { partnerId: 1, fecha: "2026-10-08", total: 34339351, nombre: "FA-B 586" },
  ];
  const ncs = [
    { partnerId: 1, fecha: "2026-10-08", anula: "FA-B 513" },
    { partnerId: 1, fecha: "2026-10-08", anula: "FA-B 583" },
  ];
  assert.equal(posiblesDuplicadas(facturas, ncs).has(1), false);
  assert.deepEqual(refacturaciones(facturas, ncs).get(1), [{ nuevas: ["FA-B 585", "FA-B 586"], anuladas: ["FA-B 513", "FA-B 583"], fecha: "2026-10-08" }]);
  // Una sola NC no explica las dos: sigue siendo "¿duplicada?".
  assert.deepEqual(posiblesDuplicadas(facturas, ncs.slice(0, 1)).get(1), [["FA-B 585", "FA-B 586"]]);
  // Una NC que anula una del propio grupo no explica nada (eso es corregir un duplicado).
  assert.deepEqual(posiblesDuplicadas(facturas, [...ncs.slice(0, 1), { partnerId: 1, fecha: "2026-10-08", anula: "FA-B 586" }]).get(1), [["FA-B 585", "FA-B 586"]]);
  // Otro cliente, o más de 10 días, no cuenta.
  assert.equal(posiblesDuplicadas(facturas, ncs.map((n) => ({ ...n, partnerId: 2 }))).has(1), true);
  assert.equal(posiblesDuplicadas(facturas, ncs.map((n) => ({ ...n, fecha: "2026-09-01" }))).has(1), true);
});

test("DSO con ventana corta al principio", () => {
  assert.equal(ventanaDso("2025-11-30", "2025-10-24"), 38);
  assert.equal(ventanaDso("2026-09-30", "2025-10-24"), 90);
  assert.equal(dso(100, 300, 90), 30);
  assert.equal(dso(100, 0, 90), null);
  assert.equal(dso(null, 10, 90), null);
  const diaria = new Map([["2026-07-02", 10], ["2026-09-30", 5], ["2026-10-01", 7]]);
  // (fin − 90, fin]: el 02/07 queda afuera de los 90 días al 30/09
  assert.equal(sumaVentana(diaria, "2026-09-30", 90), 5);
  assert.equal(sumaVentana(diaria, "2026-09-30", 91), 15);
});

test("prorrateo del cobrado: dinero, retenciones y ajustes", () => {
  const r = prorratearCobro([
    { codigo: "1.1.3.01.010", balance: -1000 },
    { codigo: "1.1.1.02.003", balance: 900 },
    { codigo: "1.1.4.02.020", balance: 100 },
    { codigo: "6.0.0.00.020", balance: 50 },
    { codigo: "6.0.0.00.020", balance: -50 },
  ]);
  assert.deepEqual(r, { credito: 1000, dinero: 900, retenciones: 100, ajustes: 0 });
  const aj = prorratearCobro([
    { codigo: "1.1.3.01.010", balance: -1000 },
    { codigo: "999999", balance: 1000 },
  ]);
  assert.equal(aj.ajustes, 1000);
  assert.equal(aj.dinero + aj.retenciones, 0);
  // un asiento que no acredita Deudores no es cobro
  assert.equal(prorratearCobro([{ codigo: "1.1.3.01.010", balance: 500 }, { codigo: "1.1.1.02.01", balance: -500 }]).credito, 0);
});

test("medio de cobro por diario", () => {
  assert.equal(medioDeDiario("Cheques de Terceros", "cash"), "cheques");
  assert.equal(medioDeDiario("Banco Galicia PESOS", "bank"), "transferencia");
  assert.equal(medioDeDiario("Caja Efectivo PESOS", "cash"), "efectivo");
  assert.equal(medioDeDiario("Miscellaneous Operations", "general"), "otro");
});

test("promedio ponderado y meses", () => {
  assert.equal(promedioPonderado([{ valor: 10, peso: 1 }, { valor: 20, peso: 3 }]), 17.5);
  assert.equal(promedioPonderado([]), null);
  assert.deepEqual(mesesEntre("2025-11-01", "2026-02-15"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("cambios de sector a mano: se agregan, se sacan y no pisan al resto", () => {
  const base = leerConfigCobranzas({ publicos: [1, 2], privados: [3] });
  const c = aplicarCambiosSector(base, [
    { partnerId: 2, sector: "privado" },
    { partnerId: 3, sector: "regla" },
    { partnerId: 9, sector: "publico" },
  ]);
  assert.deepEqual(c.publicos, [1, 9]);
  assert.deepEqual(c.privados, [2]);
  assert.equal(c.patron, base.patron);
});
