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

test("confirma los sí que JS escribe de verdad", () => {
  for (const t of ["si dale avanza gracias", "Avanzá", "dale, seguí", "metele nomás", "sí, guardarlo", "avancemos", "va, dale"]) {
    assert.equal(esConfirmacion(t).ok, true, t);
  }
});

test("no confirma un no con palabras de sí, ni un avanzá con cambios", () => {
  for (const t of ["¡qué va!", "que va, esperá", "ni ahí, dale que no", "para nada", "avanzá pero sin la concertina",
    "seguí con la altura de seis metros", "Dale, avanza con todo, pero no hace falta que guardes el render"]) {
    assert.equal(esConfirmacion(t).ok, false, t);
  }
});
