// Estructura libre (pedido 8c): grilla 3D editable a mano; las reglas quedan como sugerencias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import type { Diseno } from '../index.ts';
import { diagonalesFueraDeNodo } from '../test-utils.ts';

const C = M.CATALOGO_FIXTURE;
const esq = (d: Diseno) => d.estructuras[0].esqueleto!;
const op = (d: Diseno, o: M.OpEsqueleto) => M.editarEsqueleto(d, 'E1', o, C);

test('libre vacía: un vano de 2,50 × 0,73 con plataforma, barandas y diagonales; produce BOM', () => {
  const d = M.crearDiseno('libre_vacia');
  const e = esq(d);
  assert.equal(e.columnas.length, 4);
  assert.equal(e.panos.length, 1);
  assert.deepEqual(M.validarEsqueleto(e), []);
  const r = M.construir(d, C);
  assert.ok(r.bom.some((l) => l.codigo === 'TAB-MET-250'));
  assert.ok(r.bom.some((l) => l.codigo === 'HOR-048-250'));
  assert.ok(!r.avisos.some((a) => a.nivel === 'error'), r.avisos.map((a) => a.texto).join(' | '));
});

test('crecer de costado, hacia afuera y solo en una zona; los ids no se renumeran', () => {
  let d = M.crearDiseno('libre_vacia');
  const e0 = esq(d);
  const ext = e0.vanos.find((v) => v.cara === 'exterior')!;
  const ids0 = e0.columnas.map((c) => c.id);
  d = op(d, { op: 'agregarVano', desde: { vanoId: ext.id }, hacia: 'der', medida: 2.0 });
  assert.equal(esq(d).panos.length, 2);
  assert.deepEqual(esq(d).columnas.slice(0, 4).map((c) => c.id), ids0);
  d = op(d, { op: 'agregarVano', desde: { vanoId: ext.id }, hacia: 'afuera', medida: 1.09 });
  assert.equal(esq(d).panos.length, 3);
  assert.deepEqual(M.validarEsqueleto(esq(d)), []);
  // la baranda pasó a la cara nueva
  const r = M.construir(d, C);
  assert.ok(r.piezas.some((p) => p.familia === 'tablon' && p.medidas.largo === 2.0));
  // crecer arriba solo en una zona: un nivel nuevo solo sobre el primer paño
  const cols = esq(d).panos[0].vanos.flatMap((id) => { const v = esq(d).vanos.find((x) => x.id === id)!; return [v.a, v.b]; });
  const top = Math.max(...esq(d).cotas);
  d = op(d, { op: 'agregarNivel', cota: top + 2, columnas: [...new Set(cols)] });
  const altas = esq(d).columnas.filter((c) => c.yTope > top + 2);
  assert.equal(altas.length, 4);
  assert.deepEqual(diagonalesFueraDeNodo(M.construir(d, C)), []);
});

test('medida de un vano libre → caño y grampa; volver a catálogo', () => {
  let d = M.crearDiseno('libre_vacia');
  const ext = esq(d).vanos.find((v) => v.cara === 'exterior')!;
  d = op(d, { op: 'medidaVano', vanoId: ext.id, medida: 1.37 });
  assert.equal(esq(d).vanos.find((v) => v.id === ext.id)!.libre, true);
  const r = M.construir(d, C);
  assert.ok(r.bom.some((l) => l.esAjuste && /^CAÑO-/.test(l.codigo || '')));
  d = op(d, { op: 'medidaVano', vanoId: ext.id, medida: 1.5 });
  assert.equal(esq(d).vanos.find((v) => v.id === ext.id)!.libre, false);
});

test('pincel por celda, nodo y columna; apoyos a distinto nivel', () => {
  let d = M.crearDiseno('libre_vacia');
  const e = esq(d);
  const ext = e.vanos.find((v) => v.cara === 'exterior')!;
  const k = e.cotas.length - 1;
  d = op(d, { op: 'celda', clave: `${ext.id}@${k}`, valor: { cerramiento: 'lona' } });
  d = op(d, { op: 'nodo', clave: `${ext.a}@${k}`, valor: { anclaje: { retiro: 0.6 } } });
  d = op(d, { op: 'columna', columnaId: ext.a, ySuelo: 0.17, yBase: 0.5 });
  const r = M.construir(d, C);
  assert.ok(r.bom.some((l) => l.codigo === 'LONA-PVC'));
  assert.equal(r.resumen.anclajes, 1);
  assert.ok(r.piezas.some((p) => p.ajuste?.motivo === 'amarre'), 'amarre largo con caño');
  d = op(d, { op: 'celda', clave: `${ext.id}@${k}`, valor: null });
  assert.equal(esq(d).celdas[`${ext.id}@${k}`], undefined);
});

test('reglas en modo sugerencias: avisan con reparación pero no cambian el esqueleto', () => {
  let d = M.crearDiseno('libre_vacia');
  const e = esq(d);
  for (const [clave, ce] of Object.entries(e.celdas)) if (ce.diagonal) d = op(d, { op: 'celda', clave, valor: { diagonal: null } });
  for (const [clave, ce] of Object.entries(esq(d).celdas)) if (ce.baranda) d = op(d, { op: 'celda', clave, valor: { baranda: null } });
  const r = M.construir(d, C);
  assert.ok(!r.piezas.some((p) => p.familia === 'diagonal'), 'no se impone');
  const diag = r.avisos.find((a) => a.regla === 'libre.diag.falta')!;
  const bar = r.avisos.find((a) => a.regla === 'libre.baranda.falta')!;
  assert.ok(diag && bar);
  let d2 = M.aplicarReparacion(d, diag.reparaciones[0].accion, C);
  d2 = M.aplicarReparacion(d2, bar.reparaciones[0].accion, C);
  const r2 = M.construir(d2, C);
  assert.ok(!r2.avisos.some((a) => a.regla === 'libre.diag.falta' || a.regla === 'libre.baranda.falta'));
  assert.ok(r2.piezas.some((p) => p.familia === 'diagonal'));
});

test('quitar vano y nivel, elementos', () => {
  let d = M.crearDiseno('libre_desde_medidas');
  const n0 = esq(d).vanos.length;
  const ext = esq(d).vanos.filter((v) => v.cara === 'exterior');
  d = op(d, { op: 'quitarVano', vanoId: ext[ext.length - 1].id });
  assert.ok(esq(d).vanos.length < n0);
  assert.deepEqual(M.validarEsqueleto(esq(d)), []);
  const k = esq(d).cotas.length;
  d = op(d, { op: 'quitarNivel', k: 1 });
  assert.equal(esq(d).cotas.length, k - 1);
  assert.deepEqual(M.validarEsqueleto(esq(d)), []);
  d = op(d, { op: 'agregarElemento', elemento: { id: 'v1', familia: 'viga_puente', medidas: { largo: 2.5 }, a: [0, 3, 0], b: [2.5, 3, 0] } });
  d = op(d, { op: 'moverElemento', id: 'v1', delta: [0, 0.5, 0] });
  assert.equal(esq(d).elementos.find((x) => x.id === 'v1')!.a[1], 3.5);
  assert.ok(M.construir(d, C).bom.some((l) => l.codigo === 'VIGA-PTE-250'));
  d = op(d, { op: 'quitarElemento', id: 'v1' });
  assert.ok(!esq(d).elementos.some((x) => x.id === 'v1'));
});

test('libre desde medidas en medida libre: 7,30 × 1,09 × 6', () => {
  const d = M.crearDiseno('libre_desde_medidas', { medida: 'libre' });
  const ext = esq(d).vanos.filter((v) => v.cara === 'exterior');
  assert.equal(Math.round(ext.reduce((s, v) => s + v.medida, 0) * 100) / 100, 7.3);
  assert.ok(ext.some((v) => v.libre));
  const r = M.construir(d, C);
  assert.ok(r.bom.some((l) => l.esAjuste));
  assert.deepEqual(diagonalesFueraDeNodo(r), []);
});
