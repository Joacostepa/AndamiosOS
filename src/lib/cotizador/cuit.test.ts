import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCuit, verificadorCuit } from "./cuit.ts";

test("CUIT de 10 dígitos: propone el 0 del DNI cuando el verificador coincide (Ramírez)", () => {
  const r = validarCuit("20-8632598-6");
  assert.equal(r.valido, false);
  if (r.valido) return;
  assert.deepEqual(r.propuesta, { cuit: "20-08632598-6", verificadorCoincide: true });
  assert.equal(validarCuit(r.propuesta!.cuit).valido, true);
  assert.match(r.motivo, /falta el 0/);
});

test("CUIT de 10 dígitos con el verificador que no cierra: propone el calculado y no lo da por bueno", () => {
  const r = validarCuit("2086325981");
  assert.equal(r.valido, false);
  if (r.valido) return;
  assert.equal(r.propuesta?.verificadorCoincide, false);
  assert.equal(r.propuesta?.cuit, "20-08632598-6");
  assert.match(r.motivo, /constancia/);
});

test("CUIT de 10 dígitos con un prefijo que no es de CUIT: sin propuesta", () => {
  const r = validarCuit("9986325986");
  assert.equal(r.valido, false);
  if (!r.valido) assert.equal(r.propuesta, undefined);
});

test("verificador: el de ABA", () => {
  assert.equal(verificadorCuit("3071111650"), 4);
});
