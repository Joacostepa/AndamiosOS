import { test } from "node:test";
import assert from "node:assert/strict";
import { porQueNoPuedeMarcar, recibidoVigente } from "./reglas-publico.ts";

test("I2: el Recibido de un mensaje viejo no confirma la versión de ahora", () => {
  assert.equal(recibidoVigente(1, 2), false);
  assert.equal(recibidoVigente(2, 2), true);
  assert.equal(recibidoVigente(null, 3), true); // sin versión: la página vieja del celular
});

const L = { fecha: "2026-10-13", rol: "chofer", personaId: "kiska" };
const V = { fecha: "2026-10-13", estado: "planeado", chofer_id: "kiska", vehiculo_id: "af669" };

test("I3: el chofer marca sus viajes del día", () => {
  assert.equal(porQueNoPuedeMarcar(V, L, null), null);
  assert.equal(porQueNoPuedeMarcar({ ...V, chofer_id: null }, L, "kiska"), null);
});

test("I3: no puede marcar un viaje anulado (ni revivirlo con un botón viejo)", () => {
  assert.match(porQueNoPuedeMarcar({ ...V, estado: "anulado" }, L, null)!, /lo sacó la oficina/);
});

test("I3: ni el de otro chofer, ni el de otro día, ni con un link de capataz", () => {
  assert.match(porQueNoPuedeMarcar({ ...V, chofer_id: "gomez" }, L, "kiska")!, /no es tuyo/);
  assert.match(porQueNoPuedeMarcar({ ...V, chofer_id: null }, L, "gomez")!, /no es tuyo/);
  assert.match(porQueNoPuedeMarcar({ ...V, fecha: "2026-10-14" }, L, null)!, /no es tuyo/);
  assert.match(porQueNoPuedeMarcar(V, { ...L, rol: "a_cargo" }, null)!, /no es tuyo/);
  assert.match(porQueNoPuedeMarcar(null, L, null)!, /no es tuyo/);
});
