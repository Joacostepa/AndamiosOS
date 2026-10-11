import { test } from "node:test";
import assert from "node:assert/strict";
import { diaAlertable, diaHabil, diaPorDefecto, esFecha, hoyBA, mananaDe, minutosDeHoyBA } from "./dias.ts";

const en = (iso: string) => Date.parse(iso);

test("hoy en Buenos Aires: a las 22 h de Argentina ya es otro día en UTC", () => {
  assert.equal(hoyBA(en("2026-10-14T01:30:00Z")), "2026-10-13");
  assert.equal(minutosDeHoyBA(en("2026-10-14T01:30:00Z")), 22 * 60 + 30);
});

test("abre en hoy a la mañana y en mañana desde las 15", () => {
  assert.equal(diaPorDefecto(en("2026-10-13T09:40:00Z")), "2026-10-13"); // 6:40
  assert.equal(diaPorDefecto(en("2026-10-13T18:00:00Z")), "2026-10-14"); // 15:00
});

test("el domingo es un día más: el sábado a la tarde, mañana es el domingo; el domingo abre el domingo", () => {
  assert.equal(diaPorDefecto(en("2026-10-17T19:00:00Z")), "2026-10-18");
  assert.equal(diaPorDefecto(en("2026-10-18T12:00:00Z")), "2026-10-18");
  assert.equal(diaPorDefecto(en("2026-10-18T19:00:00Z")), "2026-10-19");
  assert.equal(mananaDe("2026-10-17"), "2026-10-18");
});

test("las flechas pasan por el domingo", () => {
  assert.equal(diaHabil("2026-10-19", -1), "2026-10-18");
  assert.equal(diaHabil("2026-10-17", 1), "2026-10-18");
  assert.equal(diaHabil("2026-10-13", 1), "2026-10-14");
});

test("?dia= inválido no pasa", () => {
  assert.ok(esFecha("2026-10-13"));
  assert.ok(!esFecha("2026-13-40"));
  assert.ok(!esFecha("mañana"));
  assert.ok(!esFecha(null));
});

test("I7: mirar un día pasado no crea alertas; hoy y los que vienen, sí", () => {
  assert.equal(diaAlertable(1440 + 600), false); // ayer
  assert.equal(diaAlertable(7 * 1440), false); // la semana pasada
  assert.equal(diaAlertable(600), true); // hoy a las 10
  assert.equal(diaAlertable(-300), true); // la tarde anterior
  assert.equal(diaAlertable(-2 * 1440), true); // el lunes, mirado el sábado
  assert.equal(diaAlertable(-10 * 1440), false);
});
