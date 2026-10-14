import { test } from "node:test";
import assert from "node:assert/strict";
import { cierreFaltante, TEXTO_INTERRUMPIDA } from "./historia.ts";

test("una historia terminada en un aviso sin respuesta se cierra con una fila del asistente", () => {
  const cierre = cierreFaltante([
    { rol: "user", turno_id: "t1" }, { rol: "system", turno_id: "t1" },
  ]);
  assert.deepEqual(cierre, { rol: "assistant", texto: TEXTO_INTERRUMPIDA, turno_id: "t1" });
});

test("no toca una historia sana", () => {
  assert.equal(cierreFaltante([]), null);
  assert.equal(cierreFaltante([{ rol: "user", turno_id: "t1" }, { rol: "system", turno_id: "t1" }, { rol: "assistant", turno_id: "t1" }]), null);
  // Cortada después de resultados de herramientas: dos "user" seguidos los junta la API.
  assert.equal(cierreFaltante([{ rol: "system", turno_id: "t1" }, { rol: "assistant", turno_id: "t1" }, { rol: "user", turno_id: "t1" }]), null);
});
