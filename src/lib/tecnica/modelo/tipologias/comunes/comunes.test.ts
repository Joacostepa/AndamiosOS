// Helpers comunes para tipologías: producen esqueletos válidos que el mismo `armar` convierte en piezas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../index.ts';
import type { Diseno, Esqueleto } from '../../index.ts';
import { apoyoEscalonado, colgar, cotasNiveles, escaleraInterior, estabilizadores, grillaPoligono, grillaRect, poligonoCirculo, rectangulo, ruedas, visera } from './index.ts';
import { coordenadasFinitas, diagonalesFueraDeNodo } from '../../test-utils.ts';

const C = M.CATALOGO_FIXTURE;
/** Monta un esqueleto en una estructura libre para construirlo. */
function conEsqueleto(esq: Esqueleto): Diseno {
  const d = M.crearDiseno('libre_vacia', { catalogo: C });
  d.estructuras[0].esqueleto = esq;
  return d;
}

test('grillaRect + cotasNiveles: torre de 2,50 × 2,50 × 8 con plataformas, barandas y diagonales', () => {
  const cn = cotasNiveles({ altura: 8, modo: 'cada_nivel' });
  const g = grillaRect({ vanosS: [2.5], profundidades: [2.5], cotas: cn.cotas, plataformas: cn.plataformas, catalogo: C });
  assert.deepEqual(M.validarEsqueleto(g.esqueleto), []);
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.ok(coordenadasFinitas(r));
  assert.deepEqual(diagonalesFueraDeNodo(r), []);
  assert.ok(r.bom.some((l) => l.codigo === 'TAB-MET-250'));
});

test('grillaPoligono afuera: envolvente cerrada de un octógono (cúpula, tanque)', () => {
  const poli = poligonoCirculo([0, 0], 3, 8);
  const cn = cotasNiveles({ altura: 6 });
  const g = grillaPoligono({ poligono: poli, offset: 0.3, profundidad: 0.73, cotas: cn.cotas, cerrada: true, plataformas: cn.plataformas, modo: 'libre', catalogo: C });
  assert.deepEqual(M.validarEsqueleto(g.esqueleto), []);
  assert.equal(g.lados.length, 8);
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.ok(r.piezas.length > 100 && coordenadasFinitas(r));
  assert.deepEqual(diagonalesFueraDeNodo(r), []);
});

test('grillaPoligono adentro: patio entre medianeras (rectángulo 6 × 4)', () => {
  const cn = cotasNiveles({ altura: 9 });
  const g = grillaPoligono({ poligono: rectangulo(0, 0, 6, 4), offset: 0.2, profundidad: 0.73, cotas: cn.cotas, cerrada: true, lado: 'adentro', plataformas: cn.plataformas, modo: 'libre', catalogo: C });
  assert.deepEqual(M.validarEsqueleto(g.esqueleto), []);
  // todas las columnas quedan dentro del patio
  assert.ok(g.esqueleto.columnas.every((c) => c.p[0] > 0 && c.p[0] < 6 && c.p[1] > 0 && c.p[1] < 4));
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.ok(coordenadasFinitas(r));
  assert.deepEqual(diagonalesFueraDeNodo(r), []);
});

test('visera: bandeja de 1,09 con ménsulas, fenólico y visera a 45° con lona', () => {
  const els = visera({ desde: [0, 3, 0.73], hasta: [5, 3, 0.73], dir: [0, 1], ancho: 1.09, tipo: '45', alto: 1, cerramiento: 'lona' });
  const g = grillaRect({ vanosS: [2.5, 2.5], profundidades: [0.73], cotas: [0.5, 2.5, 3], catalogo: C });
  g.esqueleto.elementos.push(...els);
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.equal(r.bom.find((l) => l.codigo === 'MENSULA-109')?.cantidad, 3);
  assert.ok(r.bom.some((l) => l.codigo === 'PLACA-FEN-122x244'));
  assert.ok(r.bom.some((l) => l.codigo === 'LONA-PVC' && (l.medida || 0) > 5));
  const v90 = visera({ desde: [0, 3, 0], hasta: [5, 3, 0], dir: [0, 1], ancho: 2.5, tipo: '90', alto: 1.2, cerramiento: 'chapa', soporte: 'viga' });
  assert.ok(v90.some((e) => e.familia === 'viga_celosia') && v90.some((e) => e.familia === 'chapa'));
});

test('torre móvil: ruedas con freno, estabilizadores y H/B con ruedas', () => {
  const cn = cotasNiveles({ altura: 8, modo: 'cada_nivel' });
  const g = grillaRect({ vanosS: [2.5], profundidades: [1.25], cotas: cn.cotas, plataformas: cn.plataformas, catalogo: C });
  const sinEst = ruedas(g.esqueleto, { freno: true });
  assert.ok(sinEst.avisos.some((a) => a.regla === 'movil.hb'));
  const B = estabilizadores(g.esqueleto, 1.5);
  const conEst = ruedas(g.esqueleto, { freno: true, bEfectiva: B });
  assert.ok(conEst.hb < sinEst.hb);
  escaleraInterior(g.esqueleto, g.panos[0][0]);
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.equal(r.bom.find((l) => l.codigo === 'RUEDA-STD-FRENO')?.cantidad, 4);
  assert.ok(r.piezas.some((p) => p.familia === 'estabilizador'));
  assert.ok(r.bom.some((l) => l.codigo === 'TAB-ESC-250'));
});

test('apoyo escalonado: cada columna arranca en su roseta sobre el peldaño, todo sigue en nodos', () => {
  const g = grillaRect({ vanosS: [2.5, 2.5], profundidades: [1.09], cotas: [0.5, 2.5, 4.5], plataformas: [4.5], catalogo: C });
  const avisos = apoyoEscalonado(g.esqueleto, (p) => Math.floor(p[0] / 1.25) * 0.36);
  assert.deepEqual(avisos.filter((a) => a.nivel === 'error'), []);
  const ys = new Set(g.esqueleto.columnas.map((c) => c.yBase));
  assert.ok(ys.size > 1, 'apoyos a distinto nivel');
  for (const c of g.esqueleto.columnas) {
    assert.ok(c.yBase - (c.ySuelo || 0) >= 0.25 - 1e-9 && c.yBase - (c.ySuelo || 0) <= 0.75 + 1e-9);
    assert.ok(Math.abs(((c.yBase - 0.5) / 0.5) % 1) < 1e-6, 'en la grilla de rosetas');
  }
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.deepEqual(diagonalesFueraDeNodo(r), []);
});

test('colgar: sin bases, con caño y grampas hasta el soporte', () => {
  const g = grillaRect({ vanosS: [2.5], profundidades: [0.73], cotas: [4, 6], plataformas: [4], catalogo: C, yTope: 6 });
  const av = colgar(g.esqueleto, { cota: 7.5, sujecion: 'cano_grampa' });
  assert.ok(av.some((a) => a.regla === 'colgado.soporte'));
  const r = M.construir(conEsqueleto(g.esqueleto), C);
  assert.equal(r.piezas.filter((p) => p.familia === 'base_regulable').length, 0);
  assert.ok(r.bom.some((l) => l.codigo === 'CAÑO-150'));
});
