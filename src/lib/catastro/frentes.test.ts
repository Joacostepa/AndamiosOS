// El frente medido sobre el plano: lotes de mitad de cuadra, esquinas con ochava y polígonos
// que arrancan a mitad de una cara. Manzana de 100 × 100 m en metros, pasada a [lon, lat].

import { test } from "node:test";
import assert from "node:assert/strict";
import { medirFrentes, type Punto } from "./frentes.ts";

const LAT0 = -34.6;
const LON0 = -58.39;
const aGrados = (pts: [number, number][]): Punto[] =>
  pts.map(([x, y]) => [LON0 + x / (Math.cos((LAT0 * Math.PI) / 180) * 111_320), LAT0 + y / 110_574]);
const cerrar = (pts: [number, number][]) => aGrados([...pts, pts[0]]);

const MANZANA = cerrar([[4, 0], [100, 0], [100, 100], [0, 100], [0, 4]]);
const cerca = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 0.05);

test("lote de mitad de cuadra: una cara, el ancho sobre la vereda", () => {
  const r = medirFrentes(cerrar([[40, 0], [48.66, 0], [48.66, 30], [40, 30]]), MANZANA);
  assert.ok(cerca(r.caras, [8.66]), JSON.stringify(r));
});

test("el polígono arranca a mitad del frente: se une en una sola cara", () => {
  const r = medirFrentes(cerrar([[44, 0], [48.66, 0], [48.66, 30], [40, 30], [40, 0]]), MANZANA);
  assert.ok(cerca(r.caras, [8.66]), JSON.stringify(r));
});

test("esquina con ochava: cada cara por separado, la ochava también", () => {
  const r = medirFrentes(cerrar([[4, 0], [20, 0], [20, 25], [0, 25], [0, 4]]), MANZANA);
  assert.ok(cerca([...r.caras].sort((a, b) => a - b), [5.66, 16, 21]), JSON.stringify(r));
});

test("un quiebre chico en el frente queda como tramo corto", () => {
  const r = medirFrentes(cerrar([[40, 0], [45, 0], [45, 0.8], [46, 0.8], [46, 0], [50, 0], [50, 30], [40, 30]]), MANZANA);
  assert.ok(cerca([...r.caras].sort((a, b) => a - b), [4, 5]), JSON.stringify(r));
  assert.ok(r.tramosCortos.includes(1), JSON.stringify(r));
});

test("una parcela interna (sin vereda) no tiene frente", () => {
  const r = medirFrentes(cerrar([[40, 30], [50, 30], [50, 60], [40, 60]]), MANZANA);
  assert.deepEqual(r, { caras: [], tramosCortos: [] });
});
