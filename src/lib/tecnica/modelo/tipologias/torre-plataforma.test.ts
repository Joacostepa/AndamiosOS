// Torre de plataforma y torre en azotea (pedido 6, fotos 7 y 9). También embebida en una fachada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarTorrePlataforma } from './torre-plataforma.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('torre de plataforma: normalizar total', () => {
  const r = normalizarTorrePlataforma({ largo: 0, altura: 1e6, acceso: 'helicoptero' } as never);
  assert.equal(r.params.largo, 0.73);
  assert.equal(r.params.altura, 60);
  assert.equal(r.params.acceso, 'escalera_interior');
});

test('torre de plataforma y azotea: golden, bien armadas y misma BOM en libre', () => {
  const esperado: Record<string, Record<string, number>> = {
    torre_plataforma: { vertical: 24, horizontal: 91, diagonal: 16, tablon: 95, base_regulable: 12, escalera_interior: 2, tablon_escotilla: 1 },
    torre_azotea: { vertical: 12, horizontal: 20, diagonal: 6, tablon: 3, base_regulable: 4, anclaje: 2, escalera_interior: 1, cano: 3 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
});

test('torre en azotea: arranca sobre la losa (o sobre el volumen elegido) y avisa la carga', () => {
  const r = build(M.crearDiseno('torre_azotea'));
  const bases = r.piezas.filter((p) => p.familia === 'base_regulable');
  assert.ok(bases.every((p) => Math.abs(Math.min(p.a[1], p.b[1]) - 12) < 1e-6));
  assert.ok(r.avisos.some((a) => a.regla === 'azotea.losa'));
  let d = M.crearDiseno('torre_azotea');
  d.contexto.volumenes.push({ id: 'E', tipo: 'edificio', planta: [[-5, -5], [10, -5], [10, 10], [-5, 10]], yBase: 0, yTope: 21.4 });
  d = M.setParam(d, 'E1', 'params.volumenId', 'E');
  const r2 = build(d);
  assert.ok(r2.piezas.filter((p) => p.familia === 'base_regulable').every((p) => Math.abs(Math.min(p.a[1], p.b[1]) - 21.4) < 1e-6));
  assert.deepEqual(problemasDeArmado(r2), []);
});

test('torre de plataforma: esbeltez con reparación «Anclar» o «Ensanchar»', () => {
  let d = M.crearDiseno('torre_plataforma', { params: { largo: 2.5, ancho: 1.09, altura: 10 } });
  const av = build(d).avisos.find((a) => a.regla === 'esbeltez.hb')!;
  assert.ok(av && av.reparaciones.length === 2);
  d = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  const r = build(d);
  assert.ok(!r.avisos.some((a) => a.regla === 'esbeltez.hb'));
  assert.ok(r.piezas.some((p) => p.familia === 'anclaje'));
});

test('torre de plataforma embebida en una fachada: comparte verticales y A pierde plataformas en su huella', () => {
  let d = M.crearDiseno('estructura', { frentes: [{ largo: 15 }], altura: 10, profundidad: 1.09 });
  d = M.agregarEstructura(d, 'torre_plataforma', { params: { largo: 2.5, ancho: 2.5, altura: 10 }, unirA: { estructuraId: 'E1', puerto: 'f0:ext', s: 5, modo: 'embebida' } }, C).diseno;
  const r = build(d);
  assert.ok(r.reglas.some((x) => x.regla === 'union.embebida'));
  assert.ok(r.reglas.some((x) => x.regla === 'fusion'));
  assert.deepEqual(problemasDeArmado(r).filter((x) => x.startsWith('vertical doble')), []);
});
