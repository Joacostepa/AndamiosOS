import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreDelCliente } from "./nombre-cliente.ts";

test("a nombre de quién: el nombre, el contacto, el perfil y, si no hay nada, el teléfono provisorio", () => {
  assert.deepEqual(nombreDelCliente({ ficha: { nombre: "Carlos Pérez" }, nombre_perfil: null, telefono: "5491100000000" }), { nombre: "Carlos Pérez", provisorio: false });
  assert.deepEqual(nombreDelCliente({ ficha: { contacto: " Ana " }, nombre_perfil: "Cerrajería", telefono: "5491100000000" }), { nombre: "Ana", provisorio: false });
  assert.deepEqual(nombreDelCliente({ ficha: {}, nombre_perfil: "Marcelo", telefono: "5491100000000" }), { nombre: "Marcelo", provisorio: false });
  assert.deepEqual(nombreDelCliente({ ficha: { nombre: "  " }, nombre_perfil: null, telefono: "5491100000000" }), { nombre: "Cliente WhatsApp +5491100000000", provisorio: true });
});
