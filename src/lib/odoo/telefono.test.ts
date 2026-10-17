import { test } from "node:test";
import assert from "node:assert/strict";
import { variantesTelefonoOdoo } from "./telefono.ts";

test("variantesTelefonoOdoo: con y sin el 9 del celular, como lo guarda Odoo", () => {
  assert.deepEqual(variantesTelefonoOdoo("5491155551234"), ["+5491155551234", "+541155551234"]);
  assert.deepEqual(variantesTelefonoOdoo("+54 11 5555-1234"), ["+541155551234", "+5491155551234"]);
  assert.deepEqual(variantesTelefonoOdoo("5492215551234"), ["+5492215551234", "+542215551234"]);
  assert.deepEqual(variantesTelefonoOdoo("15551234"), ["+15551234"]);
  assert.deepEqual(variantesTelefonoOdoo(""), []);
  assert.deepEqual(variantesTelefonoOdoo(null), []);
});
