// El plan de pagos en cuotas (Joaquín, 06/10): el ejemplo de los e-cheqs que mandó, al peso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPlanPagos, fechaCuota, type PlanPagos } from "./plan-pagos.ts";
import type { Linea } from "./tipos.ts";

function l(id: string, importe: number, extra: Partial<Linea> = {}): Linea {
  return {
    id, grupo: "manual", seccion: "base", producto: id, descripcion: id, cantidad: 1, precioUnitario: importe,
    importe, importeLista: importe, unicaVez: false, calculo: "", ...extra,
  };
}

// La oferta del ejemplo: ingeniería, MO de dos estructuras y los canones. Subtotal $ 22.802.606.
const LINEAS: Linea[] = [
  l("fachada", 10_000_000),
  l("bandeja", 5_248_575),
  l("ingenieria", 1_750_001, { unicaVez: true }),
  l("mo_a", 3_000_000, { unicaVez: true, esManoDeObra: true }),
  l("mo_b", 2_804_030, { unicaVez: true, esManoDeObra: true }),
  l("concertina", 500_000, { seccion: "opcional" }),
];
const TOTAL_CON_IVA = 22_802_606 + Math.round(22_802_606 * 0.21);
const P = { ivaPct: 21, totalConIva: TOTAL_CON_IVA, hoy: "2026-10-06" };

const EJEMPLO: PlanPagos = {
  medio: "e-cheq diferido",
  cuotas: [
    { fecha: "2026-10-09", cuando: null, concepto: "Ingeniería completa + 50 % MO (A + B)", partes: [{ que: "ingenieria", pct: 100 }, { que: "mano_obra", pct: 50 }] },
    { fecha: "2026-10-15", cuando: null, concepto: "50 % de los canones", partes: [{ que: "canon", pct: 50 }] },
    { fecha: "2026-11-02", cuando: null, concepto: "50 % restante de los canones", partes: [{ que: "canon", pct: 50 }] },
    { fecha: "2026-11-15", cuando: null, concepto: "50 % restante de la MO", partes: [{ que: "mano_obra", pct: 50 }] },
  ],
};

test("el ejemplo de Joaquín da los mismos números, al peso", () => {
  const r = calcularPlanPagos(EJEMPLO, LINEAS, P);
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.filas.map((f) => f.neto), [4_652_016, 7_624_288, 7_624_287, 2_902_015]);
  assert.deepEqual(r.filas.map((f) => f.conIva), [5_628_939, 9_225_389, 9_225_387, 3_511_438]);
  assert.equal(r.totalNeto, 22_802_606);
  assert.equal(r.totalConIva, 27_591_153);
  assert.deepEqual(r.filas.map((f) => f.cuando), ["vie 9/10/2026", "jue 15/10/2026", "lun 2/11/2026", "dom 15/11/2026"]);
});

test("avisa la cuota que cae domingo, sin bloquear", () => {
  const r = calcularPlanPagos(EJEMPLO, LINEAS, P);
  assert.deepEqual(r.avisos.map((a) => a.codigo), ["plan_fin_de_semana"]);
  assert.match(r.avisos[0].texto, /domingo/);
});

test("si una línea no queda repartida entera, es un problema", () => {
  const plan: PlanPagos = { medio: null, cuotas: EJEMPLO.cuotas.slice(0, 3) };
  const r = calcularPlanPagos(plan, LINEAS, P);
  assert.equal(r.problemas.length, 2);
  assert.match(r.problemas[0], /mo_a.*50 %/);
});

test("una parte que no existe es un problema", () => {
  const plan: PlanPagos = { medio: null, cuotas: [{ fecha: null, cuando: "A la aceptación", concepto: "Todo", partes: [{ que: "todo", pct: 100 }, { que: "flete", pct: 100 }] }] };
  const r = calcularPlanPagos(plan, LINEAS, P);
  assert.equal(r.problemas.length, 1);
  assert.match(r.problemas[0], /flete/);
});

test("un anticipo y un saldo por porcentaje de toda la base", () => {
  const plan: PlanPagos = {
    medio: null,
    cuotas: [
      { fecha: null, cuando: "A la aceptación", concepto: "Anticipo 30 %", partes: [{ que: "todo", pct: 30 }] },
      { fecha: "2026-10-01", cuando: null, concepto: "Saldo 70 %", partes: [{ que: "todo", pct: 70 }] },
    ],
  };
  const r = calcularPlanPagos(plan, LINEAS, P);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.totalNeto, 22_802_606);
  assert.equal(r.totalConIva, TOTAL_CON_IVA);
  assert.equal(r.filas[0].cuando, "A la aceptación");
  assert.deepEqual(r.avisos.map((a) => a.codigo), ["plan_fecha_pasada"]);
});

test("fechaCuota", () => {
  assert.equal(fechaCuota("2026-12-31"), "jue 31/12/2026");
});
