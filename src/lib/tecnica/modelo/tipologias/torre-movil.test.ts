// Torre móvil (pedido 8b, fotos 14 y 15): ruedas con freno, H/B, estabilizadores y escalera con trampilla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { alturaMaximaMovil, normalizarTorreMovil } from './torre-movil.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('torre móvil: normalizar total y altura máxima por H/B ⚠', () => {
  const r = normalizarTorreMovil({ ancho: 99, uso: 'luna' } as never);
  assert.equal(r.params.ancho, 2.5);
  assert.equal(r.params.uso, 'interior');
  assert.equal(alturaMaximaMovil(1.5, 'interior'), 4); // 3,5 × 1,50 = 5,25 → plataforma a 4,00 (+1,00 de baranda)
  assert.equal(alturaMaximaMovil(1.5, 'exterior'), 3.5);
});

test('torre móvil: golden por preset, 4 ruedas con freno, trampilla y misma BOM en libre', () => {
  const esperado: Record<string, Record<string, number>> = {
    torre_movil_interior: { vertical: 12, horizontal: 28, diagonal: 6, tablon: 9, rueda_freno: 4, escalera_interior: 2, tablon_escotilla: 1, cano: 2 },
    torre_movil_exterior: { vertical: 8, horizontal: 20, diagonal: 4, tablon: 5, rueda_freno: 4, escalera_interior: 1, cano: 4 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    assert.ok(!r.avisos.some((a) => a.regla === 'movil.hb'), `${id}: dentro de H/B`);
    assert.ok(r.piezas.some((p) => p.familia === 'diagonal_planta' || (p.familia === 'cano' && p.elemento?.includes(':dpl'))), `${id}: diagonal en planta en la base`);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
});

test('torre móvil: pasarse de H/B es error con «Agregar estabilizadores» y «Bajar a X m»', () => {
  const d = M.crearDiseno('torre_movil_interior', { params: { alturaPlataforma: 8 } });
  const av = build(d).avisos.find((a) => a.regla === 'movil.hb')!;
  assert.ok(av && av.nivel === 'error');
  assert.deepEqual(av.reparaciones.map((x) => x.etiqueta), ['Agregar estabilizadores', 'Bajar a 4,00 m']);
  const conEst = M.aplicarReparacion(d, av.reparaciones[0].accion, C);
  const r = build(conEst);
  assert.ok(!r.avisos.some((a) => a.regla === 'movil.hb'));
  assert.equal(r.piezas.filter((p) => p.familia === 'estabilizador').length, 4);
  const bajada = build(M.aplicarReparacion(d, av.reparaciones[1].accion, C));
  assert.ok(!bajada.avisos.some((a) => a.regla === 'movil.hb'));
  assert.deepEqual(problemasDeArmado(bajada), []);
});
