import { test } from "node:test";
import assert from "node:assert/strict";
import { curvaEnLaCalle, diasEntre, enLaCalleEl, fechaAr, hoyAr, type ObraEnCurva } from "./curva.ts";

test("fechas de Odoo en hora argentina", () => {
  // La importación: 22:33 UTC del 24/03 son las 19:33 del 24/03 en Buenos Aires.
  assert.equal(fechaAr("2026-03-24 22:33:05"), "2026-03-24");
  // 01:30 UTC del 25 todavía es el 24 a la noche en Buenos Aires (antes se corría un día).
  assert.equal(fechaAr("2026-03-25 01:30:00"), "2026-03-24");
  assert.equal(fechaAr("2026-10-02 11:56:49"), "2026-10-02");
  assert.equal(fechaAr("2026-10-01"), "2026-10-01");
  assert.equal(fechaAr(false), null);
  assert.equal(fechaAr("basura"), null);
  assert.equal(hoyAr(new Date("2026-10-13T02:00:00Z")), "2026-10-12");
  assert.equal(diasEntre("2026-03-24", "2026-10-12"), 202);
});

const o = (estado: ObraEnCurva["estado"], fechaArmado: string | null, fechaDesarme: string | null = null): ObraEnCurva => ({ estado, fechaArmado, fechaDesarme });

test("en la calle ese día", () => {
  assert.equal(enLaCalleEl(o("armada", "2026-05-01"), "2026-05-01"), true);
  assert.equal(enLaCalleEl(o("armada", "2026-05-02"), "2026-05-01"), false);
  assert.equal(enLaCalleEl(o("armada", null), "2026-05-01"), false);
  assert.equal(enLaCalleEl(o("desarmada", "2026-04-01", "2026-05-01"), "2026-04-30"), true);
  assert.equal(enLaCalleEl(o("desarmada", "2026-04-01", "2026-05-01"), "2026-05-01"), false);
  // Desarmada sin fecha de desarme: no se sabe hasta cuándo, no cuenta.
  assert.equal(enLaCalleEl(o("desarmada", "2026-04-01"), "2026-04-15"), false);
});

test("la curva: una por semana desde la importación y la última es hoy", () => {
  const obras = [
    o("armada", "2026-03-24"),
    o("pendiente_desarme", "2026-04-02"),
    o("desarmada", "2026-03-24", "2026-04-01"),
    o("desarmada", "2026-03-30"),
  ];
  const c = curvaEnLaCalle(obras, "2026-04-10");
  assert.deepEqual(c, [
    { fecha: "2026-03-24", enLaCalle: 2 },
    { fecha: "2026-03-31", enLaCalle: 2 },
    { fecha: "2026-04-07", enLaCalle: 2 },
    { fecha: "2026-04-10", enLaCalle: 2 },
  ]);
  assert.equal(curvaEnLaCalle(obras, "2026-03-31").length, 2);
  assert.equal(curvaEnLaCalle([], "2026-10-12").length, 30);
});
