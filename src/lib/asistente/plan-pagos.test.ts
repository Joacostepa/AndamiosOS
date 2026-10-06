// El plan de pagos dentro del borrador: se recalcula con la oferta y, si no cierra, no se guarda.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import { borradorVacio, normalizarBorrador, recalcular, type DatosBorrador } from "./borrador.ts";

const ctx = { tarifas: T, lista: null, hoy: "2026-10-06" };

function conPlan(pcts: number[]): DatosBorrador {
  return {
    ...borradorVacio(),
    jornadas: { armado: 1, desarme: 1, personas: 3 },
    calculos: { bandeja: { metros: 12, altura: 3, concertina: "opcional", gestoria: "no", enCaba: true } },
    planPagos: {
      medio: "e-cheq diferido",
      cuotas: pcts.map((pct, i) => ({ fecha: `2026-10-${String(13 + i * 7)}`, cuando: null, concepto: `Cuota ${i + 1}`, partes: [{ que: "todo", pct }] })),
    },
  };
}

test("el plan acompaña a la oferta y cierra con el total con IVA", () => {
  const r = recalcular(conPlan([50, 50]), ctx);
  assert.ok(r.planPagos);
  assert.equal(r.planPagos.totalNeto, r.totales.subtotal);
  assert.equal(r.planPagos.totalConIva, r.totales.total);
  assert.ok(!r.faltantes.some((f) => f.codigo === "plan_pagos"));
});

test("un plan que no cubre la oferta entera no deja guardar", () => {
  const r = recalcular(conPlan([50, 30]), ctx);
  const f = r.faltantes.find((x) => x.codigo === "plan_pagos");
  assert.ok(f);
  assert.match(f.texto, /80 %/);
});

test("un borrador guardado antes del plan arranca sin plan", () => {
  const d = normalizarBorrador({ condiciones: { formaPago: "contado" } });
  assert.equal(d.planPagos, null);
  assert.equal(recalcular({ ...d, calculos: conPlan([]).calculos }, ctx).planPagos, null);
});
