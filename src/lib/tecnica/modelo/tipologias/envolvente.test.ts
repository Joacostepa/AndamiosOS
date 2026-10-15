// Envolvente (pedido 5, foto 5): anillo cerrado alrededor de un volumen, con torre central opcional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarEnvolvente } from './envolvente.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('envolvente: normalizar total (planta rara → círculo)', () => {
  const r = normalizarEnvolvente({ planta: { tipo: 'poligono', puntos: [[0, 0]] }, altura: -1 } as never);
  assert.equal(r.params.planta.tipo, 'circulo');
  assert.equal(r.params.altura, 2.5);
});

test('envolvente: golden por preset, anillo cerrado, sin verticales dobles y misma BOM en libre', () => {
  const esperado: Record<string, Record<string, number>> = {
    envolvente_cupula: { vertical: 288, horizontal: 540, diagonal: 40, tablon: 208, viga_celosia: 2, base_regulable: 56, anclaje: 48, cano: 304 },
    envolvente_tanque: { vertical: 240, horizontal: 372, diagonal: 36, tablon: 144, base_regulable: 60, anclaje: 36, cano: 360 },
    envolvente_columna: { vertical: 72, horizontal: 96, diagonal: 8, tablon: 48, base_regulable: 24, anclaje: 12, cano: 120 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    assert.deepEqual(r.resumen.sinCodigo, [], id);
    // anillo cerrado: cada columna de contacto tiene dos vanos interiores
    const esq = r.estructuras[0].esqueleto;
    const grado = new Map<string, number>();
    for (const v of esq.vanos.filter((x) => x.cara === 'interior' && x.id.startsWith('g'))) for (const c of [v.a, v.b]) grado.set(c, (grado.get(c) || 0) + 1);
    assert.ok([...grado.values()].every((n) => n === 2), `${id}: anillo cerrado`);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
});

test('envolvente de cúpula: torre central sobre vigas, más alta que el anillo', () => {
  const r = build(M.crearDiseno('envolvente_cupula'));
  const e = r.estructuras[0];
  const tc = e.esqueleto.columnas.filter((c) => c.id.startsWith('tc'));
  assert.equal(tc.length, 4);
  assert.ok(tc.every((c) => c.apoyo === 'sobre'));
  assert.ok(e.alturaReal > 11 + 1e-6);
  assert.equal(r.piezas.filter((p) => p.familia === 'viga_celosia').length, 2);
  // la torre arranca en una cota de anillo de la envolvente
  const ys = new Set(e.esqueleto.cotas);
  assert.ok(tc.every((c) => ys.has(c.yBase)));
});

test('envolvente de un volumen del contexto y aviso de cierre en solo catálogo (con reparación)', () => {
  let d = M.crearDiseno('envolvente_tanque', { params: { planta: { tipo: 'volumen', volumenId: 'T1' }, cierreExacto: false } });
  d.contexto.volumenes.push({ id: 'T1', tipo: 'cilindro', planta: [[4, 0], [2, 3.46], [-2, 3.46], [-4, 0], [-2, -3.46], [2, -3.46]], yBase: 0, yTope: 6 });
  let r = build(d);
  assert.ok(r.piezas.length > 100);
  const av = r.avisos.find((a) => a.regla === 'envolvente.cierre')!;
  assert.ok(av);
  d = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  r = build(d);
  assert.ok(!r.avisos.some((a) => a.regla === 'envolvente.cierre'));
  assert.deepEqual(problemasDeArmado(r), []);
});
