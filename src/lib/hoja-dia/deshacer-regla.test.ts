// B2: el Deshacer sólo escribe tablas del módulo (y de Legajos, sólo el celular y "puede
// estar a cargo"); I4: deshacer un gesto a medias vuelve cada fila a como estaba.

import { test } from "node:test";
import assert from "node:assert/strict";
import { planDeshacer, validarHistorial, type CambioHistorial } from "./deshacer-regla.ts";

const ID = "11111111-2222-4333-8444-555555555555";
const ID2 = "11111111-2222-4333-8444-666666666666";

test("B2: una fila de historial que toca user_profiles no se deshace", () => {
  const h = { entidad: "hoja", cambios: [{ tabla: "user_profiles", id: ID, antes: { id: ID, rol: "admin" }, despues: { id: ID, rol: "operativo" } }] };
  assert.throws(() => validarHistorial(h), /no se puede deshacer/);
});

test("B2: tampoco otra tabla cualquiera, ni aunque venga mezclada con una del módulo", () => {
  const h = {
    entidad: "hoja",
    cambios: [
      { tabla: "hd_hojas", id: ID, antes: null, despues: { id: ID } },
      { tabla: "plan_cajon_pendientes", id: ID2, antes: { id: ID2 }, despues: null },
    ],
  };
  assert.throws(() => validarHistorial(h), /no se puede deshacer/);
});

test("B2: Legajos sólo en el celular y 'puede estar a cargo', y sólo como actualización", () => {
  const ok = { entidad: "persona", cambios: [{ tabla: "personal", id: ID, antes: { id: ID, telefono: "1", activo: true }, despues: { id: ID, telefono: "2", activo: true } }] };
  assert.equal(validarHistorial(ok).length, 1);
  const rol = { entidad: "persona", cambios: [{ tabla: "personal", id: ID, antes: { id: ID, telefono: "1", activo: false }, despues: { id: ID, telefono: "1", activo: true } }] };
  assert.throws(() => validarHistorial(rol), /no se puede deshacer/);
  const borrar = { entidad: "persona", cambios: [{ tabla: "personal", id: ID, antes: { id: ID, telefono: "1" }, despues: null }] };
  assert.throws(() => validarHistorial(borrar), /no se puede deshacer/);
});

test("B2: el id del cambio tiene que ser el de la fila, y la entidad, del módulo", () => {
  assert.throws(() => validarHistorial({ entidad: "hoja", cambios: [{ tabla: "hd_hojas", id: ID, antes: null, despues: { id: ID2 } }] }), /no se puede deshacer/);
  assert.throws(() => validarHistorial({ entidad: "usuarios", cambios: [{ tabla: "hd_hojas", id: ID, antes: null, despues: { id: ID } }] }), /no se puede deshacer/);
  assert.throws(() => validarHistorial({ entidad: "hoja", cambios: [{ tabla: "hd_hojas", id: "x", antes: null, despues: { id: "x" } }] }), /no se puede deshacer/);
});

test("Deshacer: en orden inverso, exigiendo que cada fila siga como quedó", () => {
  const c: CambioHistorial[] = [
    { tabla: "hd_integrantes", id: ID, antes: { id: ID, hoja_id: "a" }, despues: { id: ID, hoja_id: "b" } },
    { tabla: "hd_hojas", id: ID2, antes: null, despues: { id: ID2, fecha: "2026-10-13" } },
  ];
  const actuales = new Map([[`hd_integrantes:${ID}`, { id: ID, hoja_id: "b", updated_at: "x" }], [`hd_hojas:${ID2}`, { id: ID2, fecha: "2026-10-13" }]]);
  const ops = planDeshacer(c, actuales);
  assert.deepEqual(ops.map((o) => [o.op, o.tabla]), [["borrar", "hd_hojas"], ["actualizar", "hd_integrantes"]]);
  assert.deepEqual(ops[1].esperado, { id: ID, hoja_id: "b" });
});

test("Deshacer: si alguien lo cambió después, no se toca nada", () => {
  const c: CambioHistorial[] = [{ tabla: "hd_viajes", id: ID, antes: { id: ID, estado: "planeado" }, despues: { id: ID, estado: "hecho" } }];
  assert.throws(() => planDeshacer(c, new Map([[`hd_viajes:${ID}`, { id: ID, estado: "no_pudo" }]])), /cambió después/);
  // Si ya está como antes (lo hizo alguien a mano), se saltea.
  assert.equal(planDeshacer(c, new Map([[`hd_viajes:${ID}`, { id: ID, estado: "planeado" }]])).length, 0);
});

test("I4: una fila tocada dos veces por el mismo gesto vuelve en dos pasos encadenados", () => {
  const c: CambioHistorial[] = [
    { tabla: "hd_hojas", id: ID, antes: { id: ID, modo: "sin" }, despues: { id: ID, modo: "lleva_trae" } },
    { tabla: "hd_hojas", id: ID, antes: { id: ID, modo: "lleva_trae" }, despues: { id: ID, modo: "todo_el_dia" } },
  ];
  const ops = planDeshacer(c, new Map([[`hd_hojas:${ID}`, { id: ID, modo: "todo_el_dia" }]]));
  assert.deepEqual(ops.map((o) => (o.op === "borrar" ? null : o.valores.modo)), ["lleva_trae", "sin"]);
});
