// Reglas puras de Caja: cuentas quietas, semanas, cheques, aging, gastos promedio,
// retiros, flujo y cobertura. Y que lo reservado (retiros, dividendos) no viaje sin socios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificarCuentas,
  cobertura,
  colchonSugerido,
  esLineaRetiro,
  esPublico,
  estadoCheque,
  fechaPagoIva,
  fechasDelDia,
  filasFlujo,
  indiceSemana,
  lunesAnterior,
  mesesCerrados,
  nombreCorto,
  porSemana,
  repartir,
  retiroNetoUsd,
  semanal,
  semanasDesde,
  sumarMeses,
  supuestosDeGastos,
  totalesCaja,
  tramoPorDias,
  vencimiento,
  type Concepto,
  type GrupoCaja,
  type LineaRetiro,
  cifraCobertura,
  conRetiros,
} from "./caja-reglas.ts";
import { decisionesYOraciones, resumenCaja, type DetalleCaja } from "./caja.ts";
import { filtrarReservado } from "../reservado.ts";
import { nodoSemana } from "../desglose/caja.ts";
import type { ResultadoCalculador } from "../tipos.ts";

const HOY = "2026-10-15";

const g = (cuentaId: number, etiqueta: string, balance: number, ultima: string, moneda = "ARS", amountCurrency = balance): GrupoCaja => ({ cuentaId, etiqueta, moneda, balance, amountCurrency, ultima });

test("cuentas: la quieta que pesa más del 5 % queda a verificar y fuera; la chica se suma", () => {
  const cuentas = clasificarCuentas(
    [
      g(1, "1.1.2.01.05 Inversiones FIMA", 200_000_000, "2026-10-15"),
      g(2, "1.1.2.01.04 Financiera Borelli", 450_000_000, "2025-12-02"),
      g(3, "1.1.1.01.02 Caja chica", 500_000, "2026-03-12"),
      g(4, "1.1.1.01.06 Valores a depositar", 12_000_000, "2026-10-15"),
      g(5, "1.1.1.01.002 Caja efectivo dólares - Empresa", 380_000_000, "2026-10-13", "USD", 270_000),
      g(6, "1.1.1.02.05 Tarjeta corporativa", 0, "2026-08-27"),
    ],
    { 1: 30, 4: 40, 5: 10 },
    1600,
    HOY,
  );
  const por = Object.fromEntries(cuentas.map((c) => [c.id, c]));
  assert.equal(por[2].estado, "a_verificar");
  assert.equal(por[2].enTotal, false);
  assert.equal(por[2].diasSinMovimiento, 317);
  assert.equal(por[3].estado, "quieta");
  assert.equal(por[3].enTotal, true);
  assert.equal(por[4].estado, "no_es_caja");
  assert.equal(por[4].enTotal, false);
  // Dólares: amount_currency × dólar de hoy (no el balance sin revaluar).
  assert.equal(por[5].moneda, "USD");
  assert.equal(por[5].saldoArs, 270_000 * 1600);
  assert.equal(por[5].sinArqueo, true);
  // La tarjeta en cero y sin movimientos no aparece.
  assert.equal(por[6], undefined);
  const t = totalesCaja(cuentas);
  assert.equal(t.disponibleArs, 200_000_000 + 500_000 + 270_000 * 1600);
  assert.equal(t.pesosArs, 200_500_000);
  assert.equal(t.dolaresUsd, 270_000);
  assert.equal(t.aVerificarArs, 450_000_000);
});

test("cuentas: sin dólar de hoy, la de dólares queda al valor contable (no se inventa)", () => {
  const [c] = clasificarCuentas([g(5, "1.1.1.01.002 Caja USD", 380_000_000, "2026-10-13", "USD", 270_000)], {}, null, HOY);
  assert.equal(c.saldoArs, 380_000_000);
  assert.equal(c.saldoUsd, 270_000);
});

test("semanas: bloques de 7 días desde hoy; lo vencido va a S1 sólo si se pide", () => {
  const s = semanasDesde(HOY, 8);
  assert.equal(s.length, 8);
  assert.deepEqual([s[0].desde, s[0].hasta, s[0].etiqueta], ["2026-10-15", "2026-10-21", "15/10–21/10"]);
  assert.equal(s[7].hasta, "2026-12-09");
  assert.equal(indiceSemana("2026-10-18", s), 0);
  assert.equal(indiceSemana("2026-10-28", s), 1);
  assert.equal(indiceSemana("2026-12-12", s), -1);
  assert.equal(indiceSemana("2026-10-10", s), -1);
  assert.equal(indiceSemana("2026-10-10", s, true), 0);
});

test("fechas de pago: día fijo del mes, después de hoy y dentro del horizonte", () => {
  assert.deepEqual(fechasDelDia(4, HOY, "2026-12-09"), ["2026-11-04", "2026-12-04"]);
  assert.deepEqual(fechasDelDia(15, HOY, "2026-12-09"), ["2026-11-15"]); // hoy no cuenta
  assert.deepEqual(fechasDelDia(17, HOY, "2026-12-09"), ["2026-10-17", "2026-11-17"]);
  assert.deepEqual(fechasDelDia(10, "2026-12-20", "2027-02-14"), ["2027-01-10", "2027-02-10"]);
  assert.equal(fechaPagoIva("2026-07"), "2026-10-20");
  assert.equal(fechaPagoIva("2026-11"), "2027-02-20");
  assert.equal(sumarMeses("2026-01", -2), "2025-11");
  assert.deepEqual(mesesCerrados(HOY, 3), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(mesesCerrados("2026-02-03", 3), ["2025-11", "2025-12", "2026-01"]);
});

test("cheques: a fecha, vencido reciente (≤ 7 días) y a verificar", () => {
  assert.equal(estadoCheque("2026-10-15", HOY), "a_fecha");
  assert.equal(estadoCheque("2026-10-08", HOY), "vencido_reciente");
  assert.equal(estadoCheque("2026-10-07", HOY), "vencido_a_verificar");
});

test("por pagar: tramos por días y vencimiento sin plazo = fecha de factura", () => {
  assert.equal(tramoPorDias(0), "no_vencido");
  assert.equal(tramoPorDias(-5), "no_vencido");
  assert.equal(tramoPorDias(30), "d1_30");
  assert.equal(tramoPorDias(31), "d31_60");
  assert.equal(tramoPorDias(90), "d61_90");
  assert.equal(tramoPorDias(91), "d90_mas");
  assert.equal(vencimiento(false, "2026-09-29"), "2026-09-29");
  assert.equal(vencimiento("2026-10-30", "2026-09-29"), "2026-10-30");
  assert.equal(vencimiento(false, false), null);
});

test("sector público por nombre, sin acentos", () => {
  assert.equal(esPublico("MINISTERIO DEL INTERIOR"), true);
  assert.equal(esPublico("Administración Nacional De Medicamentos"), true);
  assert.equal(esPublico("Fundación hospital de pediatría Garrahan"), true);
  assert.equal(esPublico("Copimex CACISA"), false);
  assert.equal(esPublico(null), false);
});

test("gastos promedio: sin sueldos, subalquiler, circuitos especiales ni el alquiler compensado", () => {
  const s = supuestosDeGastos(
    [
      { codigo: "4.2.1.03.01", balance: 30 }, { codigo: "4.2.1.04.01", balance: 60 },
      { codigo: "4.2.1.03.02", balance: 6 }, { codigo: "4.2.1.04.02", balance: 9 },
      { codigo: "4.2.1.04.13", balance: 30 }, { codigo: "4.2.1.04.15", balance: 30 }, { codigo: "4.2.1.04.18", balance: 3 },
      { codigo: "4.2.1.04.09", balance: 9 }, { codigo: "4.2.1.04.10", balance: 3 },
      { codigo: "4.2.1.07.03", balance: 12 },
      { codigo: "4.2.1.03.12", balance: 15 },
      { codigo: "4.2.1.03.27", balance: 99 },
      { codigo: "4.2.1.03.18", balance: 40 },
      { codigo: "4.2.1.01.02", balance: 21 },
      { codigo: "4.2.1.04.06", balance: 6 },
      { codigo: "4.2.1.04.19", balance: 500 }, // retiros cargados como gasto: no es gasto corriente
    ],
    3,
    39,
  );
  assert.equal(s.sueldosMes, 30);
  assert.equal(s.cargasMes, 5);
  assert.equal(s.noRegistradosMes, 21);
  assert.equal(s.fondoCeseMes, 4);
  assert.equal(s.iibbMes, 4);
  assert.equal(s.subalquilerMes, 5);
  assert.equal(s.gastosCorrientesMes, (40 - 39 + 21 + 6) / 3);
  assert.equal(colchonSugerido(s), 30 + 5 + 21);
  assert.equal(semanal(52), 12);
});

test("retiros: sin dolarizaciones ni adelantos; cada línea a su dólar", () => {
  const l = (p: Partial<LineaRetiro>): LineaRetiro => ({ fecha: "2026-09-10", codigoCuenta: "1.1.4.02.09", texto: "", nombre: "", balance: 0, amountCurrency: 0, moneda: "ARS", ...p });
  const lineas = [
    l({ balance: 1_000_000 }),
    l({ balance: -400_000, texto: "Vario/2026/09 (Dolarización retiros septiembre)" }),
    l({ codigoCuenta: "4.2.1.04.19", nombre: "RETIRO SOCIO GS", moneda: "USD", amountCurrency: 5000, balance: 7_000_000 }),
    l({ codigoCuenta: "4.2.1.04.19", nombre: "Adelanto carpintería", balance: 1_820_000 }),
    l({ codigoCuenta: "1.1.4.02.03", balance: 9_999_999 }),
  ];
  assert.deepEqual(lineas.map(esLineaRetiro), [true, false, true, false, false]);
  assert.equal(retiroNetoUsd(lineas, () => 1000), 1000 + 5000);
  assert.equal(retiroNetoUsd([l({ balance: 1 })], () => null), null);
});

const concepto = (p: Partial<Concepto>): Concepto => ({ id: "x", concepto: "x", tipo: "egreso", origen: "comprometido", escenarios: ["comprometido", "proyectado"], fuente: "", porSemana: repartir(0, 0), ...p });

test("flujo y cobertura: el saldo en pesos cae debajo del colchón → fecha del día anterior", () => {
  const s = semanasDesde(HOY, 8);
  const conceptos = [
    concepto({ id: "cobranza", tipo: "ingreso", origen: "estimado", escenarios: ["proyectado"], porSemana: s.map(() => 10) }),
    concepto({ id: "cheques", porSemana: porSemana([{ indice: 1, ars: 50 }, { indice: 6, ars: 30 }, { indice: -1, ars: 999 }]) }),
  ];
  const comp = filasFlujo(s, conceptos, "comprometido", 300, 100);
  assert.deepEqual(comp.map((f) => f.pesos), [100, 50, 50, 50, 50, 50, 20, 20]);
  assert.equal(comp[7].saldo, 220);
  const c = cobertura(comp, 40);
  assert.equal(c.mas, false);
  assert.equal(c.cae, 6);
  assert.equal(c.fecha, "2026-11-25");
  assert.equal(c.prefijo, "Hasta el");
  assert.equal(c.faltaArs, 20);
  const proy = filasFlujo(s, conceptos, "proyectado", 300, 100);
  const cp = cobertura(proy, 40);
  assert.equal(cp.mas, true);
  assert.equal(cp.fecha, "2026-12-09");
  assert.equal(cp.prefijo, "Bien hasta el");
});

test("varios: lunes anterior y nombres cortos", () => {
  assert.equal(lunesAnterior("2026-10-15"), "2026-10-12"); // jueves
  assert.equal(lunesAnterior("2026-10-12"), "2026-10-05"); // lunes
  assert.equal(lunesAnterior("2026-10-18"), "2026-10-12"); // domingo
  assert.equal(nombreCorto("Banco Galicia cta cte en pesos"), "Galicia");
  assert.equal(nombreCorto("Financiera Borelli"), "Borelli");
  assert.equal(nombreCorto("Caja efectivo dólares - Empresa"), "Caja efectivo dólares");
});

// ─── Decisiones, narrativa y recorte de lo reservado ───────────────────────────────────

function detalleDePrueba(): DetalleCaja {
  const s = semanasDesde(HOY, 8);
  const cuentas = clasificarCuentas(
    [g(10, "1.1.1.02.01 Banco Galicia cta cte en pesos", 4_000_000, "2026-10-15"), g(11, "1.1.2.01.05 Inversiones FIMA", 300_000_000, "2026-10-15"), g(12, "1.1.2.01.04 Financiera Borelli", 450_000_000, "2025-12-02")],
    {},
    1600,
    HOY,
  );
  const totales = totalesCaja(cuentas);
  const conceptos = [
    concepto({ id: "cheques_propios", concepto: "Cheques propios entregados", porSemana: porSemana([{ indice: 0, ars: 7_500_000 }]) }),
    concepto({ id: "iva_2026-07", concepto: "IVA de julio (asentado, sin pagar)", porSemana: porSemana([{ indice: 0, ars: 27_600_000 }]) }),
    concepto({ id: "retiros", concepto: "Retiros de socios", origen: "estimado", escenarios: ["proyectado"], porSemana: s.map(() => 10_000_000), reservado: true }),
  ];
  const flujoDe = (cs: Concepto[]) => ({ proyectado: filasFlujo(s, cs, "proyectado", totales.disponibleArs, totales.pesosArs), comprometido: filasFlujo(s, cs, "comprometido", totales.disponibleArs, totales.pesosArs) });
  const escenarios = flujoDe(conceptos.filter((c) => !c.reservado));
  const escSocios = flujoDe(conceptos);
  const colchon = 250_000_000;
  return {
    hoy: HOY,
    cuentas,
    totales,
    cuentaDebitoId: 10,
    cheques: { registro: { cant: 0, ars: 0 }, contableArs: 0, aFecha: { cant: 0, ars: 0 }, recientes: { cant: 0, ars: 0 }, aVerificar: { cant: 0, ars: 0, principal: null }, despuesArs: 0, lista: [] },
    propios: { cant: 1, ars: 7_500_000, enFlujoArs: 7_500_000, despuesArs: 0, lista: [{ id: 1, numero: "510", proveedor: "Metalúrgica Zech SRL (Turme)", ars: 7_500_000, fecha: "2026-10-18", enFlujo: true, pagoId: null }] },
    porPagar: { ars: 0, facturas: 0, vencidoArs: 0, aging: [], top: [], venceEnHorizonteArs: 0 },
    flujo: {
      semanas: s,
      saldoInicialArs: totales.disponibleArs,
      saldoInicialPesosArs: totales.pesosArs,
      conceptos: conceptos.filter((c) => !c.reservado),
      escenarios,
      cobertura: { proyectado: cobertura(escenarios.proyectado, colchon), comprometido: cobertura(escenarios.comprometido, colchon) },
      escenarioDefecto: "proyectado",
      colchon: { ars: colchon, sugeridoArs: colchon, editado: false },
      supuestos: { sueldosMes: 0, cargasMes: 0, noRegistradosMes: 0, fondoCeseMes: 0, iibbMes: 0, gastosCorrientesMes: 0, subalquilerMes: 0, cobranzaSemanalArs: null },
      fuera: [],
      faltantes: [],
    },
    reservado: {
      conceptos: conceptos.filter((c) => c.reservado),
      fuera: [{ id: "dividendos", concepto: "Dividendos pendientes de pago", ars: 60_000_000, nota: [] }],
      retirosSemanalesArs: 10_000_000,
      flujo: { escenarios: escSocios, cobertura: { proyectado: cobertura(escSocios.proyectado, colchon), comprometido: cobertura(escSocios.comprometido, colchon) } },
    },
  };
}

test("decisiones de caja: fondear la cuenta de los cheques, la cuenta quieta y el colchón", () => {
  const d = conRetiros(detalleDePrueba());
  const { decisiones, oraciones } = decisionesYOraciones(d);
  const ids = decisiones.map((x) => x.id);
  assert.ok(ids.includes("cheques_propios"), "Galicia 4 M contra 35,1 M comprometidos esta semana");
  assert.ok(ids.includes("cuenta_quieta_12"));
  // Proyectado: 304 M de pesos − 35,1 M − 10 M de retiros por semana caen debajo de 250 M en la S2.
  assert.ok(ids.includes("cobertura"));
  assert.equal(oraciones[0].id, "caja");
  assert.ok(oraciones.some((o) => o.id === "fondeo"));
  // Ninguna decisión de caja menciona retiros.
  assert.ok(!JSON.stringify(decisiones).includes("Retiros"));
});

test("sin direccion-socios no viajan los retiros ni los dividendos del flujo", () => {
  const d = detalleDePrueba();
  const r: ResultadoCalculador<DetalleCaja> = { pantalla: "caja", cifras: [], detalle: d, avisos: [], tc: { valor: 1600, fecha: HOY } };
  const sin = filtrarReservado(r, false);
  const json = JSON.stringify(sin);
  assert.equal(sin.detalle.reservado, undefined);
  assert.ok(!json.includes("Retiros de socios"));
  assert.ok(!json.includes("Dividendos"));
  assert.ok(JSON.stringify(filtrarReservado(r, true)).includes("Dividendos"));
  const res = resumenCaja(r);
  assert.equal(res.escenario, "proyectado");
  assert.equal(res.sparkPesos.length, 8);
  assert.ok(!JSON.stringify(res).includes("Retiros de socios"));
});

test("sin direccion-socios el flujo no trae los retiros ni en los totales; con socios, sí", () => {
  const d = detalleDePrueba();
  const r: ResultadoCalculador<DetalleCaja> = { pantalla: "caja", cifras: [], detalle: d, avisos: [], tc: { valor: 1600, fecha: HOY } };
  const sin = filtrarReservado(r, false).detalle;
  // Lo que se ve (renglones) suma exactamente lo que sale: no queda una diferencia que delate los retiros.
  for (const [i, sem] of sin.flujo.escenarios.proyectado.entries()) {
    const visibles = sin.flujo.conceptos.filter((c) => c.tipo === "egreso" && c.escenarios.includes("proyectado")).reduce((a, c) => a + (c.porSemana[i] ?? 0), 0);
    assert.equal(sem.sale, visibles);
  }
  assert.equal(conRetiros(sin), sin, "sin socios no hay flujo reservado para usar");
  const con = conRetiros(filtrarReservado(r, true).detalle);
  assert.equal(con.flujo.escenarios.proyectado[1].sale - sin.flujo.escenarios.proyectado[1].sale, 10_000_000);
  // La cobertura de socios abre el nodo reservado; la pública, el público.
  assert.equal(cifraCobertura(con, "proyectado").nodo?.tipo, "coberturaSocios");
  assert.equal(cifraCobertura(sin, "proyectado").nodo?.tipo, "cobertura");
  // resumenCaja con el resultado recortado: el mini-gráfico de cada uno sale de su flujo.
  const resSin = resumenCaja(filtrarReservado(r, false));
  const resCon = resumenCaja(filtrarReservado(r, true));
  assert.equal(resSin.sparkPesos[7].pesos - resCon.sparkPesos[7].pesos, 80_000_000);
});

test("desglose de una semana: sin socios, sin retiros y el total cierra; con socios, con retiros", () => {
  const d = detalleDePrueba();
  const nodo = nodoSemana({ tipo: "semanaFlujo", v: "2", e: "proyectado" }, d, false);
  const publico = JSON.stringify(nodo);
  assert.ok(!publico.includes("Retiros de socios"));
  assert.ok(!publico.includes("Reservado"));
  const salePub = nodo.secciones.find((x) => x.titulo === "Sale")!;
  assert.ok(salePub.cierre && "suma" in salePub.cierre && salePub.cierre.suma.ars === salePub.cierre.cifra.ars);
  const socios = nodoSemana({ tipo: "semanaFlujoSocios", v: "2", e: "proyectado" }, d, true);
  assert.ok(JSON.stringify(socios).includes("Retiros de socios"));
  const sale = socios.secciones.find((x) => x.titulo === "Sale")!;
  assert.ok(sale.cierre && "suma" in sale.cierre && sale.cierre.suma.ars === sale.cierre.cifra.ars);
});
