import { test } from "node:test";
import assert from "node:assert/strict";
import { NOVEDADES, novedadesParaCharla } from "./novedades.ts";

test("una charla de antes de todo se entera de todas las herramientas nuevas", () => {
  const viejo = [{ type: "text", text: "Sos el asistente comercial… cotizar_bandeja, guardar_presupuesto_odoo" }];
  assert.equal(novedadesParaCharla(viejo).length, NOVEDADES.length);
  assert.match(novedadesParaCharla(viejo)[0], /internet/);
});

test("lo que su prompt congelado ya nombra no se repite", () => {
  const delSeis = [{ type: "text", text: "## Internet web_search … verificar_frente_lote … usar_foto_como_render … plan_de_pagos … editar_presupuesto" }];
  const n = novedadesParaCharla(delSeis);
  assert.equal(n.length, 1);
  assert.match(n[0], /ordenar_lineas/);
});

test("una charla nueva no recibe ninguna", () => {
  const nuevo = NOVEDADES.map((x) => x.herramienta).join(" ");
  assert.deepEqual(novedadesParaCharla([{ type: "text", text: nuevo }]), []);
});
