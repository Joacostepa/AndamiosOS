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
    // anillo rectangular de catálogo (foto 5): sin cuadros de esquina ni relleno de caño y grampa
    envolvente_cupula: { vertical: 136, horizontal: 428, diagonal: 40, tablon: 192, viga_celosia: 2, mensula: 64, base_regulable: 32, anclaje: 12, cano: 12 },
    // voladizos de 0,73 hacia el tanque (armado ABA): horizontal + diagonal 2,00 × 0,73 en vez de ménsula;
    // en las 12 columnas de esquina el vuelo cae sobre un vano propio del anillo y lo sostiene su horizontal
    envolvente_tanque: { vertical: 96, horizontal: 396, diagonal: 36, tablon: 120, base_regulable: 32, anclaje: 8, cano: 6 },
    envolvente_columna: { vertical: 32, horizontal: 120, diagonal: 16, tablon: 32, base_regulable: 16, anclaje: 4 },
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
  let d = M.crearDiseno('envolvente_tanque', { params: { planta: { tipo: 'volumen', volumenId: 'T1' }, cierreExacto: false, trazado: 'poligonal' } });
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

test('envolvente de columna: un anillo con una vertical por nodo y sin caño y grampa', () => {
  const r = build(M.crearDiseno('envolvente_columna'));
  const f = porFamilia(r);
  assert.ok((f.base_regulable || 0) <= 16, `bases ${f.base_regulable}`);
  assert.equal(f.cano || 0, 0);
  assert.equal(f.grampa_fija || 0, 0);
  // ningún par de verticales a menos de 0,70 (antes quedaban a 0,27)
  const cols = r.estructuras[0].esqueleto.columnas;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) assert.ok(Math.hypot(cols[i].p[0] - cols[j].p[0], cols[i].p[1] - cols[j].p[1]) > 0.7);
});

test('envolvente poligonal sigue disponible (un tramo por lado)', () => {
  const r = build(M.crearDiseno('envolvente_tanque', { params: { trazado: 'poligonal' } }));
  assert.deepEqual(problemasDeArmado(r), []);
  assert.ok(r.estructuras[0].esqueleto.columnas.length > 32);
});
