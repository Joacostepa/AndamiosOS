import { test } from "node:test";
import assert from "node:assert/strict";
import { llevaPm, sinPmUrgente } from "./pm.ts";

test("Lleva PM todo menos el desarme", () => {
  for (const t of ["armado", "ampliacion", "desmonte_parcial", "mantenimiento", "otro", ""]) assert.equal(llevaPm(t), true, t);
  assert.equal(llevaPm(null), true);
  assert.equal(llevaPm("desarme"), false);
});

test("Sin PM urgente: arranca de hoy a 2 días hábiles; la que ya arrancó no", () => {
  const feriados = new Set(["2026-11-23"]);
  // Jueves 19/11. Viernes = 1, sábado = 2 (el sábado es hábil en el tablero), lunes 23 feriado.
  assert.equal(sinPmUrgente("2026-11-19", "2026-11-19", feriados), true);
  assert.equal(sinPmUrgente("2026-11-17", "2026-11-19", feriados), false);
  assert.equal(sinPmUrgente("2026-11-21", "2026-11-19", feriados), true);
  assert.equal(sinPmUrgente("2026-11-24", "2026-11-19", feriados), false);
  assert.equal(sinPmUrgente(null, "2026-11-19", feriados), false);
});
