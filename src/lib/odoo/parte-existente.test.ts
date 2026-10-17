import { test } from "node:test";
import assert from "node:assert/strict";
import { ApoyoNoCargaParteError, exigirPrincipal, exigirSinParte, ParteYaCargadoError } from "./parte-existente.ts";

test("B1: cerrar una jornada sin parte sigue", () => {
  assert.doesNotThrow(() => exigirSinParte(null));
});

test("B1: cerrar una jornada que ya tiene parte se rechaza (no se reescribe ni se duplica)", () => {
  assert.throws(() => exigirSinParte(4512), (e: unknown) => e instanceof ParteYaCargadoError && e.parteId === 4512 && /ya tiene parte/.test(e.message));
});

test("apoyo: cerrar la principal sigue", () => {
  assert.doesNotThrow(() => exigirPrincipal(false, null));
});

test("apoyo: cerrar un apoyo se rechaza diciendo quién carga el parte", () => {
  assert.throws(
    () => exigirPrincipal(true, { asignacionId: 88, cuadrilla: "Cuadrilla 2" }),
    (e: unknown) =>
      e instanceof ApoyoNoCargaParteError &&
      e.principalAsignacionId === 88 &&
      /el parte lo carga la Cuadrilla 2/.test(e.message),
  );
});

test("apoyo sin principal ese día: se rechaza y pide corregir el tablero", () => {
  assert.throws(
    () => exigirPrincipal(true, null),
    (e: unknown) => e instanceof ApoyoNoCargaParteError && e.principalAsignacionId === null && /no tiene cuadrilla principal/.test(e.message),
  );
});
