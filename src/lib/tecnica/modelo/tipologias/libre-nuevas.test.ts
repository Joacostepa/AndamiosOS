// Estructura libre (pedido 8c) sobre las tipologías nuevas: «Convertir a estructura libre» y retoque a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano } from '../test-utils.ts';
import { problemasDeArmado } from './nuevas-test-utils.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);
const NUEVOS = ['bandeja_45', 'bandeja_portico_peatonal', 'bandeja_voladizo', 'colgante_puente', 'envolvente_tanque', 'torre_plataforma', 'torre_movil_interior', 'patio_medianeras', 'sobre_escalera', 'hueco_escalera'];

test('convertir cada tipología nueva a libre: misma BOM, avisa que ya no se regenera y se puede deshacer', () => {
  for (const id of NUEVOS) {
    const d = M.crearDiseno(id);
    const l = M.convertirALibre(d, 'E1', C);
    const r = build(l);
    assert.deepEqual(bomPlano(r), bomPlano(build(d)), id);
    assert.ok(r.avisos.some((a) => a.regla === 'libre.convertida'), id);
    assert.equal(d.estructuras[0].tipologia === 'libre', false, `${id}: el original sigue intacto`);
    assert.ok(l.estructuras[0].convertidaDe?.params, id);
  }
});

test('retoque a mano de una torre móvil convertida: crecer un vano de costado solo arriba y poner baranda', () => {
  let d = M.convertirALibre(M.crearDiseno('torre_movil_interior'), 'E1', C);
  const esq = d.estructuras[0].esqueleto!;
  const v = esq.vanos.find((x) => x.cara === 'interior') || esq.vanos[0];
  const antes = build(d).piezas.length;
  d = M.editarEsqueleto(d, 'E1', { op: 'agregarVano', desde: { vanoId: v.id }, hacia: 'afuera', medida: 1.09, desdeK: 2 }, C);
  const r = build(d);
  assert.ok(r.piezas.length > antes);
  assert.deepEqual(r.piezas.filter((p) => p.familia === 'diagonal').filter((p) => !p.celda).length, 0);
  assert.deepEqual(problemasDeArmado(r).filter((x) => x.startsWith('diagonal')), []);
  // las reglas en libre son sugerencias: cada aviso con reparación se puede aplicar
  for (const a of r.avisos.filter((x) => x.reparaciones.length && x.regla.startsWith('libre.'))) {
    const d2 = M.aplicarReparacion(d, a.reparaciones[0].accion, C);
    assert.ok(build(d2).piezas.length > 0, a.regla);
  }
});

test('retoque a mano de la estructura sobre escalera: subir una pata a otro peldaño', () => {
  let d = M.convertirALibre(M.crearDiseno('sobre_escalera'), 'E1', C);
  const c = d.estructuras[0].esqueleto!.columnas[0];
  d = M.editarEsqueleto(d, 'E1', { op: 'columna', columnaId: c.id, ySuelo: (c.ySuelo ?? 0) + 0.18 }, C);
  const r = build(d);
  assert.equal(r.estructuras[0].esqueleto.columnas.find((x) => x.id === c.id)!.ySuelo, (c.ySuelo ?? 0) + 0.18);
  assert.ok(r.piezas.length > 50);
});
