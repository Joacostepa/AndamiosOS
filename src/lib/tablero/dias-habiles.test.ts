import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anteriorDiaHabil,
  diaDeSemana,
  diaIso,
  diasHabilesEntre,
  esDiaHabil,
  fechaBADeOdoo,
  hoyBA,
  instanteBA,
  lunesDe,
  proximosDiasHabiles,
  siguienteDiaHabil,
} from "./dias-habiles.ts";

// Días hábiles de las guardias: lunes a sábado sin feriados (guardias-plan-tecnico.md §0,
// decisión 10). El 23/10/2026 es viernes; el 02/11, lunes.

const SIN_FERIADOS = new Set<string>();
const FERIADOS = new Set(["2026-11-23"]);

test("el sábado es hábil; el domingo y el feriado no", () => {
  assert.equal(esDiaHabil("2026-10-24", SIN_FERIADOS), true);
  assert.equal(esDiaHabil("2026-10-25", SIN_FERIADOS), false);
  assert.equal(esDiaHabil("2026-11-23", FERIADOS), false);
  assert.equal(esDiaHabil("2026-11-23", SIN_FERIADOS), true);
});

test("diaIso: lunes 1 … domingo 7", () => {
  assert.equal(diaIso("2026-11-02"), 1);
  assert.equal(diaIso("2026-10-31"), 6);
  assert.equal(diaIso("2026-11-01"), 7);
});

test("diasHabilesEntre: creada el jueves, el lunes lleva 3 (viernes, sábado, lunes)", () => {
  assert.equal(diasHabilesEntre("2026-10-22", "2026-10-26", SIN_FERIADOS), 3);
  assert.equal(diasHabilesEntre("2026-10-22", "2026-10-22", SIN_FERIADOS), 0);
  assert.equal(diasHabilesEntre("2026-10-26", "2026-10-22", SIN_FERIADOS), 0);
  // El feriado no cuenta.
  assert.equal(diasHabilesEntre("2026-11-21", "2026-11-24", FERIADOS), 1);
});

test("lunesDe un domingo es el lunes de la semana que termina", () => {
  assert.equal(lunesDe("2026-10-25"), "2026-10-19");
  assert.equal(lunesDe("2026-10-26"), "2026-10-26");
  assert.equal(lunesDe("2026-10-31"), "2026-10-26");
  assert.equal(diaDeSemana("2026-11-02", 4), "2026-11-05");
});

test("siguiente y anterior día hábil saltean domingo y feriado", () => {
  assert.equal(siguienteDiaHabil("2026-10-31", SIN_FERIADOS), "2026-11-02");
  assert.equal(anteriorDiaHabil("2026-11-02", SIN_FERIADOS), "2026-10-31");
  assert.equal(siguienteDiaHabil("2026-11-21", FERIADOS), "2026-11-24");
  assert.equal(anteriorDiaHabil("2026-11-24", FERIADOS), "2026-11-21");
});

test("proximosDiasHabiles incluye hoy si es hábil", () => {
  assert.deepEqual(proximosDiasHabiles("2026-10-30", 3, SIN_FERIADOS), ["2026-10-30", "2026-10-31", "2026-11-02"]);
  assert.deepEqual(proximosDiasHabiles("2026-11-01", 2, SIN_FERIADOS), ["2026-11-02", "2026-11-03"]);
});

test("instanteBA: las 13 h de acá son las 16 UTC", () => {
  assert.equal(instanteBA("2026-10-22", 13), "2026-10-22T16:00:00.000Z");
});

test("hoyBA: a las 01:30 UTC acá todavía es el día anterior", () => {
  assert.equal(hoyBA("2026-10-23T01:30:00Z"), "2026-10-22");
  assert.equal(hoyBA("2026-10-23T03:00:00Z"), "2026-10-23");
});

test("fechaBADeOdoo: el create_date de Odoo viene en UTC y sin zona", () => {
  // 23:30 UTC = 20:30 acá: sigue siendo el 15.
  assert.equal(fechaBADeOdoo("2026-10-15 23:30:00"), "2026-10-15");
  // 02:30 UTC del 16 = 23:30 del 15 acá.
  assert.equal(fechaBADeOdoo("2026-10-16 02:30:00"), "2026-10-15");
  assert.equal(fechaBADeOdoo("2026-10-16T02:30:00Z"), "2026-10-15");
});
