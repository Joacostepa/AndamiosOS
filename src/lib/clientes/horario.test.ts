import { test } from "node:test";
import assert from "node:assert/strict";
import { HORARIO_POR_DEFECTO, ahoraLegible, atencion, describirHorario, leerHorario } from "./horario.ts";

// Hora de Buenos Aires (UTC−3) → Date.
const ba = (s: string) => new Date(`${s}:00-03:00`);
const sinFeriados = new Set<string>();
const feriados2026 = new Set(["2026-11-23", "2026-12-08", "2026-12-25"]);

test("leerHorario: formatos y lo que no se entiende", () => {
  assert.deepEqual(leerHorario("08:00-17:00"), { desdeMin: 480, hastaMin: 1020 });
  assert.deepEqual(leerHorario("8-17"), { desdeMin: 480, hastaMin: 1020 });
  assert.deepEqual(leerHorario("9:30 a 18"), { desdeMin: 570, hastaMin: 1080 });
  assert.deepEqual(leerHorario("cualquier cosa"), HORARIO_POR_DEFECTO);
  assert.deepEqual(leerHorario("17-8"), HORARIO_POR_DEFECTO);
  assert.deepEqual(leerHorario(null), HORARIO_POR_DEFECTO);
  assert.equal(describirHorario(leerHorario("9:30-18")), "de lunes a viernes de 9:30 a 18");
});

test("jueves a las 10: hay personas", () => {
  const a = atencion(ba("2026-10-15T10:00"), HORARIO_POR_DEFECTO, sinFeriados);
  assert.equal(a.enHorario, true);
  assert.equal(a.cuando, null);
});

test("jueves a las 7: hoy a primera hora", () => {
  assert.equal(atencion(ba("2026-10-15T07:00"), HORARIO_POR_DEFECTO, sinFeriados).cuando, "hoy a primera hora");
});

test("jueves a las 17 en punto: ya cerró, mañana", () => {
  const a = atencion(ba("2026-10-15T17:00"), HORARIO_POR_DEFECTO, sinFeriados);
  assert.equal(a.enHorario, false);
  assert.equal(a.cuando, "mañana a primera hora");
  assert.equal(a.fecha, "2026-10-16");
});

test("viernes 22:40 (escenario 4): el lunes", () => {
  const a = atencion(ba("2026-10-16T22:40"), HORARIO_POR_DEFECTO, sinFeriados);
  assert.equal(a.cuando, "el lunes a primera hora");
  assert.equal(a.fecha, "2026-10-19");
});

test("sábado y domingo: el lunes", () => {
  assert.equal(atencion(ba("2026-10-17T11:00"), HORARIO_POR_DEFECTO, sinFeriados).cuando, "el lunes a primera hora");
  assert.equal(atencion(ba("2026-10-18T11:00"), HORARIO_POR_DEFECTO, sinFeriados).cuando, "mañana a primera hora");
});

test("fin de semana largo: el viernes 20/11 a la tarde, sigue el martes (el 23 es feriado)", () => {
  const a = atencion(ba("2026-11-20T18:00"), HORARIO_POR_DEFECTO, feriados2026);
  assert.equal(a.cuando, "el martes a primera hora");
  assert.equal(a.fecha, "2026-11-24");
});

test("un feriado en día de semana no es hábil aunque sea en horario", () => {
  const a = atencion(ba("2026-12-08T10:00"), HORARIO_POR_DEFECTO, feriados2026);
  assert.equal(a.enHorario, false);
  assert.equal(a.cuando, "mañana a primera hora");
});

test("más de una semana sin días hábiles: dice el número del día", () => {
  const largo = new Set(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26"]);
  const a = atencion(ba("2026-10-16T20:00"), HORARIO_POR_DEFECTO, largo);
  assert.equal(a.cuando, "el martes 27 a primera hora");
});

test("ahoraLegible: hora de Buenos Aires", () => {
  assert.equal(ahoraLegible(ba("2026-10-16T22:40")), "viernes 16/10 22:40");
});
