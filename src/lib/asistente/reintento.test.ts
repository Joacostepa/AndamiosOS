import { test } from "node:test";
import assert from "node:assert/strict";
import { esReintentable, motivoSinReintento, VENTANA_REINTENTO_MS } from "./reintento.ts";

const ahora = Date.parse("2026-10-12T15:00:00Z");
const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();
const accion = (x: Partial<{ tipo: string; estado: string; created_at: string; borrador_version: number | null }> = {}) => ({
  tipo: "guardar_presupuesto", estado: "incierto", created_at: hace(10), borrador_version: 7, ...x,
});

test("en error o incierta, guardar o mandar el mail: se puede reintentar", () => {
  assert.equal(esReintentable(accion(), ahora), true);
  assert.equal(esReintentable(accion({ estado: "error", tipo: "enviar_mail" }), ahora), true);
  assert.equal(esReintentable(accion({ tipo: "reemitir_presupuesto" }), ahora), true);
});

test("ok, vencida, propuesta o de otro tipo: no", () => {
  for (const estado of ["ok", "vencida", "propuesta", "presentada", "ejecutando", "rechazada", "reemplazada"]) {
    assert.equal(esReintentable(accion({ estado }), ahora), false, estado);
  }
  assert.equal(esReintentable(accion({ tipo: "avisar_joaquin" }), ahora), false);
});

test("pasado un día ya no se reintenta", () => {
  assert.equal(esReintentable(accion({ created_at: new Date(ahora - VENTANA_REINTENTO_MS).toISOString() }), ahora), false);
});

test("el servidor además mira el presupuesto: si cambió o se descartó, no", () => {
  assert.equal(motivoSinReintento(accion(), { version: 7, estado: "en_odoo" }, ahora), null);
  assert.match(motivoSinReintento(accion(), { version: 8, estado: "en_odoo" }, ahora)!, /cambió/);
  assert.match(motivoSinReintento(accion(), { version: 7, estado: "descartado" }, ahora)!, /otra conversación/);
  assert.match(motivoSinReintento(accion({ estado: "ok" }), null, ahora)!, /ya se ejecutó/);
});
