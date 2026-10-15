import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicoVentas, paramsDe } from "./params.ts";

const HOY = "2026-10-15";

test("Ventas: la vista por defecto queda sin parámetros (la guarda el snapshot)", () => {
  assert.deepEqual(paramsDe("ventas", new URLSearchParams(""), HOY), {});
  assert.deepEqual(paramsDe("ventas", new URLSearchParams("g=mes&p=2026-10"), HOY), {});
});

test("Ventas: un link raro cae en un período válido (una sola entrada de caché)", () => {
  assert.deepEqual(paramsDe("ventas", new URLSearchParams("g=mes&p=2026-13"), HOY), {});
  assert.deepEqual(paramsDe("ventas", new URLSearchParams("g=zzz&p=xyz&vs=raro"), HOY), {});
  assert.deepEqual(paramsDe("ventas", new URLSearchParams("g=mes&p=2026-09"), HOY), { g: "mes", p: "2026-09" });
  assert.deepEqual(canonicoVentas({ g: "anio", p: "2026", vs: "promedio6" }, HOY), { g: "anio", p: "2026" });
});

test("Las pantallas sin parámetros ignoran todo", () => {
  assert.deepEqual(paramsDe("caja", new URLSearchParams("g=mes&x=1"), HOY), {});
});
