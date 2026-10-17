import { test } from "node:test";
import assert from "node:assert/strict";
import { campoDeApoyoFaltante } from "./client.ts";

// Sin scripts/odoo-add-apoyo-a-asignacion.mjs, Odoo contesta "Invalid field" en todo lo
// que lee x_apoyo o la cuadrilla de la mano de obra. Tiene que llegar con qué hacer.
test("campoDeApoyoFaltante: traduce los campos del apoyo que faltan", () => {
  assert.match(campoDeApoyoFaltante("Invalid field 'x_apoyo' on model 'x_aba_asignacion'") ?? "", /odoo-add-apoyo/);
  assert.match(campoDeApoyoFaltante("Invalid field x_aba_asignacion.x_apoyo in leaf ('x_apoyo', '=', False)") ?? "", /odoo-add-apoyo/);
  assert.match(campoDeApoyoFaltante("Invalid field 'x_cuadrilla_id' on model 'x_aba_mano_obra'") ?? "", /odoo-add-apoyo/);
});

test("campoDeApoyoFaltante: deja pasar los demás errores", () => {
  assert.equal(campoDeApoyoFaltante("Invalid field 'x_cuadrilla_id' on model 'x_aba_asignacion_vieja'"), null);
  assert.equal(campoDeApoyoFaltante("Access Denied"), null);
  assert.equal(campoDeApoyoFaltante("Invalid field 'x_otro' on model 'x_aba_asignacion'"), null);
});
