// Del modelo al cómputo: BOM → ítems, diferencias contra lo que ya hay, plan de la RPC y origen al
// editar a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../modelo/index.ts';
import {
  computoBloqueado, decisionesValidas, diferenciasComputo, lineasParaComputo, metricasDe, origenAlGuardar, planGeneracion,
  resolverLinea, resumenDe, totalesDiff,
} from './computo.ts';
import type { ItemComputoActual, LineaComputo } from './tipos.ts';

const linea = (over: Partial<M.LineaBom>): M.LineaBom => ({
  clave: 'X', codigo: 'X', piezaId: 'p-x', descripcion: 'X', familia: 'horizontal', grupo: 'H', cantidad: 1, unidad: 'u',
  peso_unit: null, peso_total: null, stockLibre: null, falta: null, esKit: false, esAjuste: false, sinCodigo: false, ajusteManual: 0, ...over,
});

test('lineasParaComputo: agrupa por pieza (el caño de ajuste y el común son la misma), redondea hacia arriba y separa lo sin código', () => {
  const { lineas, omitidas } = lineasParaComputo([
    linea({ clave: 'CAÑO-300', codigo: 'CAÑO-300', piezaId: 'p-c300', cantidad: 4, familia: 'cano' }),
    linea({ clave: 'CAÑO-300|ajuste', codigo: 'CAÑO-300', piezaId: 'p-c300', cantidad: 2, familia: 'cano', esAjuste: true }),
    linea({ clave: 'PLACA', codigo: 'PLACA-FEN-122x244', piezaId: 'p-fen', cantidad: 2.4, familia: 'fenolico' }),
    linea({ clave: 'SIN:mensula:0,73', codigo: null, piezaId: null, sinCodigo: true, cantidad: 6, familia: 'mensula' }),
    linea({ clave: 'RARO', codigo: 'RARO', piezaId: null, cantidad: 1 }),
    linea({ clave: 'CERO', codigo: 'CERO', piezaId: 'p-0', cantidad: 0 }),
  ]);
  assert.deepEqual(lineas.map((l) => [l.pieza_id, l.cantidad]), [['p-c300', 6], ['p-fen', 3]]);
  assert.deepEqual(omitidas.map((o) => [o.clave, o.motivo]), [['SIN:mensula:0,73', 'sin_codigo'], ['RARO', 'sin_pieza']]);
});

test('lineasParaComputo con el ejemplo Paraná 631: todo lo que tiene código entra, nada se pierde', () => {
  const r = M.construir(M.ejemploParana631(), M.CATALOGO_FIXTURE);
  const { lineas, omitidas } = lineasParaComputo(r.bom);
  assert.ok(lineas.length > 10);
  const conCodigo = r.bom.filter((l) => l.codigo && l.piezaId && l.cantidad > 0);
  const total = (xs: { cantidad: number }[]) => xs.reduce((s, x) => s + x.cantidad, 0);
  assert.ok(total(lineas) >= total(conCodigo) - 1e-9);
  assert.equal(omitidas.length, r.bom.filter((l) => l.cantidad > 0 && (!l.codigo || !l.piezaId)).length);
  assert.ok(lineas.every((l) => Number.isInteger(l.cantidad) && l.cantidad > 0));
});

const act = (pieza_id: string, cantidad_requerida: number, origen: ItemComputoActual['origen'], modelo_cantidad: number | null = null): ItemComputoActual =>
  ({ pieza_id, cantidad_requerida, origen, modelo_cantidad, codigo: pieza_id.toUpperCase(), descripcion: null });
const lin = (pieza_id: string, cantidad: number): LineaComputo => ({ pieza_id, codigo: pieza_id.toUpperCase(), descripcion: pieza_id, cantidad });

const ACTUALES: ItemComputoActual[] = [
  act('a', 10, 'modelo', 10),           // igual
  act('b', 5, 'modelo', 5),             // cambia a 8
  act('c', 3, 'modelo', 3),             // el modelo ya no lo tiene → quita
  act('d', 12, 'modelo_editado', 10),   // modelo dice 14 → conflicto
  act('e', 7, 'manual'),                // modelo dice 4 → conflicto
  act('f', 2, 'modelo_editado', 2),     // el modelo ya no lo tiene → quita_editado
  act('g', 9, 'manual'),                // el modelo no lo tiene → manual, no se toca
  act('h', 6, 'manual'),                // modelo dice 6 → igual
];
const LINEAS = [lin('a', 10), lin('b', 8), lin('d', 14), lin('e', 4), lin('h', 6), lin('n', 20)];

test('diferenciasComputo: cada caso con su tipo, sus opciones y el default', () => {
  const diff = diferenciasComputo(ACTUALES, LINEAS);
  const tipo = Object.fromEntries(diff.map((d) => [d.pieza_id, d.tipo]));
  assert.deepEqual(tipo, { a: 'igual', b: 'cambia', c: 'quita', d: 'conflicto_manual', e: 'conflicto_manual', f: 'quita_editado', g: 'manual', h: 'igual', n: 'nuevo' });
  const d = diff.find((x) => x.pieza_id === 'd')!;
  assert.deepEqual(d.opciones, ['mantener', 'modelo', 'sumar']);
  assert.equal(d.decisionPorDefecto, 'mantener');
  assert.equal(d.resultado, 12, 'por defecto se mantiene lo de la persona');
  assert.equal(diff[0].tipo, 'conflicto_manual', 'lo que hay que decidir va primero');
  assert.deepEqual(totalesDiff(diff), { nuevas: 1, cambian: 1, quitan: 1, conflictos: 3, iguales: 2 });
});

test('planGeneracion sin decisiones: no pisa nada editado a mano', () => {
  const p = planGeneracion(ACTUALES, LINEAS);
  const q = Object.fromEntries(p.filas.map((f) => [f.pieza_id, [f.cantidad_requerida, f.origen, f.modelo_cantidad]]));
  assert.deepEqual(q, {
    a: [10, 'modelo', 10], b: [8, 'modelo', 8], d: [12, 'modelo_editado', 14], e: [7, 'manual', 4],
    f: [2, 'modelo_editado', 0], g: [9, 'manual', null], h: [6, 'manual', 6], n: [20, 'modelo', 20],
  });
  assert.equal(q.c, undefined, 'la del modelo que ya no está se borra');
  assert.deepEqual({ ins: p.insertadas, act: p.actualizadas, bor: p.borradas, cons: p.conservadas, igu: p.iguales }, { ins: 1, act: 1, bor: 1, cons: 3, igu: 2 });
});

test('planGeneracion con decisiones: pisar, sumar lo agregado a mano y borrar', () => {
  const p = planGeneracion(ACTUALES, LINEAS, { d: 'sumar', e: 'modelo', f: 'borrar' });
  const q = Object.fromEntries(p.filas.map((f) => [f.pieza_id, [f.cantidad_requerida, f.origen]]));
  assert.deepEqual(q.d, [16, 'modelo_editado'], '14 del modelo + 2 que la persona había agregado');
  assert.deepEqual(q.e, [4, 'modelo']);
  assert.equal(q.f, undefined);
  assert.equal(p.borradas, 2);
});

test('sumar sobre una fila manual suma todo lo manual al modelo', () => {
  const r = resolverLinea(act('e', 7, 'manual'), 4, 'sumar');
  assert.deepEqual([r.cantidad, r.origen], [11, 'modelo_editado']);
});

test('decisionesValidas descarta piezas sin conflicto y opciones que no aplican', () => {
  const diff = diferenciasComputo(ACTUALES, LINEAS);
  assert.deepEqual(decisionesValidas(diff, { a: 'modelo', d: 'sumar', f: 'sumar', e: 'borrar', zz: 'modelo' }), { d: 'sumar' });
});

test('origenAlGuardar: editar a mano una fila del modelo la marca, volver a lo del modelo la desmarca', () => {
  assert.deepEqual(origenAlGuardar(undefined, 3), { origen: 'manual', modelo_cantidad: null });
  assert.deepEqual(origenAlGuardar({ origen: 'modelo', modelo_cantidad: 10 }, 12), { origen: 'modelo_editado', modelo_cantidad: 10 });
  assert.deepEqual(origenAlGuardar({ origen: 'modelo', modelo_cantidad: 10 }, 10), { origen: 'modelo', modelo_cantidad: 10 });
  assert.deepEqual(origenAlGuardar({ origen: 'modelo_editado', modelo_cantidad: 10 }, 10), { origen: 'modelo', modelo_cantidad: 10 });
  assert.deepEqual(origenAlGuardar({ origen: 'manual', modelo_cantidad: 4 }, 4), { origen: 'manual', modelo_cantidad: 4 });
});

test('computoBloqueado: mismo set que src/lib/computos/estado.ts', () => {
  for (const e of ['verificado', 'aprobado', 'en_preparacion', 'preparado']) assert.equal(computoBloqueado(e), true, e);
  for (const e of ['borrador', 'requiere_ajuste', null]) assert.equal(computoBloqueado(e), false, String(e));
});

test('metricasDe y resumenDe', () => {
  const d = M.ejemploParana631();
  const r = M.construir(d, M.CATALOGO_FIXTURE);
  const m = metricasDe(r, d);
  assert.equal(m.sistema, 'multidireccional');
  assert.ok(m.m2 > 0 && m.ml > 0 && m.alturaMax > 0);
  const s = resumenDe(r, d);
  assert.equal(s.estructuras, d.estructuras.length);
  assert.equal(s.motorVersion, M.VERSION_MOTOR);
  const b = M.crearDiseno('fachada_bastidor');
  assert.equal(metricasDe(M.construir(b, M.CATALOGO_FIXTURE), b).sistema, 'tubular');
});
