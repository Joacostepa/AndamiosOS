import { test } from "node:test";
import assert from "node:assert/strict";
import { esConfirmacion } from "./confirmacion.ts";

test("confirma los sí de siempre", () => {
  for (const t of ["sí", "Si", "dale", "Sí, dale.", "ok", "Dale, guardalo en Odoo", "sí sí, dale nomás", "confirmo", "perfecto, hacelo",
    "de una", "está bien, cargalo", "listo", "Sí, Claude, dale", "Joya, mandalo", "bueno dale", "Sí, creá el presupuesto"]) {
    assert.equal(esConfirmacion(t).ok, true, t);
  }
});

test("no confirma lo que trae un cambio, una duda o una negación", () => {
  for (const t of ["no", "No, esperá", "sí pero con 10% de descuento", "¿sí?", "sí, cambiá la altura", "dale, sin la concertina",
    "sí… no, esperá", "para para", "bueno", "sí, poné 3 jornadas", "dale pero mandalo mañana", "mmm", "después vemos",
    "sí, a nombre de otra empresa", "", "   "]) {
    assert.equal(esConfirmacion(t).ok, false, t);
  }
});

test("para mandar un mail hace falta el verbo", () => {
  assert.equal(esConfirmacion("sí", "explicita").ok, false);
  assert.equal(esConfirmacion("dale", "explicita").ok, false);
  assert.equal(esConfirmacion("dale, mandalo", "explicita").ok, true);
  assert.equal(esConfirmacion("Sí, envialo al cliente", "explicita").ok, true);
  assert.equal(esConfirmacion("sí, confirmo el envío", "explicita").ok, true);
});
