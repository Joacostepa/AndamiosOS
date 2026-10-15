// Diagonales como en obra (pedido 1, fotos 7, 8 y 9): roseta a roseta, una por celda, zigzag continuo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../index.ts';
import type { Diseno, Pieza, Resultado } from '../index.ts';
import { diagonalesDeGrilla, diagonalesFueraDeNodo } from '../test-utils.ts';

const C = M.CATALOGO_FIXTURE;
const build = (d: Diseno) => M.construir(d, C);
const MM = (v: number) => Math.round(v * 1000);
const k3 = (q: number[]) => `${MM(q[0])}|${MM(q[1])}|${MM(q[2])}`;

function casos(): [string, Diseno][] {
  const out: [string, Diseno][] = [];
  for (const t of M.TIPOLOGIAS) for (const p of t.presets) out.push([p.id, M.crearDiseno(p.id)]);
  out.push(['paraná', M.ejemploParana631()]);
  out.push(['fachada libre 7,30', M.crearDiseno('estructura', { frentes: [{ largo: 7.3 }], medida: 'libre' })]);
  out.push(['abertura', M.aplicarReparacion(M.ejemploParana631(), { tipo: 'overrides', estructuraId: 'E1', celdas: ['f0e1@N2', 'f0e2@N2'], valor: { abertura: true } })]);
  return out;
}

/** Vano (medida) de la celda de la diagonal. */
function vanoDe(r: Resultado, p: Pieza): number {
  const e = r.estructuras.find((x) => x.id === p.estructuraId)!;
  const vid = p.celda!.split('@')[0];
  return e.esqueleto.vanos.find((v) => v.id === vid)!.medida;
}

test('cada diagonal une dos nodos (roseta con anillo), en todos los presets', () => {
  for (const [nom, d] of casos()) {
    const r = build(d);
    assert.deepEqual(diagonalesFueraDeNodo(r), [], nom);
  }
});

test('ninguna diagonal cruza más de un vano ni hay dos en la misma celda (sin cruces en X)', () => {
  for (const [nom, d] of casos()) {
    const r = build(d);
    const vistas = new Map<string, number>();
    for (const p of diagonalesDeGrilla(r)) {
      const planta = Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]);
      assert.ok(planta <= vanoDe(r, p) + 0.002, `${nom}: ${p.id} proyecta ${planta} > vano`);
      const k = `${p.estructuraId}|${p.celda}`;
      vistas.set(k, (vistas.get(k) || 0) + 1);
    }
    assert.ok([...vistas.values()].every((n) => n === 1), `${nom}: dos diagonales en una celda`);
  }
});

test('zigzag continuo: el extremo de arriba de una banda es el de abajo de la siguiente', () => {
  for (const [nom, d] of casos()) {
    const r = build(d);
    const porVano = new Map<string, Pieza[]>();
    for (const p of diagonalesDeGrilla(r)) {
      const k = `${p.estructuraId}|${p.celda!.split('@')[0]}`;
      porVano.set(k, [...(porVano.get(k) || []), p]);
    }
    let pares = 0;
    for (const lista of porVano.values()) {
      const ord = lista.map((p) => ({ p, lo: Math.min(p.a[1], p.b[1]), hi: Math.max(p.a[1], p.b[1]) })).sort((x, y) => x.lo - y.lo);
      for (let i = 1; i < ord.length; i++) {
        if (Math.abs(ord[i].lo - ord[i - 1].hi) > 0.001) continue; // banda salteada (p. ej. la de 0,50)
        const arriba = ord[i - 1].p.a[1] > ord[i - 1].p.b[1] ? ord[i - 1].p.a : ord[i - 1].p.b;
        const abajo = ord[i].p.a[1] < ord[i].p.b[1] ? ord[i].p.a : ord[i].p.b;
        assert.equal(k3(arriba), k3(abajo), `${nom}: zigzag cortado en ${ord[i].p.id}`);
        pares++;
      }
    }
    if (/paraná|estructura$/.test(nom)) assert.ok(pares > 0, `${nom}: hay bandas contiguas`);
  }
});

test('vanos arriostrados contiguos alternan la fase (V y Λ, no paralelas)', () => {
  // fachada de 3 vanos: los 3 arriostrados (extremos + cada 5); el del medio tiene la fase opuesta
  const r = build(M.crearDiseno('estructura', { frentes: [{ largo: 7.5 }], altura: 8 }));
  const d = diagonalesDeGrilla(r).filter((p) => /:d:f0e\d@/.test(p.id));
  const sentido = (p: Pieza) => {
    const sube = p.a[1] < p.b[1] ? p.b[0] - p.a[0] : p.a[0] - p.b[0];
    return sube > 0 ? 'derecha' : 'izquierda';
  };
  const k = d[0].celda!.split('@')[1];
  const banda = d.filter((p) => p.celda!.endsWith(`@${k}`)).sort((a, b) => Math.min(a.a[0], a.b[0]) - Math.min(b.a[0], b.b[0]));
  assert.ok(banda.length >= 2);
  for (let i = 1; i < banda.length; i++) assert.notEqual(sentido(banda[i]), sentido(banda[i - 1]));
});

test('golden: fachada 14 × 12 con vanos de 2,50 → vanos arriostrados × bandas + transversales extremos', () => {
  const r = build(M.crearDiseno('estructura', { frentes: [{ largo: 14 }], altura: 12 }));
  const esq = r.estructuras[0].esqueleto;
  // 6 vanos (5 × 2,50 + 1,50): arriostrados el 1 y el 6; 5 bandas de 2,00 (la de 0,50 bajo el primer nivel no lleva)
  const bandas = esq.cotas.slice(1).filter((c, i) => c - esq.cotas[i] >= 1).length;
  assert.equal(bandas, 5);
  const ext = diagonalesDeGrilla(r).filter((p) => /:d:f0e\d+@/.test(p.id)).length;
  const tr = diagonalesDeGrilla(r).filter((p) => /:d:f0t\d+@/.test(p.id)).length;
  assert.equal(ext, 2 * 5);
  assert.equal(tr, 2 * 5);
  assert.equal(r.piezas.filter((p) => p.familia === 'diagonal').length, 20);
});

test('la captura 1 ya no se repite: torre y pórtico peatonal con diagonales nodo a nodo', () => {
  for (const id of ['torre_escalera', 'portico_peatonal', 'portico_vehicular']) {
    const d = M.crearDiseno(id);
    if (id === 'portico_peatonal') d.estructuras[0] = M.cambiarSistema(d.estructuras[0], 'multi').estructura;
    const r = build(d);
    assert.ok(diagonalesDeGrilla(r).length > 0, id);
    assert.deepEqual(diagonalesFueraDeNodo(r), [], id);
  }
});

test('banda sin diagonal de catálogo: aviso con reparación «Pasar a caño y grampa»', () => {
  // estructura libre con un anillo intermedio a 1,00 del arranque: bandas de 1,00 y 0,50 no tienen diagonal de catálogo
  let d = M.crearDiseno('libre_vacia');
  const esq = d.estructuras[0].esqueleto!;
  const v = esq.vanos.find((x) => x.cara === 'exterior')!;
  d = M.editarEsqueleto(d, 'E1', { op: 'agregarNivel', cota: esq.cotas[0] + 1.0 });
  d = M.editarEsqueleto(d, 'E1', { op: 'celda', clave: `${v.id}@1`, valor: { diagonal: 'sube' } });
  const r = build(d);
  const av = r.avisos.find((a) => a.regla === 'diag.sin_codigo')!;
  assert.ok(av, 'avisa la diagonal sin código');
  assert.equal(av.reparaciones[0].etiqueta, 'Pasar a caño y grampa');
  let d2 = d;
  for (const a of r.avisos.filter((x) => x.regla === 'diag.sin_codigo')) d2 = M.aplicarReparacion(d2, a.reparaciones[0].accion);
  const r2 = build(d2);
  assert.ok(!r2.avisos.some((a) => a.regla === 'diag.sin_codigo'));
  assert.ok(r2.piezas.some((p) => p.familia === 'grampa_giratoria' && p.celda === `${v.id}@1`));
  assert.deepEqual(diagonalesFueraDeNodo(r2), []);
});
