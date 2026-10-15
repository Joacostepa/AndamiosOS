import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionarNodos } from './fusionar.ts';
import type { Pieza, V3 } from './tipos.ts';

const pz = (id: string, familia: Pieza['familia'], a: V3, b: V3, owner = 'E1', codigo: string | null = null): Pieza =>
  ({ id: `${owner}:${id}`, familia, medidas: familia === 'cano' ? { largo: 2.4 } : {}, codigo, peso_kg: null, a, b, estructuraId: owner, owner });

test('fusionarNodos: dos diagonales de caño que llegan al mismo nodo suman 4 grampas', () => {
  const n: V3 = [2, 2, 0];
  const piezas = [
    pz('d:a', 'cano', [0, 0, 0], n, 'E1', 'CAÑO-240'), pz('d:a:g0', 'grampa_giratoria', [0, 0, 0], [0, 0, 0], 'E1', 'NUDO-GIR'), pz('d:a:g1', 'grampa_giratoria', n, n, 'E1', 'NUDO-GIR'),
    pz('d:b', 'cano', [4, 0, 0], n, 'E1', 'CAÑO-240'), pz('d:b:g0', 'grampa_giratoria', [4, 0, 0], [4, 0, 0], 'E1', 'NUDO-GIR'), pz('d:b:g1', 'grampa_giratoria', n, n, 'E1', 'NUDO-GIR'),
  ];
  const r = fusionarNodos(piezas);
  assert.equal(r.piezas.filter((p) => p.familia === 'grampa_giratoria').length, 4);
});

test('fusionarNodos: un caño idéntico de otra estructura se va con sus grampas', () => {
  const a: V3 = [0, 1, 0];
  const b: V3 = [2.4, 1, 0];
  const piezas = [
    pz('h', 'cano', a, b, 'E1', 'CAÑO-240'), pz('h:g0', 'grampa_fija', a, a, 'E1', 'NUDO-FIJO'), pz('h:g1', 'grampa_fija', b, b, 'E1', 'NUDO-FIJO'),
    pz('h', 'cano', a, b, 'E2', 'CAÑO-240'), pz('h:g0', 'grampa_fija', a, a, 'E2', 'NUDO-FIJO'), pz('h:g1', 'grampa_fija', b, b, 'E2', 'NUDO-FIJO'),
  ];
  const r = fusionarNodos(piezas);
  assert.equal(r.piezas.filter((p) => p.familia === 'cano').length, 1);
  assert.equal(r.piezas.filter((p) => p.familia === 'grampa_fija').length, 2);
});
