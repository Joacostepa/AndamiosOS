import { test } from "node:test";
import assert from "node:assert/strict";
import { repararEntrada } from "./entrada.ts";

test("cambios que llegan como texto JSON se convierten en objeto", () => {
  const r = repararEntrada({ cambios: '{"obra": {"direccion": "Ayacucho 665"}}' });
  assert.deepEqual(r, { cambios: { obra: { direccion: "Ayacucho 665" } } });
  assert.deepEqual(repararEntrada({ ids: '["a", "b"]' }), { ids: ["a", "b"] });
});

test("lo que no es JSON queda como vino (y el mismo objeto si no cambió nada)", () => {
  const i = { texto: "[nota] algo", n: 3 };
  assert.equal(repararEntrada(i), i);
  assert.equal(repararEntrada("x"), "x");
  assert.equal(repararEntrada(null), null);
});
