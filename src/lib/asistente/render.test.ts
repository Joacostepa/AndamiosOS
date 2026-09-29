// El render propio (JS, 28/09): la S02740 se guardó con "render propio" y sin imagen, y el PDF
// salió sin render.

import { test } from "node:test";
import assert from "node:assert/strict";
import { borradorVacio, faltantesParaEmitir } from "./borrador.ts";

const vacio = { lineas: [], avisos: [], pendientes: [] };
const codigos = (render: ReturnType<typeof borradorVacio>["render"]) =>
  faltantesParaEmitir({ ...borradorVacio(), render }, vacio).map((f) => f.codigo).filter((c) => c.startsWith("render"));

test("render propio sin imagen no deja guardar", () => {
  assert.deepEqual(codigos({ eleccion: "propio", renderId: null, path: null }), ["render_imagen"]);
});

test("con la imagen, con uno de la biblioteca o sin render, no falta nada del render", () => {
  assert.deepEqual(codigos({ eleccion: "propio", renderId: null, path: "adjuntos/c/1790645235043-2589cd76.jpg" }), []);
  assert.deepEqual(codigos({ eleccion: "biblioteca", renderId: "r1", path: null }), []);
  assert.deepEqual(codigos({ eleccion: "ninguno", renderId: null, path: null }), []);
});

test("sin decidir, falta decidir (no la imagen)", () => {
  assert.deepEqual(codigos({ eleccion: null, renderId: null, path: null }), ["render"]);
});
