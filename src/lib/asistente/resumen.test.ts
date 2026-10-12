// Lo que vuelve al modelo después de un cambio (auditoría 12/10, 2.6): lo que cambió y los
// totales, no el borrador entero.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import { borradorVacio, ordenarLineas, recalcular, type DatosBorrador } from "./borrador.ts";
import { cambiosParaModelo, type BorradorParaResumen } from "./resumen.ts";

const ctx = { tarifas: T, lista: null, hoy: "2026-10-12" };

function b(datos: DatosBorrador, version: number): BorradorParaResumen {
  return { version, estado: "en_curso", odoo_venta_nombre: null, datos, resultado: recalcular(datos, ctx) };
}

const conBandeja = (metros: number): DatosBorrador => ({
  ...borradorVacio(),
  obra: { direccion: "Chile 865", enCaba: false, lote: null },
  calculos: { bandeja: { metros, altura: 3, concertina: "opcional", gestoria: "no", enCaba: false } },
});

test("cambiar los metros: sólo los renglones que cambian, con totales y faltantes", () => {
  const r = cambiosParaModelo(b(conBandeja(10), 1), b(conBandeja(15), 2));
  assert.equal(r.version, 2);
  assert.ok(r.cambian?.some((l) => l.id === "bandeja"));
  assert.equal(r.entran, undefined);
  assert.equal(r.salen, undefined);
  assert.ok(r.subtotal > 0);
  assert.ok(Array.isArray(r.faltantesParaGuardar));
  // No viaja el borrador entero.
  assert.equal((r as Record<string, unknown>).datos, undefined);
});

test("un dato del encabezado: dice qué cambió y que los renglones no", () => {
  const antes = conBandeja(10);
  const despues = { ...antes, cliente: { ...antes.cliente, razonSocial: "Consorcio Chile 865", esNuevo: true } };
  const r = cambiosParaModelo(b(antes, 1), b(despues, 2));
  assert.deepEqual(r.datos, { cliente: "Consorcio Chile 865 (nuevo)" });
  assert.equal(r.renglones, "sin cambios en los renglones");
});

test("sacar todo: los renglones que salen, con su id", () => {
  const r = cambiosParaModelo(b(conBandeja(10), 1), b({ ...conBandeja(10), calculos: {} }, 2));
  assert.ok(r.salen?.some((l) => l.id === "bandeja"));
  assert.equal(r.subtotal, 0);
});

test("ordenar: los listados primero y en ese orden; el resto después, y el subtotal no cambia", () => {
  const ls = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(ordenarLineas(ls, ["c", "a", "zz"]).map((l) => l.id), ["c", "a", "b", "d"]);
  const antes = conBandeja(10);
  const ids = recalcular(antes, ctx).lineas.map((l) => l.id);
  const despues = { ...antes, ordenLineas: [...ids].reverse() };
  const r = cambiosParaModelo(b(antes, 1), b(despues, 2));
  assert.deepEqual(r.orden, [...ids].reverse());
  assert.equal(r.subtotal, recalcular(antes, ctx).totales.subtotal);
});
