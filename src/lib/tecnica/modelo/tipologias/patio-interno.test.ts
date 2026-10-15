// Patio interno entre medianeras (pedido 7, foto 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarPatio } from './patio-interno.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('patio: normalizar total', () => {
  const r = normalizarPatio({ muros: [9, 'x'], modo: 'otro', ancho: 0 } as never);
  assert.deepEqual(r.params.muros, [0]);
  assert.equal(r.params.modo, 'pared');
  assert.equal(r.params.ancho, 1.5);
});

test('patio: golden por preset, bien armado (esquinas compartidas, sin cruces) y misma BOM en libre', () => {
  const esperado: Record<string, Record<string, number>> = {
    patio_medianeras: { vertical: 80, horizontal: 160, diagonal: 25, tablon: 50, base_regulable: 10, anclaje: 32, escalera_interior: 7, tablon_escotilla: 6, cano: 3 },
    patio_perimetral: { vertical: 144, horizontal: 256, diagonal: 40, tablon: 106, base_regulable: 24, anclaje: 30, escalera_interior: 5, tablon_escotilla: 4, cano: 82 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    assert.deepEqual(r.resumen.sinCodigo, [], id);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
});

test('patio entre medianeras: anclado al fondo y a las dos medianeras, todo dentro del patio', () => {
  const r = build(M.crearDiseno('patio_medianeras'));
  const anc = r.piezas.filter((p) => p.familia === 'anclaje');
  assert.ok(anc.some((p) => p.b[0] < p.a[0]) && anc.some((p) => p.b[0] > p.a[0]) && anc.some((p) => p.b[2] < p.a[2]), 'anclajes a izquierda, derecha y fondo');
  assert.ok(r.piezas.filter((p) => p.familia === 'vertical').every((p) => p.a[0] > 0 && p.a[0] < 7.6 && p.a[2] > 0 && p.a[2] < 5));
});

test('patio: medida de catálogo que no entra entre medianeras → error con «Pasar a medida libre»', () => {
  // 7,20: el relleno de catálogo se pasa 2 cm, pero hay una alternativa que entra
  const r72 = build(M.crearDiseno('patio_medianeras', { params: { ancho: 7.2 } }));
  assert.ok(r72.reglas.some((x) => x.regla === 'patio.relleno'));
  assert.ok(!r72.avisos.some((a) => a.regla === 'patio.medianeras'));
  // 7,35: ninguna combinación de catálogo entra
  let d = M.crearDiseno('patio_medianeras', { params: { ancho: 7.35 } });
  let r = build(d);
  const av = r.avisos.find((a) => a.regla === 'patio.medianeras' || a.regla === 'patio.hueco')!;
  assert.ok(av);
  d = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  r = build(d);
  assert.ok(!r.avisos.some((a) => a.regla === 'patio.medianeras' || a.regla === 'patio.hueco'));
  const xs = r.piezas.filter((p) => p.familia === 'vertical').map((p) => p.a[0]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - (7.35 - 0.4)) < 0.006);
});
