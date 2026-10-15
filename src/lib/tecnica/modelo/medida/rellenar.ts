/**
 * Relleno de un largo con vanos (pedido 8: dimensión libre).
 * - 'catalogo' (default ágil): solo largos de catálogo; muestra el desvío y alternativas.
 * - 'libre': cubre el largo exacto con vanos de catálogo + UN tramo de caño y grampa (0,20 a 2,50 ⚠).
 */
import type { ModoMedida, Relleno, Sistema, TramoVano } from '../tipos.ts';
import { CRITERIOS } from '../criterios.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../catalogo/catalogo.ts';
import { EPS, fmt, r3, sum } from '../util.ts';

export interface OpcionesRelleno {
  modo?: ModoMedida;
  ajuste?: 'final' | 'centrado';
  medidas?: MedidasCatalogo;
}

const DEF = medidasPorDefecto();

export function textoVanos(vanos: number[]): string {
  if (!vanos.length) return '—';
  const grupos: { v: number; n: number }[] = [];
  for (const v of vanos) {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g.v - v) < EPS) g.n++;
    else grupos.push({ v, n: 1 });
  }
  return grupos.map((g) => (g.n > 1 ? `${g.n}×${fmt(g.v)}` : fmt(g.v))).join(' + ');
}

/** Texto de tramos: los libres se muestran como «ajuste x con caño y grampas». */
export function textoTramos(tramos: TramoVano[]): string {
  const cat = tramos.filter((t) => !t.libre).map((t) => t.medida);
  const lib = tramos.filter((t) => t.libre);
  const partes: string[] = [];
  if (cat.length) partes.push(textoVanos(ordenar(cat, 'final')));
  for (const t of lib) partes.push(`ajuste ${fmt(t.medida)} con caño y grampas`);
  return partes.join(' + ') || '—';
}

const aTramos = (vs: number[]): TramoVano[] => vs.map((medida) => ({ medida, libre: false }));
export const medidasDeTramos = (ts: TramoVano[]): number[] => ts.map((t) => t.medida);

function pesoAprox(vanos: number[], sistema: Sistema): number {
  // métrica relativa (verticales por columna + 2 horizontales + 2 tablones por vano). Solo para ordenar.
  if (sistema === 'bastidor') return sum(vanos.map((v) => (v > 2 ? 38 : 31))) + 20;
  return (vanos.length + 1) * 2 * 10.5 + sum(vanos.map((v) => v * (3.68 * 2 + 6.96 * 2)));
}

function ordenar(vanos: number[], ajuste: 'final' | 'centrado'): number[] {
  const mayor = Math.max(...vanos, 0);
  const std = vanos.filter((v) => Math.abs(v - mayor) < EPS);
  const otros = vanos.filter((v) => Math.abs(v - mayor) >= EPS).sort((a, b) => b - a);
  if (ajuste === 'centrado' && std.length >= 2 && otros.length) {
    const izq = Math.floor(std.length / 2);
    return [...std.slice(0, izq), ...otros, ...std.slice(izq)];
  }
  return [...std, ...otros];
}

function candidatos(L: number, sistema: Sistema, m: MedidasCatalogo): number[][] {
  const out: number[][] = [];
  if (sistema === 'bastidor') {
    const [g, c] = [m.bastidor.vanos[0] ?? 2.5, m.bastidor.vanos[1] ?? 1.5];
    for (let a = 0; a <= Math.ceil(L / g) + 1; a++) for (let b = 0; b <= 3; b++) if (a + b) out.push([...Array(a).fill(g), ...Array(b).fill(c)]);
    return out;
  }
  const lista = [...m.multi.vanos].sort((a, b) => b - a);
  const g = lista[0] ?? 2.5;
  const resto = lista.slice(1);
  const n = Math.floor(L / g + EPS);
  for (const k of [n - 2, n - 1, n, n + 1]) {
    if (k < 0) continue;
    const base = Array(k).fill(g);
    out.push(base);
    for (const a of resto) out.push([...base, a]);
    for (const a of resto) for (const b of resto) if (b <= a) out.push([...base, a, b]);
  }
  return out.filter((v) => v.length > 0);
}

/** Relleno con solo largos de catálogo (idéntico a la maqueta). */
function rellenoCatalogo(L: number, sistema: Sistema, ajuste: 'final' | 'centrado', m: MedidasCatalogo) {
  const validas = candidatos(L, sistema, m);
  const val = (v: number[]) => sum(v) - L;
  const g = sistema === 'bastidor' ? m.bastidor.vanos[0] : Math.max(...m.multi.vanos);
  const score = (v: number[]) => {
    const d = val(v);
    return Math.abs(d) * (d < 0 ? 1.4 : 1) + v.length * 0.002 + v.filter((x) => Math.abs(x - g) > EPS).length * 0.01;
  };
  validas.sort((x, y) => score(x) - score(y));
  const vanos = ordenar(validas[0] || [g], ajuste);
  return { vanos, validas, val };
}

export function rellenarLargo(largo: number, sistema: Sistema = 'multi', opciones: OpcionesRelleno = {}): Relleno {
  const ajuste = opciones.ajuste || 'final';
  const modo: ModoMedida = opciones.modo || 'catalogo';
  const m = opciones.medidas || DEF;
  const L = Math.max(0, Number.isFinite(+largo) ? +largo : 0);
  const { vanos, validas, val } = rellenoCatalogo(L, sistema, ajuste, m);
  const lista = sistema === 'bastidor' ? m.bastidor.vanos : m.multi.vanos;

  if (modo === 'libre') return rellenoLibre(L, ajuste, vanos, validas);

  const res: Relleno = {
    modo, pedido: r3(L), vanos: aTramos(vanos), total: r3(sum(vanos)), desvio: r3(val(vanos)),
    texto: `${fmt(L)} → ${textoVanos(vanos)}`, alternativas: [],
  };
  const push = (id: string, etiqueta: string, vs: number[] | undefined | null) => {
    if (!vs || !vs.length) return;
    const t = textoVanos(vs);
    if (t === textoVanos(vanos) || res.alternativas.some((a) => a.texto === t)) return;
    res.alternativas.push({ id, etiqueta, vanos: aTramos(vs), texto: t, desvio: r3(val(vs)) });
  };
  const tol = CRITERIOS.toleranciaRelleno + EPS;
  const dentro = validas.filter((v) => Math.abs(val(v)) <= tol);
  const menos = [...(dentro.length ? dentro : validas.filter((v) => val(v) >= 0))].sort((x, y) => x.length - y.length || Math.abs(val(x)) - Math.abs(val(y)))[0];
  push('menos_piezas', 'Menos piezas', menos && ordenar(menos, ajuste));
  let iguales: number[] | null = null;
  for (const v of lista) {
    const k = Math.max(1, Math.round(L / v));
    const cand = Array(k).fill(v);
    if (!iguales || Math.abs(val(cand)) < Math.abs(val(iguales)) - EPS) iguales = cand;
  }
  push('vanos_iguales', 'Vanos iguales', iguales);
  const pool = dentro.length ? dentro : validas.slice(0, 12);
  const liviano = [...pool].sort((x, y) => pesoAprox(x, sistema) - pesoAprox(y, sistema))[0];
  push('menos_peso', 'Menos peso', liviano && ordenar(liviano, ajuste));
  if (sistema !== 'bastidor') push('centrado', ajuste === 'centrado' ? 'Ajuste al final' : 'Ajuste centrado', ordenar(vanos, ajuste === 'centrado' ? 'final' : 'centrado'));
  return res;
}

function rellenoLibre(L: number, ajuste: 'final' | 'centrado', vanosCat: number[], validas: number[][]): Relleno {
  const min = CRITERIOS.tramoLibreMin;
  const max = CRITERIOS.tramoLibreMax;
  const tolExacto = 0.005;
  let mejor: { cat: number[]; resto: number } | null = null;
  const pool = [[], ...validas];
  for (const v of pool) {
    const t = sum(v);
    const resto = r3(L - t);
    if (resto < -tolExacto) continue;
    const exacto = Math.abs(resto) <= tolExacto;
    if (!exacto && (resto < min - EPS || resto > max + EPS)) continue;
    const r = exacto ? 0 : resto;
    if (!mejor || r < mejor.resto - EPS || (Math.abs(r - mejor.resto) < EPS && v.length < mejor.cat.length)) mejor = { cat: v, resto: r };
  }
  let tramos: TramoVano[];
  if (!mejor) {
    // largo menor que el tramo mínimo: un solo tramo libre
    tramos = [{ medida: r3(Math.max(L, 0.05)), libre: true }];
  } else {
    const cat = ordenar(mejor.cat, ajuste).map((medida) => ({ medida, libre: false }));
    if (mejor.resto > 0) {
      const lib = { medida: r3(mejor.resto), libre: true };
      if (ajuste === 'centrado' && cat.length >= 2) {
        const i = Math.floor(cat.length / 2);
        tramos = [...cat.slice(0, i), lib, ...cat.slice(i)];
      } else tramos = [...cat, lib];
    } else tramos = cat;
  }
  const total = r3(sum(tramos.map((t) => t.medida)));
  const res: Relleno = {
    modo: 'libre', pedido: r3(L), vanos: tramos, total, desvio: r3(total - L),
    texto: `${fmt(L)} → ${textoTramos(tramos)}`, alternativas: [],
  };
  const tCat = textoVanos(vanosCat);
  const dCat = r3(sum(vanosCat) - L);
  if (tramos.some((t) => t.libre)) res.alternativas.push({ id: 'solo_catalogo', etiqueta: 'Solo catálogo', vanos: aTramos(vanosCat), texto: tCat, desvio: dCat });
  return res;
}
