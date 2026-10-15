import { test } from "node:test";
import assert from "node:assert/strict";
import { aUsd, normalizarSerie, tcEn, tcHoy, tcPromedioMes } from "./dolar.ts";

const serie = normalizarSerie([
  { fecha: "2026-10-15", valor: 1617.3 },
  { fecha: "2026-10-12", valor: 1606.6 },
  { fecha: "2026-10-13", valor: 1606.6 },
  { fecha: "2026-10-14", valor: 1613.8 },
  { fecha: "2026-09-30", valor: 1500 },
  { fecha: "malo", valor: 1 },
  { fecha: "2026-10-01", valor: 0 },
]);

test("normalizarSerie ordena y descarta lo inválido", () => {
  assert.deepEqual(serie.map((t) => t.fecha), ["2026-09-30", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
});

test("tcEn: la última cotización con fecha <= la pedida", () => {
  assert.deepEqual(tcEn(serie, "2026-10-14"), { fecha: "2026-10-14", valor: 1613.8 });
  // Fin de semana / día sin cotización: vale la anterior.
  assert.deepEqual(tcEn(serie, "2026-10-05"), { fecha: "2026-09-30", valor: 1500 });
  assert.deepEqual(tcHoy(serie, "2026-10-20"), { fecha: "2026-10-15", valor: 1617.3 });
  // Antes de la primera: sin dato, no se inventa.
  assert.equal(tcEn(serie, "2025-01-01"), null);
  assert.equal(tcEn([], "2026-10-15"), null);
});

test("aUsd y promedio del mes", () => {
  assert.equal(aUsd(serie, 1_617_300, "2026-10-15"), 1000);
  assert.equal(aUsd(serie, 1000, "2020-01-01"), null);
  assert.equal(tcPromedioMes(serie, "2026-10"), (1606.6 + 1606.6 + 1613.8 + 1617.3) / 4);
  assert.equal(tcPromedioMes(serie, "2026-08"), null);
});
