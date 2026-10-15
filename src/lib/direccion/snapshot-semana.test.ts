import { test } from "node:test";
import assert from "node:assert/strict";
import { accionesQueInvalidan, filasDeSnapshot, inicioDiaBA } from "./snapshot.ts";
import type { ResultadoPantalla } from "./tipos.ts";

const base: ResultadoPantalla = {
  pantalla: "semana", tc: null, avisos: [], detalle: { titulos: {} },
  lectura: { tomadoAt: "2026-10-15T07:30:00Z", fuente: "vivo" },
  cifras: [{ kpi: "caja_disponible", id: "semana_caja", valor: { tipo: "monto", monto: { ars: 1 } }, confianza: { nivel: "ok" } }],
};

test("snapshot: con algo reservado, la fila '*' completa va reservada y hay otra '*' recortada", () => {
  const r: ResultadoPantalla = {
    ...base,
    cifras: [...base.cifras, { kpi: "retiros", id: "semana_retiros", reservado: true, valor: { tipo: "monto", monto: { ars: 9, usd: 1 } }, confianza: { nivel: "inc" } }],
    oraciones: [{ id: "retiros_anio", frase: ["x"], reservado: true }],
    detalle: { titulos: {}, reservado: { retiros: { pctResultado: 28 } } },
  };
  const f = filasDeSnapshot(r);
  const estrellas = f.filter((x) => x.kpi_id === "*");
  assert.equal(estrellas.length, 2);
  assert.equal(estrellas[0].reservado, true);
  assert.equal(estrellas[1].reservado, false);
  assert.doesNotMatch(JSON.stringify(estrellas[1].detalle), /retiros|pctResultado/);
  assert.equal(f.find((x) => x.kpi_id === "semana_retiros")?.reservado, true);
});

test("snapshot: sin nada reservado, una sola fila '*' pública", () => {
  const f = filasDeSnapshot(base);
  assert.deepEqual(f.map((x) => [x.kpi_id, x.reservado]), [["*", false], ["semana_caja", false]]);
});

test("snapshot de hoy: qué 'Actualizar ahora' lo deja viejo", () => {
  assert.equal(accionesQueInvalidan("semana"), "todas");
  assert.deepEqual(accionesQueInvalidan("caja"), ["actualizar:caja", "actualizar:semana"]);
  assert.equal(inicioDiaBA("2026-10-15"), "2026-10-15T00:00:00-03:00");
});

test("snapshot: una cifra de un indicador reservado (retiros) va reservada aunque le falte la marca", () => {
  const r: ResultadoPantalla = {
    ...base,
    cifras: [...base.cifras, { kpi: "retiros", id: "retiros_sin_marca", valor: { tipo: "monto", monto: { ars: 9 } }, confianza: { nivel: "inc" } }],
  };
  const f = filasDeSnapshot(r);
  assert.equal(f.find((x) => x.kpi_id === "retiros_sin_marca")?.reservado, true);
  // Y la fila '*' pública no la lleva (mismo recorte que en pantalla).
  const publica = f.find((x) => x.kpi_id === "*" && !x.reservado);
  assert.doesNotMatch(JSON.stringify(publica?.detalle ?? {}), /retiros_sin_marca/);
});
