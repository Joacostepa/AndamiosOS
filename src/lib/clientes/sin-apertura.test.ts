import { test } from "node:test";
import assert from "node:assert/strict";
import { sinApertura } from "./sin-apertura.ts";

test("lo que manda ABA sale sin «¿»; lo de una persona, como lo escribió (JS, 25/11)", () => {
  assert.equal(sinApertura("Por la foto es una viga. ¿Dónde es la obra? ¿ Qué largo hay?", { autor: "ia" }), "Por la foto es una viga. Dónde es la obra? Qué largo hay?");
  assert.equal(sinApertura("¿Te lo reservo para el lunes?", { autor: "sistema" }), "Te lo reservo para el lunes?");
  assert.equal(sinApertura("¿Te lo reservo?", { autor: "persona" }), "¿Te lo reservo?");
});
