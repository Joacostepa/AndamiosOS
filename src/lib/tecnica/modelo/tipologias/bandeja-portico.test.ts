// Pórtico peatonal con bandeja (pedido 3): paso libre bajo el gálibo, vigas de celosía y visera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarBandejaPortico } from './bandeja-portico.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('pórtico con bandeja: normalizar total', () => {
  const r = normalizarBandejaPortico({ paso: -3, galibo: 99, visera: null, vuelo: 'x' } as never);
  assert.equal(r.params.paso, 0.73);
  assert.equal(r.params.galibo, 6);
  assert.equal(r.params.vuelo, 0);
});

test('pórtico con bandeja: golden, bien armado y misma BOM al convertir a libre', () => {
  const d = M.crearDiseno('bandeja_portico_peatonal');
  const r = build(d);
  assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), { vertical: 22, horizontal: 32, diagonal: 4, tablon: 25, viga_celosia: 2, base_regulable: 10, anclaje: 4, cano: 20 });
  assert.deepEqual(problemasDeArmado(r), []);
  assert.deepEqual(r.resumen.sinCodigo, []);
  assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r));
});

test('pórtico con bandeja: el paso peatonal queda libre (ningún tubo cruza la vereda por debajo del gálibo)', () => {
  const r = build(M.crearDiseno('bandeja_portico_peatonal'));
  const galibo = r.estructuras[0].info.galibo as number;
  assert.ok(galibo >= 2.5 - 1e-6);
  // ninguna pieza (salvo esferas en las verticales) cruza en z entre las dos líneas por debajo del gálibo
  const cruzan = r.piezas.filter((p) => Math.max(p.a[1], p.b[1]) < galibo - 1e-6 && Math.abs(p.a[2] - p.b[2]) > 0.05);
  assert.deepEqual(cruzan.map((p) => p.id), []);
  // esferas de seguridad en las verticales y vigas de celosía bajo el piso
  assert.equal(r.piezas.filter((p) => p.familia === 'esfera').length, 20, 'solo en las patas');
  assert.ok(r.piezas.filter((p) => p.familia === 'viga_celosia').every((p) => p.codigo === 'VIGA-CEL-500'));
});

test('pórtico con bandeja: reglas de vía pública con reparación (paso y gálibo)', () => {
  let d = M.crearDiseno('bandeja_portico_peatonal', { params: { paso: 0.73, galibo: 2.2 } });
  let r = build(d);
  for (const regla of ['via.paso', 'via.galibo']) {
    const a = r.avisos.find((x) => x.regla === regla)!;
    assert.ok(a && a.nivel === 'error', regla);
    d = M.aplicarReparacion(d, a.reparaciones[0].accion, C);
    r = build(d);
  }
  assert.ok(!r.avisos.some((a) => a.regla.startsWith('via.')));
});

test('pórtico con bandeja: cada viga de celosía salta al menos un vano (libera patas) y las puntas quedan arriostradas', () => {
  for (const largo of [12.5, 25, 10]) {
    const r = build(M.crearDiseno('bandeja_portico_peatonal', { params: { largo } }));
    const vanos = r.estructuras[0].esqueleto.vanos;
    const minVano = Math.min(...vanos.map((v) => v.medida));
    for (const v of r.piezas.filter((p) => p.familia === 'viga_celosia')) assert.ok(Math.abs(v.b[0] - v.a[0]) >= 2 * Math.min(2.5, minVano) - 1e-6 || Math.abs(v.b[0] - v.a[0]) >= 5 - 1e-6, `${largo}: viga de ${v.medidas.largo}`);
    assert.deepEqual(problemasDeArmado(r), [], String(largo));
    assert.ok(r.piezas.some((p) => p.familia === 'diagonal'), `${largo}: diagonales en las puntas`);
  }
  const cada25 = build(M.crearDiseno('bandeja_portico_peatonal', { params: { pasoPatas: 2.5 } }));
  assert.equal(cada25.piezas.filter((p) => p.familia === 'viga_celosia').length, 0, 'una pata por vano: horizontales, sin vigas');
});
