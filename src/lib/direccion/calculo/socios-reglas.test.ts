import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agregarCircuitos, agregarRetiros, avisosRetiros, clasificarLinea, desvioContraPolitica, etiquetaRango, leerPolitica, listaMeses,
  mesesEntre, moverMes, retirosSobreResultado, usdDeLinea, type LineaSocios,
} from "./socios-reglas.ts";
import { resultadoPorMes, codigoDeCuenta, mesDeGrupo } from "./pyg-reglas.ts";

const dolar = [
  { fecha: "2025-11-01", valor: 1500 },
  { fecha: "2025-12-01", valor: 1500 },
  { fecha: "2026-01-01", valor: 1450 },
  { fecha: "2026-02-01", valor: 1600 },
];

let id = 0;
const L = (p: Partial<LineaSocios> & Pick<LineaSocios, "fecha" | "codigo" | "balance">): LineaSocios => ({
  id: ++id, asiento: "X/1", asientoId: id, nombre: "", montoMoneda: p.balance, moneda: "ARS", ...p,
});

test("clasificarLinea: cuentas particulares, dolarización y gasto 4.2.1.04.19", () => {
  assert.deepEqual(clasificarLinea(L({ fecha: "2026-01-05", codigo: "1.1.4.02.09", balance: 100 })), { tipo: "particular", socio: "jorge" });
  assert.equal(clasificarLinea(L({ fecha: "2026-01-31", codigo: "1.1.4.02.09", balance: -100, asiento: "Vario/1 (Dolarización retiros JR ene-2026)" })).tipo, "excluida");
  assert.equal(clasificarLinea(L({ fecha: "2025-11-01", codigo: "1.1.4.02.10", balance: 5, asiento: "Vario (Reclasificación temporal retiros GS (2/2))" })).tipo, "excluida");
  assert.deepEqual(clasificarLinea(L({ fecha: "2026-01-31", codigo: "1.1.4.02.12", balance: 1, asiento: "Vario (Dolarización retiros GS)" })), { tipo: "dolarizacion", socio: "gabriel" });
  assert.deepEqual(clasificarLinea(L({ fecha: "2024-12-31", codigo: "1.1.4.02.11", balance: 1, asiento: "Vario (Retiros históricos Jorge Riveros 2024)" })), { tipo: "historico", socio: "jorge" });
  assert.deepEqual(clasificarLinea(L({ fecha: "2026-01-06", codigo: "4.2.1.04.19", balance: 1, nombre: "RETIRO SOCIO GS" })), { tipo: "gasto", partes: [{ socio: "gabriel", factor: 1 }] });
  assert.equal((clasificarLinea(L({ fecha: "2026-01-22", codigo: "4.2.1.04.19", balance: 1, nombre: "Fondeo cuenta socios con aportes de JR y GS" })) as { partes: unknown[] }).partes.length, 2);
  assert.equal(clasificarLinea(L({ fecha: "2026-10-06", codigo: "4.2.1.04.19", balance: 1, nombre: "Adelanto por carpintería" })).tipo, "no_retiro");
  assert.deepEqual(clasificarLinea(L({ fecha: "2026-08-10", codigo: "2.1.5.01.00", balance: 30, nombre: "DIV-2024 JR" })), { tipo: "dividendo", socio: "jorge" });
  assert.equal(clasificarLinea(L({ fecha: "2025-02-28", codigo: "2.1.5.01.00", balance: -90, nombre: "DIV-2024 GS" })).tipo, "dividendo_declarado");
  assert.equal(clasificarLinea(L({ fecha: "2026-08-10", codigo: "2.1.5.01.00", balance: 30, nombre: "DIV-2024" })).tipo, "sin_clasificar");
});

test("usdDeLinea: la línea en USD vale su amount_currency; la de pesos, al dólar de su fecha", () => {
  assert.equal(usdDeLinea({ moneda: "USD", montoMoneda: 830, balance: 1_157_020, fecha: "2025-11-07" }, dolar), 830);
  assert.equal(usdDeLinea({ moneda: "ARS", montoMoneda: 3_000, balance: 3_000, fecha: "2026-02-10" }, dolar), 3_000 / 1600);
  // Sin cotización para la fecha: no se inventa.
  assert.equal(usdDeLinea({ moneda: "ARS", montoMoneda: 3_000, balance: 3_000, fecha: "2025-10-30" }, dolar), null);
});

test("agregarRetiros: neto = débitos − créditos + gasto; dividendos aparte; pesos de cada mes", () => {
  const lineas = [
    L({ fecha: "2026-01-05", codigo: "1.1.4.02.09", balance: 1_450_000 }), // 1.000 USD
    L({ fecha: "2026-01-10", codigo: "1.1.4.02.09", balance: -145_000 }), // −100 USD (devolución)
    L({ fecha: "2026-01-06", codigo: "4.2.1.04.19", balance: 1_644_920, montoMoneda: 1180, moneda: "USD", nombre: "RETIRO SOCIO JR" }),
    L({ fecha: "2026-01-22", codigo: "4.2.1.04.19", balance: 2_000, montoMoneda: 2, moneda: "USD", nombre: "Fondeo cuenta socios" }),
    L({ fecha: "2026-01-31", codigo: "1.1.4.02.09", balance: -1_305_000, asiento: "Vario (Dolarización retiros JR ene-2026)" }),
    L({ fecha: "2026-01-31", codigo: "1.1.4.02.11", balance: 1_305_000, montoMoneda: 900, moneda: "USD", asiento: "Vario (Dolarización retiros JR ene-2026)" }),
    L({ fecha: "2026-02-10", codigo: "2.1.5.01.00", balance: 1_600_000, nombre: "DIV-2024 GS" }), // 1.000 USD
    L({ fecha: "2026-02-11", codigo: "1.1.4.02.10", balance: 160_000 }),
    L({ fecha: "2026-02-12", codigo: "4.2.1.04.19", balance: 50_000, nombre: "Adelanto carpintería" }),
    L({ fecha: "2025-11-02", codigo: "1.1.4.02.03", balance: -44_300_000 }),
    L({ fecha: "2025-02-28", codigo: "2.1.5.01.00", balance: -3_000_000, nombre: "DIV-2024 GS" }),
    L({ fecha: "2024-12-31", codigo: "1.1.4.02.11", balance: 1, montoMoneda: 5_000, moneda: "USD", asiento: "Vario (Retiros históricos Jorge Riveros 2024)" }),
  ];
  const a = agregarRetiros(lineas, dolar, { desde: "2026-01", hasta: "2026-02" });
  assert.deepEqual(a.meses.map((m) => m.mes), ["2026-01", "2026-02"]);
  const ene = a.meses[0].socios.jorge;
  assert.equal(ene.bruto.ars, 1_450_000 + 1_644_920 + 1_000);
  assert.equal(ene.compensaciones.ars, -145_000);
  assert.equal(ene.neto.usd, 1000 - 100 + 1180 + 1);
  assert.equal(ene.comoGasto.usd, 1181);
  assert.equal(ene.dolarizadoOdooUsd, 900);
  assert.equal(ene.sinDolarizar, false);
  // Gabriel en enero: sólo la mitad del fondeo; sin dolarizar pero sin movimientos en la cuenta.
  assert.equal(a.meses[0].socios.gabriel.neto.usd, 1);
  assert.equal(a.meses[0].socios.gabriel.conMovimientos, false);
  const feb = a.meses[1];
  assert.equal(feb.parcial, true);
  assert.equal(feb.socios.gabriel.dividendos.usd, 1000);
  assert.equal(feb.socios.gabriel.total.usd, 1000 + 100);
  assert.equal(feb.total.ars, 1_600_000 + 160_000);
  // Sin dolarizar: sólo el mes en que alguien con movimientos no tiene el asiento.
  assert.deepEqual(a.mesesSinDolarizar, ["2026-02"]);
  assert.deepEqual(a.ultimaDolarizacion?.mes, "2026-01");
  // Saldos: pendiente = saldo de la cuenta en pesos (con la dolarización); acumulado = históricos + dolarizaciones.
  assert.equal(a.socios[0].pendienteDolarizar.ars, 1_450_000 - 145_000 - 1_305_000);
  assert.equal(a.socios[1].pendienteDolarizar.ars, 160_000);
  assert.equal(a.socios[0].saldoUsdOdoo, 5_900);
  assert.deepEqual(a.socios[0].acumulado.map((p) => p.usd), [5_000, 5_900]);
  assert.equal(a.sinAsignar.ars, -44_300_000);
  assert.equal(a.dividendosPendientes.ars, 3_000_000 - 1_600_000);
  assert.equal(a.noRetiro.length, 1);
  assert.equal(a.socios[1].anio.dividendos.usd, 1000);
  assert.equal(a.socios[0].anio.total.usd, 2081);
});

test("agregarRetiros: un movimiento sin dólar deja el USD en Sin dato (null), no en 0", () => {
  const a = agregarRetiros([L({ fecha: "2025-10-15", codigo: "1.1.4.02.09", balance: 100 })], dolar, { desde: "2025-10", hasta: "2025-10" });
  assert.equal(a.meses[0].socios.jorge.neto.usd, null);
  assert.equal(a.meses[0].socios.jorge.neto.ars, 100);
  assert.equal(a.sinDolar, 1);
});

test("retirosSobreResultado: sólo meses con resultado; null si no hay", () => {
  const a = agregarRetiros([L({ fecha: "2026-01-05", codigo: "1.1.4.02.09", balance: 1_450_000 })], dolar, { desde: "2026-01", hasta: "2026-02" });
  const r = retirosSobreResultado(a.meses, [{ mes: "2026-01", gestion: { ars: 14_500_000, usd: 10_000 } }]);
  assert.equal(r?.pctUsd, 10);
  assert.equal(r?.pctArs, 10);
  assert.equal(r?.desde, "2026-01");
  assert.equal(retirosSobreResultado(a.meses, []), null);
  // Resultado negativo: el % no tiene sentido.
  assert.equal(retirosSobreResultado(a.meses, [{ mes: "2026-01", gestion: { ars: -1, usd: -1 } }])?.pctUsd, null);
});

test("fechas y textos", () => {
  assert.deepEqual(mesesEntre("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(moverMes("2026-01", -1), "2025-12");
  assert.equal(moverMes("2026-10", -11), "2025-11");
  assert.equal(etiquetaRango("2026-01", "2026-09"), "ene–sep 2026");
  assert.equal(etiquetaRango("2025-11", "2026-09"), "nov-25 a sep-26");
  assert.equal(listaMeses(["2026-09", "2026-10"]), "septiembre y octubre");
  assert.equal(listaMeses(["2026-07", "2026-08", "2026-09"]), "julio, agosto y septiembre");
});

test("agregarCircuitos: mes en curso y 12 meses, con %", () => {
  const c = agregarCircuitos(
    [
      { diario: "Electrónica", mes: "2026-10", ars: 90 },
      { diario: "No ARCA", mes: "2026-10", ars: 10 },
      { diario: "Tango", mes: "2025-10", ars: 1000 }, // fuera de los 12 meses
      { diario: "No ARCA", mes: "2026-01", ars: 100 },
    ],
    "2026-10",
  );
  assert.deepEqual(c.mes.map((x) => [x.nombre, x.pct]), [["Electrónica", 90], ["No ARCA", 10]]);
  assert.deepEqual(c.doce.map((x) => [x.nombre, x.ars]), [["No ARCA", 110], ["Electrónica", 90]]);
});

test("política: se valida y el desvío es contra lo acordado, no entre personas", () => {
  assert.equal(leerPolitica({ proporcionJorge: 150 }), null);
  assert.equal(leerPolitica(null), null);
  const p = leerPolitica({ proporcionJorge: "60", topeResultadoPct: "", frecuencia: " mensual " })!;
  assert.deepEqual(p, { proporcionJorge: 60, topeResultadoPct: null, topeCajaPct: null, frecuencia: "mensual", nota: null });
  const d = desvioContraPolitica(
    [{ clave: "jorge", total: { ars: 700, usd: 70 } }, { clave: "gabriel", total: { ars: 300, usd: 30 } }],
    p,
  );
  assert.deepEqual(d[0].acordado, { ars: 600, usd: 60 });
  assert.deepEqual(d[0].desvio, { ars: 100, usd: 10 });
  assert.equal(d[0].enLinea, false);
  assert.deepEqual(d[1].desvio, { ars: -100, usd: -10 });
});

test("avisosRetiros: todos reservados; sin dolarizar, como gasto y débitos sin socio", () => {
  const lineas = [
    L({ fecha: "2026-09-05", codigo: "1.1.4.02.09", balance: 100 }),
    L({ fecha: "2026-08-31", codigo: "1.1.4.02.11", balance: 1, montoMoneda: 1, moneda: "USD", asiento: "Dolarización retiros JR ago-2026", creada: "2026-10-09 15:00:00", creador: "Juan Pablo Mansilla" }),
    L({ fecha: "2026-09-06", codigo: "4.2.1.04.19", balance: 1_600, montoMoneda: 1, moneda: "USD", nombre: "RETIRO SOCIO JR" }),
    L({ fecha: "2026-10-06", codigo: "4.2.1.04.19", balance: 1_818_181, nombre: "Adelanto carpintería", asiento: "FA-A 00002-00002324 (Adelanto)" }),
  ];
  const dol = [{ fecha: "2026-08-01", valor: 1600 }];
  const a = agregarRetiros(lineas, dol, { desde: "2026-08", hasta: "2026-10" });
  const av = avisosRetiros(a, "2026-10");
  assert.deepEqual(av.map((x) => x.id), ["retiros_sin_dolarizar", "retiros_gasto", "debito_4219"]);
  assert.ok(av.every((x) => x.reservado === true && x.origen === "auto"));
  assert.equal(av[0].quien, "Juan Pablo Mansilla");
  assert.deepEqual(av[0].aviso, ["Retiros de septiembre sin pasar a dólares en Odoo"]);
});

test("pyg: resultado de gestión sin ajustes; IIBB y cuadre aparte", () => {
  const r = resultadoPorMes([
    { codigo: "4.1.1.01.02", mes: "2026-09", balance: -1000 },
    { codigo: "4.2.1.03.01", mes: "2026-09", balance: 300 },
    { codigo: "4.2.1.07.03", mes: "2026-09", balance: 20 },
    { codigo: "888888", mes: "2026-09", balance: 50 },
    { codigo: "4.2.1.04.19", mes: "2026-09", balance: 70 },
    { codigo: "4.1.1.03.08", mes: "2026-09", balance: -5 },
  ]);
  assert.deepEqual(r["2026-09"], { mes: "2026-09", gestion: 680, ingresos: 1000, iibb: 20, cuadre: 50 });
  assert.equal(codigoDeCuenta([1, "1.1.4.02.09 Accionistas Cuenta Particular"]), "1.1.4.02.09");
  assert.equal(codigoDeCuenta(false), "");
  assert.equal(mesDeGrupo({ "date:month": "septiembre 2026", __range: { "date:month": { from: "2026-09-01", to: "2026-10-01" } } }), "2026-09");
  assert.equal(mesDeGrupo({ "date:month": "septiembre 2026" }), null);
});
