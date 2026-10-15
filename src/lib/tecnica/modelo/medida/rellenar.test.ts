// Medida libre (pedido 8): cualquier largo/alto/ancho; el ajuste sale en caño y grampa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { rellenarLargo } from './rellenar.ts';
import { diagonalesFueraDeNodo } from '../test-utils.ts';

const C = M.CATALOGO_FIXTURE;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('libre: 7,30 → 2×2,50 + 2,00 + ajuste 0,30 con caño y grampas', () => {
  const r = rellenarLargo(7.3, 'multi', { modo: 'libre' });
  assert.equal(r.texto, '7,30 → 2×2,50 + 2,00 + ajuste 0,30 con caño y grampas');
  assert.equal(r.desvio, 0);
  assert.equal(r.total, 7.3);
  assert.deepEqual(r.vanos.filter((t) => t.libre).map((t) => t.medida), [0.3]);
  assert.ok(r.alternativas.some((a) => a.id === 'solo_catalogo'));
});

test('libre: cualquier largo queda exacto, con un solo tramo libre entre 0,20 y 2,50', () => {
  for (let L = 0.5; L <= 40; L += 0.37) {
    const r = rellenarLargo(L, 'multi', { modo: 'libre' });
    assert.ok(Math.abs(r.total - L) < 0.006, `${L}: ${r.texto}`);
    const libres = r.vanos.filter((t) => t.libre);
    assert.ok(libres.length <= 1, `${L}: ${r.texto}`);
    for (const t of libres) assert.ok(t.medida >= 0.2 - 1e-9 && t.medida <= 2.5 + 1e-9, `${L}: ${r.texto}`);
    assert.ok(r.vanos.filter((t) => !t.libre).every((t) => C.medidas.multi.vanos.includes(t.medida)));
  }
});

test('libre: si el largo sale exacto con catálogo, no hay ajuste', () => {
  const r = rellenarLargo(14, 'multi', { modo: 'libre' });
  assert.ok(r.vanos.every((t) => !t.libre));
  assert.equal(r.texto, '14,00 → 5×2,50 + 1,50');
});

test('libre centrado: el tramo de ajuste queda en el medio', () => {
  const r = rellenarLargo(10.3, 'multi', { modo: 'libre', ajuste: 'centrado' });
  const i = r.vanos.findIndex((t) => t.libre);
  assert.ok(i > 0 && i < r.vanos.length - 1, r.texto);
});

test('catálogo (default ágil): el desvío fuera de tolerancia ofrece «Pasar a medida libre»', () => {
  const d = M.crearDiseno('estructura', { frentes: [{ largo: 7.3 }] });
  const r = M.construir(d, C);
  const av = r.avisos.find((a) => a.regla === 'medida.desvio');
  if (av) assert.ok(av.reparaciones.some((x) => x.etiqueta === 'Pasar a medida libre'));
  const libre = M.construir(M.aplicarReparacion(d, { tipo: 'medida', estructuraId: 'E1', modo: 'libre' }), C);
  assert.ok(!libre.avisos.some((a) => a.regla === 'medida.desvio'));
});

test('fachada en medida libre: vano de ajuste con caño y grampa, tablón volado y diagonales nodo a nodo', () => {
  const d = M.crearDiseno('estructura', { frentes: [{ largo: 7.3 }], altura: 8, medida: 'libre' });
  const r = M.construir(d, C);
  const F = (r.estructuras[0].info.frentes as { vanos: number[]; texto: string }[])[0];
  assert.equal(sum(F.vanos), 7.3);
  assert.match(F.texto, /ajuste 0,30 con caño y grampas/);
  const ajuste = r.bom.filter((l) => l.esAjuste);
  assert.ok(ajuste.length > 0 && ajuste.every((l) => l.grupo === 'Ajuste con caño y grampa'));
  assert.ok(ajuste.some((l) => /^CAÑO-/.test(l.codigo || '')) && ajuste.some((l) => l.codigo === 'NUDO-FIJO'));
  // la diagonal del vano de ajuste (arriostrado por ser extremo) es caño con grampas giratorias
  assert.ok(r.piezas.some((p) => p.familia === 'grampa_giratoria' && p.ajuste));
  assert.ok(r.piezas.some((p) => p.familia === 'tablon' && p.ajuste?.medidaPedida === 0.3));
  assert.ok(r.avisos.some((a) => a.regla === 'plataforma.tablon_volado'));
  assert.deepEqual(diagonalesFueraDeNodo(r), []);
  assert.ok(r.resumen.piezasAjuste > 0);
});

test('profundidad libre: transversales de caño y tablones que entran + fenólico de relleno', () => {
  const r = M.construir(M.crearDiseno('estructura', { frentes: [{ largo: 5 }], altura: 6, profundidad: 0.9, medida: 'libre' }), C);
  assert.equal(r.estructuras[0].info.prof, 0.9);
  assert.ok(r.piezas.some((p) => p.familia === 'cano' && p.ajuste && /:h:f0t/.test(p.id)), 'transversal de caño');
  assert.ok(r.piezas.some((p) => p.familia === 'fenolico' && p.ajuste?.motivo === 'profundidad_libre'), 'fenólico de relleno');
});

test('altura libre: el último nivel queda donde se pide y el tornillón absorbe la diferencia', () => {
  const r = M.construir(M.crearDiseno('estructura', { frentes: [{ largo: 5 }], altura: 12.37, medida: 'libre' }), C);
  const F = (r.estructuras[0].info.frentes as { niveles: { cota: number }[]; ARR: number }[])[0];
  assert.equal(F.niveles.at(-1)!.cota, 11.37);
  assert.ok(F.ARR >= 0.25 && F.ARR <= 0.75);
});

test('altura fuera de roseta en la estructura libre: anillo de caño y grampa marcado como ajuste', () => {
  let d = M.crearDiseno('libre_vacia');
  const c0 = d.estructuras[0].esqueleto!.cotas[0];
  d = M.editarEsqueleto(d, 'E1', { op: 'agregarNivel', cota: c0 + 0.8 });
  const r = M.construir(d, C);
  const k = r.estructuras[0].esqueleto.cotas.findIndex((c) => Math.abs(c - (c0 + 0.8)) < 1e-6);
  const hs = r.piezas.filter((p) => p.celda?.endsWith(`@${k}`) && p.familia === 'cano');
  assert.ok(hs.length > 0 && hs.every((p) => p.ajuste?.motivo === 'altura_libre'));
});
