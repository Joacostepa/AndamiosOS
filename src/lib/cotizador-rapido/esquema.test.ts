// El guardado del cotizador: un texto largo no puede rechazar todo lo cargado (JS, 19/11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { borradorVacio } from "../asistente/borrador.ts";
import { formularioDesdeBorrador } from "./formulario.ts";
import { esquemaFormulario } from "./esquema.ts";

test("un alcance largo se guarda (el de COSAGO pasó los 300 caracteres de antes)", () => {
  const f = formularioDesdeBorrador(borradorVacio());
  const alcance = "Provisión, armado y desarme de andamio tubular sobre la medianera. ".repeat(10);
  const r = esquemaFormulario.safeParse({ ...f, tipo: "desglosado", desglose: { ...f.desglose, trabajo: alcance } });
  assert.ok(r.success);
  assert.equal(r.data.desglose.trabajo, alcance);
});

test("un texto más largo que el tope se corta, no rechaza el guardado", () => {
  const f = formularioDesdeBorrador(borradorVacio());
  const r = esquemaFormulario.safeParse({ ...f, desglose: { ...f.desglose, trabajo: "x".repeat(5000) }, ia: { trabajo: { cita: "y".repeat(3000), deducido: true } } });
  assert.ok(r.success);
  assert.equal(r.data.desglose.trabajo.length, 4000);
  assert.equal(r.data.ia.trabajo.cita.length, 2000);
});

test("lo que no es texto se sigue rechazando", () => {
  const f = formularioDesdeBorrador(borradorVacio());
  assert.equal(esquemaFormulario.safeParse({ ...f, plazoDias: -3 }).success, false);
});
