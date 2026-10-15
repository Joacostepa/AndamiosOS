// El pincel de ménsula y de anclaje sobre plantillas que no son fachada (torres, bandejas…):
// el override de la celda pone la ménsula o el anclaje en los dos nodos del vano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { porFamilia } from '../test-utils.ts';

const C = M.CATALOGO_FIXTURE;

test('torre móvil: ménsula pintada en una celda exterior sale volada con tablones y parantes de baranda', () => {
  const d = M.crearDiseno('torre_movil_interior');
  const r0 = M.construir(d, C);
  const e = r0.estructuras[0];
  const k = e.esqueleto.cotas.length - 1;
  const v = e.esqueleto.vanos.find((x) => x.cara === 'exterior') ?? e.esqueleto.vanos[0];
  const clave = M.celdaId(v.id, k);
  const d1 = structuredClone(d);
  d1.estructuras[0].overrides = { [clave]: { mensula: 'afuera' } };
  const f0 = porFamilia(r0), f1 = porFamilia(M.construir(d1, C));
  assert.equal(f0.mensula ?? 0, 0);
  assert.equal(f1.mensula, 2, 'una ménsula por columna del vano');
  assert.ok((f1.tablon ?? 0) > (f0.tablon ?? 0), 'tablones sobre las ménsulas');
  assert.ok((f1.vertical ?? 0) > (f0.vertical ?? 0), 'parantes de baranda en la punta');
});

test('torre: anclaje pintado agrega anclajes en los nodos del vano', () => {
  const d = M.crearDiseno('torre_movil_interior');
  const e = M.construir(d, C).estructuras[0];
  const v = e.esqueleto.vanos[0];
  const d1 = structuredClone(d);
  d1.estructuras[0].overrides = { [M.celdaId(v.id, 1)]: { anclaje: true } };
  assert.ok((porFamilia(M.construir(d1, C)).anclaje ?? 0) > (porFamilia(M.construir(d, C)).anclaje ?? 0));
});

test('fachada: la ménsula pintada no se duplica (la fachada la lee de su banda)', () => {
  const d = M.ejemploParana631();
  const r0 = M.construir(d, C);
  const e = r0.estructuras[0];
  const v = e.esqueleto.vanos.find((x) => x.cara === 'exterior')!;
  const d1 = structuredClone(d);
  d1.estructuras[0].overrides = { ...(d1.estructuras[0].overrides ?? {}), [M.celdaId(v.id, 3)]: { mensula: 'afuera' } };
  const m = porFamilia(M.construir(d1, C)).mensula ?? 0;
  assert.ok(m <= 2, `a lo sumo 2 ménsulas por una celda, salieron ${m}`);
});
