import { test } from "node:test";
import assert from "node:assert/strict";
import { exigirSinParte, ParteYaCargadoError } from "./parte-existente.ts";

test("B1: cerrar una jornada sin parte sigue", () => {
  assert.doesNotThrow(() => exigirSinParte(null));
});

test("B1: cerrar una jornada que ya tiene parte se rechaza (no se reescribe ni se duplica)", () => {
  assert.throws(() => exigirSinParte(4512), (e: unknown) => e instanceof ParteYaCargadoError && e.parteId === 4512 && /ya tiene parte/.test(e.message));
});
