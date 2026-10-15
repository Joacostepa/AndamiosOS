// Estructura colgante (pedido 4, foto 4): sin apoyo en el suelo, colgada de una losa o un puente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { bomPlano, porFamilia } from '../test-utils.ts';
import { FAMILIAS_GOLDEN, golden, problemasDeArmado } from './nuevas-test-utils.ts';
import { normalizarColgante } from './colgante.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: M.Diseno) => M.construir(d, C);

test('colgante: normalizar no deja que llegue al suelo', () => {
  const r = normalizarColgante({ cotaSoporte: 3, alturaColgada: 9 });
  assert.ok(r.params.alturaColgada <= 2.5);
  assert.ok(r.avisos.length);
  assert.doesNotThrow(() => normalizarColgante({ largo: Number.NaN, sujecion: 'pegamento' } as never));
});

test('colgante: golden por preset, sin bases, colgadores hasta el soporte y misma BOM en libre', () => {
  const esperado: Record<string, Record<string, number>> = {
    colgante_puente: { vertical: 18, horizontal: 82, diagonal: 8, tablon: 55, cano: 24 },
    colgante_losa: { vertical: 12, horizontal: 45, diagonal: 12, tablon: 20, cano: 6 },
  };
  for (const [id, g] of Object.entries(esperado)) {
    const d = M.crearDiseno(id);
    const r = build(d);
    assert.deepEqual(golden(porFamilia(r), FAMILIAS_GOLDEN), g, id);
    assert.deepEqual(problemasDeArmado(r), [], id);
    assert.equal(r.piezas.filter((p) => /base|rueda|collarin/.test(p.familia)).length, 0, id);
    const cota = r.estructuras[0].info.cotaSoporte as number;
    const colg = r.piezas.filter((p) => p.elemento?.startsWith('colg:') && p.familia === 'cano');
    assert.equal(colg.length, r.estructuras[0].esqueleto.columnas.length, id);
    assert.ok(colg.every((p) => Math.abs(Math.max(p.a[1], p.b[1]) - cota) < 1e-6), id);
    assert.deepEqual(bomPlano(build(M.convertirALibre(d, 'E1', C))), bomPlano(r), id);
  }
});

test('colgante: toma la cota del volumen del contexto; si no lo encuentra avisa y se desvincula', () => {
  let d = M.crearDiseno('colgante_puente');
  d.contexto.volumenes.push({ id: 'P1', tipo: 'puente', nombre: 'Tablero', planta: [[0, 0], [20, 0], [20, 4], [0, 4]], yBase: 7.2, yTope: 8 });
  d = M.setParam(d, 'E1', 'params.volumenId', 'P1');
  const r = build(d);
  assert.equal(r.estructuras[0].info.cotaSoporte, 7.2);
  assert.deepEqual(problemasDeArmado(r), []);
  let d2 = M.setParam(d, 'E1', 'params.volumenId', 'NO');
  const av = build(d2).avisos.find((a) => a.regla === 'colgado.sin_volumen')!;
  assert.ok(av);
  d2 = M.aplicarReparacion(d2, av.reparaciones[0].accion, C);
  assert.ok(!build(d2).avisos.some((a) => a.regla === 'colgado.sin_volumen'));
});

test('colgante: piezas que la sostienen (doble grampa, placa o grampa de viga, pasadores) y planta arriostrada', () => {
  const losa = build(M.crearDiseno('colgante_losa'));
  const n = losa.estructuras[0].esqueleto.columnas.length;
  const cod = (r: M.Resultado, c: string) => r.bom.filter((l) => l.codigo === c).reduce((s, l) => s + l.cantidad, 0);
  assert.equal(cod(losa, 'PLACA-ANC-COLG'), n, 'una placa por colgador en la losa');
  assert.ok(cod(losa, 'PASADOR-UNION') > 0, 'pasadores en los empalmes');
  assert.equal(losa.piezas.filter((p) => p.familia === 'grampa_fija' && p.elemento?.startsWith('colg:')).length, 3 * n, 'doble grampa + la de abajo');
  const puente = build(M.crearDiseno('colgante_puente'));
  assert.equal(cod(puente, 'GRAMPA-VIGA'), puente.estructuras[0].esqueleto.columnas.length);
  const dpl = puente.piezas.filter((p) => p.familia === 'diagonal_planta' || (p.familia === 'cano' && p.id.includes(':dpl')));
  assert.ok(dpl.length >= 4, `planta arriostrada en varios vanos (${dpl.length})`);
});
