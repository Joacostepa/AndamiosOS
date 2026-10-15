// El pincel de ménsula y de anclaje sobre plantillas que no son fachada (torres, bandejas…):
// el override de la celda pone la ménsula o el anclaje en los dos nodos del vano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import { porFamilia } from '../test-utils.ts';

const C = M.CATALOGO_FIXTURE;

test('torre móvil: voladizo pintado en una celda exterior sale con tablones y parantes de baranda', () => {
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
  // vuelo por defecto 0,73 (> 0,45): un horizontal y una diagonal 2,00 × 0,73 por columna del vano
  assert.equal(f1.mensula ?? 0, 0);
  assert.equal((f1.diagonal ?? 0) - (f0.diagonal ?? 0), 2, 'una diagonal por columna del vano');
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

// ───────────── vuelo elegible y voladizo con diagonal de 2,00 (armado ABA) ─────────────

/** Torre móvil con la ménsula pintada en la celda exterior de arriba, con el vuelo pedido (o sin dato). */
function torreConMensula(brazo?: number) {
  const d = M.crearDiseno('torre_movil_interior');
  const e = M.construir(d, C).estructuras[0];
  const k = e.esqueleto.cotas.length - 1;
  const v = e.esqueleto.vanos.find((x) => x.cara === 'exterior')!;
  const d1 = structuredClone(d);
  d1.estructuras[0].overrides = { [M.celdaId(v.id, k)]: { mensula: 'afuera', ...(brazo !== undefined ? { brazoMensula: brazo } : {}) } };
  return { r0: M.construir(d, C), r: M.construir(d1, C), cota: e.esqueleto.cotas[k] };
}
const volado = (r: M.Resultado) => r.piezas.filter((p) => /:(men|mh|md):/.test(p.id));

test('vuelo 0,45: dos ménsulas de catálogo, sin horizontal ni diagonal de voladizo', () => {
  const ps = volado(torreConMensula(0.45).r);
  assert.equal(ps.filter((p) => p.familia === 'mensula').length, 2);
  assert.ok(ps.every((p) => p.familia === 'mensula' && p.codigo === 'MENSULA-045'));
});

test('vuelo 1,09: 2 horizontales de 1,09 + 2 diagonales 2,00 × 1,09 y ninguna ménsula', () => {
  const { r, r0, cota } = torreConMensula(1.09);
  const ps = volado(r);
  assert.equal(ps.filter((p) => p.familia === 'mensula').length, 0);
  const h = ps.filter((p) => p.familia === 'horizontal');
  const dg = ps.filter((p) => p.familia === 'diagonal');
  assert.equal(h.length, 2);
  assert.ok(h.every((p) => p.medidas.largo === 1.09 && p.codigo === 'HOR-048-109'));
  assert.equal(dg.length, 2);
  for (const p of dg) {
    assert.deepEqual({ alto: p.medidas.alto, largo: p.medidas.largo }, { alto: 2, largo: 1.09 });
    assert.equal(p.codigo, 'DIAG-200x109');
    // nodo a nodo: pie en el parante a cota − 2,00, cabeza en la punta del vuelo a la cota del nivel
    const [pie, cab] = p.a[1] < p.b[1] ? [p.a, p.b] : [p.b, p.a];
    assert.equal(Math.round((cab[1] - pie[1]) * 1000) / 1000, 2, 'cateto vertical 2,00');
    assert.equal(cab[1], cota);
    assert.equal(Math.round(Math.hypot(cab[0] - pie[0], cab[2] - pie[2]) * 1000) / 1000, 1.09, 'cateto horizontal = vuelo');
    const hz = h.find((x) => Math.abs(x.a[0] - pie[0]) < 1e-6 && Math.abs(x.a[2] - pie[2]) < 1e-6)!;
    assert.ok(hz, 'el horizontal sale del mismo parante');
    assert.deepEqual(hz.b, cab, 'la diagonal llega a la punta del horizontal');
  }
  assert.equal(porFamilia(r).mensula ?? 0, porFamilia(r0).mensula ?? 0);
  assert.ok(!r.avisos.some((a) => a.regla.startsWith('mensula.')), 'sin avisos: el cateto es 2,00');
});

test('vuelo 2,50: horizontal y diagonal 2,00 × 2,50 de catálogo', () => {
  const ps = volado(torreConMensula(2.5).r);
  assert.deepEqual(ps.map((p) => p.codigo).sort(), ['DIAG-200x250', 'DIAG-200x250', 'HOR-048-250', 'HOR-048-250']);
});

test('diseños viejos sin brazoMensula: el vuelo sigue siendo 0,73', () => {
  const ps = volado(torreConMensula().r);
  assert.deepEqual(ps.map((p) => p.codigo).sort(), ['DIAG-200x073', 'DIAG-200x073', 'HOR-048-073', 'HOR-048-073']);
});

test('estructura libre: respeta el brazo del nodo y avisa si la diagonal no baja 2,00', () => {
  let d = M.convertirALibre(M.crearDiseno('torre_movil_interior'), 'E1', C);
  const e = M.construir(d, C).estructuras[0];
  const v = e.esqueleto.vanos.find((x) => x.cara === 'exterior')!;
  const k = e.esqueleto.cotas.length - 1;
  for (const c of [v.a, v.b]) d = M.editarEsqueleto(d, 'E1', { op: 'nodo', clave: `${c}@${k}`, valor: { mensula: { dir: 'afuera', brazo: 1.5 } } }, C);
  const r = M.construir(d, C);
  assert.deepEqual(volado(r).map((p) => p.codigo).sort(), ['DIAG-200x150', 'DIAG-200x150', 'HOR-048-150', 'HOR-048-150']);
  // en el primer nivel (cota 0,50, arranque de la columna) no hay 2,00 por debajo: queda sin pie
  let d2 = M.convertirALibre(M.crearDiseno('torre_movil_interior'), 'E1', C);
  for (const c of [v.a, v.b]) d2 = M.editarEsqueleto(d2, 'E1', { op: 'nodo', clave: `${c}@0`, valor: { mensula: { dir: 'afuera', brazo: 1.09 } } }, C);
  const r2 = M.construir(d2, C);
  assert.ok(r2.avisos.some((a) => a.regla === 'mensula.sin_diagonal'));
  // a cota 2,00 la columna arranca a 0,50: la diagonal baja 1,50 y avisa
  let d3 = M.convertirALibre(M.crearDiseno('torre_movil_interior'), 'E1', C);
  for (const c of [v.a, v.b]) d3 = M.editarEsqueleto(d3, 'E1', { op: 'nodo', clave: `${c}@1`, valor: { mensula: { dir: 'afuera', brazo: 1.09 } } }, C);
  const r3 = M.construir(d3, C);
  assert.ok(volado(r3).filter((p) => p.familia === 'diagonal').every((p) => p.medidas.alto === 1.5));
  assert.ok(r3.avisos.some((a) => a.regla === 'mensula.diagonal_corta'));
});

test('fachada: el vuelo del override gana sobre el de la plantilla', () => {
  const d = M.ejemploParana631();
  const d1 = M.setOverride(d, 'E1', 'f0e3@N4', { mensula: 'afuera', brazoMensula: 1.25 });
  const r = M.construir(d1, C);
  const ps = volado(r);
  assert.deepEqual(ps.map((p) => p.codigo).sort(), ['DIAG-200x125', 'DIAG-200x125', 'HOR-048-125', 'HOR-048-125']);
  const d2 = M.setOverride(d, 'E1', 'f0e3@N4', { mensula: 'afuera', brazoMensula: 0.45 });
  assert.deepEqual(volado(M.construir(d2, C)).map((p) => p.codigo), ['MENSULA-045', 'MENSULA-045']);
});
