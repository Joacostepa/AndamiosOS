import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoManual, confianzaPorKpi, contarAvisos, detectarArmadoDevuelto, detectarCajaUsdSinRevaluar, detectarCheques, detectarCuadre,
  detectarCuentasQuietas, detectarExtractos, detectarFacturasSinPlazo, detectarIibbFaltante, detectarOrdenesPorObra, detectarSinAmortizar,
  detectarSinHistoria, detectarSinImputar, ordenarAvisos, unirAvisos,
} from "./calidad-reglas.ts";
import type { MesPyg } from "./pyg-reglas.ts";
import type { Aviso } from "../tipos.ts";

const HOY = "2026-10-15";

test("cuenta quieta: más de 30 días y más del 5 % de la caja; las chicas no avisan", () => {
  const av = detectarCuentasQuietas(
    [
      { codigo: "1.1.2.01.04", nombre: "Financiera Borelli", saldo: 451_760_895, saldoMoneda: 0, ultimo: "2025-12-02" },
      { codigo: "1.1.1.01.02", nombre: "Caja chica", saldo: 500_000, saldoMoneda: 0, ultimo: "2026-03-12" },
      { codigo: "1.1.2.01.05", nombre: "Inversiones FIMA", saldo: 600_000_000, saldoMoneda: 0, ultimo: "2026-10-15" },
    ],
    HOY,
  );
  assert.equal(av.length, 1);
  assert.equal(av[0].id, "cuenta_quieta_1.1.2.01.04");
  assert.equal(av[0].nivel, "ver");
  assert.equal(av[0].desde, "2025-12-02");
  assert.deepEqual(av[0].aviso[1], { valor: { tipo: "monto", monto: { ars: 451_760_895 } } });
  assert.deepEqual(detectarCuentasQuietas([], HOY), []);
});

test("caja en dólares: avisa si los libros no están al dólar de hoy", () => {
  const c = { codigo: "1.1.1.01.002", nombre: "Caja USD", saldo: 382_947_343, saldoMoneda: 273_571, ultimo: HOY };
  assert.equal(detectarCajaUsdSinRevaluar(c, 1617.3)?.id, "caja_usd_revaluacion");
  assert.equal(detectarCajaUsdSinRevaluar({ ...c, saldo: 273_571 * 1610 }, 1617.3), null);
  assert.equal(detectarCajaUsdSinRevaluar(c, null), null);
  assert.equal(detectarCajaUsdSinRevaluar(undefined, 1617.3), null);
});

test("cheques: registro ≠ contabilidad por más de 1 M", () => {
  const base = { registroArs: 52_397_440, registroCant: 35, aVerificarCant: 22, aVerificarArs: 23_968_673, contableArs: 11_970_646 };
  const a = detectarCheques(base)!;
  assert.equal(a.id, "cheques");
  assert.equal(typeof a.detalle?.[0], "string");
  assert.equal(detectarCheques({ ...base, contableArs: 52_000_000 }), null);
  assert.equal(detectarCheques({ ...base, contableArs: null }), null);
});

const pyg = (iibb: Record<string, number>, cuadre: Record<string, number> = {}): Record<string, MesPyg> =>
  Object.fromEntries(Object.keys({ ...iibb, ...cuadre }).map((mes) => [mes, { mes, gestion: 0, ingresos: 0, iibb: iibb[mes] ?? 0, cuadre: cuadre[mes] ?? 0 }]));

test("IIBB: un mes cerrado sin devengar se detecta contra el promedio de los anteriores (misma regla que Ventas)", () => {
  const p = pyg({ "2026-06": 15_199_667, "2026-07": 14_775_501, "2026-08": 18_348_033 });
  const av = detectarIibbFaltante(p, ["2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(av.length, 1);
  assert.equal(av[0].id, "iibb_2026-09");
  assert.equal(av[0].aviso[0], "Septiembre sin Ingresos Brutos devengados (~");
  // Promedio de jun–ago (~16,1 M), el mismo estimado que muestra Ventas.
  assert.deepEqual(av[0].aviso[1], { valor: { tipo: "monto", monto: { ars: (15_199_667 + 14_775_501 + 18_348_033) / 3 } } });
  // Sin historia (ningún mes previo con IIBB) no se acusa a nadie.
  assert.deepEqual(detectarIibbFaltante(pyg({}), ["2025-11", "2025-12"]), []);
});

test("cuadre y amortización", () => {
  assert.equal(detectarCuadre(pyg({}, { "2026-01": 46_808_511, "2026-05": -9_901_090 }), ["2026-01", "2026-05"])?.id, "cuadres");
  assert.equal(detectarCuadre(pyg({}, { "2026-01": 10 }), ["2026-01"]), null);
  assert.equal(detectarSinAmortizar({ activoArs: 603_199_288, amortizadoArs: 0 })?.id, "sin_amort");
  assert.equal(detectarSinAmortizar({ activoArs: 603_199_288, amortizadoArs: -5_000_000 }), null);
});

test("facturas sin plazo, sin imputar, extractos", () => {
  assert.deepEqual(detectarFacturasSinPlazo({ anio: "2026", total: 1793, sinPlazo: 1431 })?.aviso, ["80 % de las facturas 2026 sin plazo de pago"]);
  assert.equal(detectarFacturasSinPlazo({ anio: "2026", total: 100, sinPlazo: 10 }), null);
  assert.equal(detectarFacturasSinPlazo({ anio: "2026", total: 0, sinPlazo: 0 }), null);
  assert.equal(detectarSinImputar({ cant: 0, ars: 0 }), null);
  assert.equal(detectarSinImputar({ cant: 13, ars: -28_652_580 })?.nivel, "ver");
  const ex = detectarExtractos([{ diario: "Banco Galicia PESOS", cant: 30, ars: -44_220_788 }, { diario: "Caja Efectivo PESOS", cant: 2, ars: -290_000 }]);
  assert.deepEqual(ex.map((a) => a.id), ["extracto_banco_galicia_pesos"]);
});

test("órdenes por obra: sólo las obras con más de una orden", () => {
  const a = detectarOrdenesPorObra([
    { obraId: 44, obra: "25 de Mayo 179", orden: "S00084" },
    { obraId: 44, obra: "25 de Mayo 179", orden: "S00735" },
    { obraId: 7, obra: "Otra", orden: "S1" },
  ])!;
  assert.deepEqual(a.aviso, ["25 de Mayo 179: 2 órdenes abiertas para una misma obra"]);
  assert.equal(detectarOrdenesPorObra([{ obraId: 7, obra: "Otra", orden: "S1" }]), null);
  assert.equal(detectarArmadoDevuelto(0), null);
  assert.deepEqual(detectarArmadoDevuelto(82)?.aviso, ["82 órdenes \"Armado\" o \"Pendiente de desarme\" figuran devueltas en Alquiler"]);
});

test("sin historia: avisa hasta que se cumple un año", () => {
  assert.deepEqual(detectarSinHistoria("2025-11", "2026-10-15")?.aviso, ["Sin datos anteriores a noviembre 2025"]);
  assert.equal(detectarSinHistoria("2025-11", "2026-11-01"), null);
});

test("manuales, orden, unión y confianza", () => {
  const man = avisoManual({ id: "u1", clave: "caja_usd_arqueo", nivel: "ver", aviso: " Arqueo pendiente ", detalle: null, desde: null, afecta: ["caja_disponible"], quien: null, que: null, reservado: false })!;
  assert.equal(man.id, "manual_caja_usd_arqueo");
  assert.equal(man.origen, "manual");
  assert.equal(man.quien, "Sin asignar");
  assert.equal(avisoManual({ id: "u2", clave: null, nivel: "rojo", aviso: "x", detalle: null, desde: null, afecta: null, quien: null, que: null, reservado: null }), null);
  const res = avisoManual({ id: "u3", clave: null, nivel: "inf", aviso: "Ganancias personales", detalle: "d", desde: null, afecta: ["retiros"], quien: "Contador", que: "", reservado: true })!;
  assert.equal(res.reservado, true);

  const auto: Aviso[] = [
    { id: "x_inf", nivel: "inf", origen: "auto", aviso: ["i"], afecta: ["caja_disponible"], quien: "", que: "" },
    { id: "x_inc", nivel: "inc", origen: "auto", aviso: ["c"], afecta: ["resultado", "caja_disponible"], quien: "", que: "" },
    { id: "caja_usd_arqueo", nivel: "ver", origen: "auto", aviso: ["auto"], afecta: ["caja_disponible"], quien: "", que: "" },
  ];
  const u = unirAvisos(auto, [man, res]);
  // El manual con la misma clave que un automático no se repite; ⚠ primero.
  assert.deepEqual(u.map((a) => a.id), ["caja_usd_arqueo", "x_inc", "x_inf", "manual_u3"]);
  assert.deepEqual(ordenarAvisos([auto[0], auto[2]]).map((a) => a.id), ["caja_usd_arqueo", "x_inf"]);
  assert.deepEqual(contarAvisos(u), { ver: 1, inc: 1, inf: 2 });
  const conf = confianzaPorKpi(u, (a) => String(a.aviso[0]));
  assert.deepEqual(conf.caja_disponible, { nivel: "ver", motivo: "auto", desde: null });
  assert.equal(conf.resultado.nivel, "inc");
  // Los informativos no bajan la confianza.
  assert.equal(conf.retiros, undefined);
});

test("cuenta quieta: el % sobre 'toda la plata' de Caja cuando se lo pasan (mismo número que Caja)", () => {
  const cuentas = [
    { codigo: "1.1.1.01.05", nombre: "Borelli", saldo: 300, saldoMoneda: 0, ultimo: "2026-05-01" },
    { codigo: "1.1.1.01.01", nombre: "Galicia", saldo: 400, saldoMoneda: 0, ultimo: "2026-10-14" },
  ];
  const conCaja = detectarCuentasQuietas(cuentas, "2026-10-15", { todaLaPlata: 750 });
  assert.match(JSON.stringify(conCaja[0].detalle), /40 % de toda la plata/);
  const sinCaja = detectarCuentasQuietas(cuentas, "2026-10-15");
  assert.match(JSON.stringify(sinCaja[0].detalle), /43 % de la caja contable/);
});
