/**
 * Grillas de esqueleto para tipologías: rectangular (base de casi todo) y sobre un polígono
 * (envolventes y patios internos). Coordenadas LOCALES (s, t); y arriba.
 */
import type { Columna, Esqueleto, ModoMedida, Poligono, Sistema, TramoVano, V2 } from '../../tipos.ts';
import { CRITERIOS } from '../../criterios.ts';
import { type Catalogo, medidasPorDefecto, type MedidasCatalogo } from '../../catalogo/catalogo.ts';
import { ConstructorEsqueleto } from '../../esqueleto/esqueleto.ts';
import { arrDesde, conIntermedios, nivelesMulti, type ModoPlataforma, type Nivel } from '../../medida/alturas.ts';
import { rellenarLargo } from '../../medida/rellenar.ts';
import { bandaConDiagonal, celdaDiagonal, sentidoZigzag, vanosArriostrados } from '../../reglas/diagonales.ts';
import { centroide, EPS, r3 } from '../../util.ts';

type Medida = number | TramoVano;
const aTramo = (x: Medida, lista: number[]): TramoVano => (typeof x === 'number' ? { medida: x, libre: !lista.some((l) => Math.abs(l - x) < 0.0015) } : x);

export interface OpcionesGrillaRect {
  /** vanos a lo largo (s), en orden */
  vanosS: Medida[];
  /** profundidades (t), en orden desde la cara interior */
  profundidades: Medida[];
  /** cotas de anillo ascendentes (la primera es el arranque) */
  cotas: number[];
  origen?: V2;
  sistema?: Sistema;
  prefijo?: string;
  apoyo?: Columna['apoyo'];
  /** cota superior de las columnas (default: última cota + 1,00 de baranda) */
  yTope?: number;
  /** cotas con plataforma en todos los paños */
  plataformas?: number[];
  /** baranda doble y rodapié en el perímetro de cada plataforma (default true) */
  barandas?: boolean;
  /** caras con baranda (default todas) */
  barandaEn?: { interior?: boolean; exterior?: boolean; laterales?: boolean };
  /** diagonales en zigzag en la cara exterior y en las transversales extremas (default true) */
  diagonales?: boolean;
  medidas?: MedidasCatalogo;
  /** para elegir caño y grampa en bandas sin diagonal de catálogo */
  catalogo?: Catalogo;
  en?: ConstructorEsqueleto;
}

export interface GrillaRect {
  b: ConstructorEsqueleto;
  esqueleto: Esqueleto;
  S: number[];
  T: number[];
  /** col[i][j]: columna en S[i], T[j] */
  col: string[][];
  /** vanosS[j][i]: vano a lo largo en la fila j (j = 0 interior, último = exterior) */
  vanosS: string[][];
  /** vanosT[i][j]: vano transversal en la columna i */
  vanosT: string[][];
  /** panos[i][j] */
  panos: string[][];
}

/** Esqueleto rectangular: columnas, vanos, paños y, opcional, plataformas, barandas y diagonales. */
export function grillaRect(o: OpcionesGrillaRect): GrillaRect {
  const m = o.medidas || medidasPorDefecto();
  const sistema = o.sistema || 'multi';
  const listaS = sistema === 'bastidor' ? m.bastidor.vanos : m.multi.vanos;
  const listaT = sistema === 'bastidor' ? m.bastidor.anchos : [...m.multi.profundidades, ...m.multi.vanos];
  const ts = o.vanosS.map((x) => aTramo(x, listaS));
  const tt = o.profundidades.map((x) => aTramo(x, listaT));
  const [s0, t0] = o.origen || [0, 0];
  const S = [s0];
  for (const v of ts) S.push(r3(S[S.length - 1] + v.medida));
  const T = [t0];
  for (const v of tt) T.push(r3(T[T.length - 1] + v.medida));
  const b = o.en || new ConstructorEsqueleto(sistema, o.cotas);
  if (o.en) b.setCotas([...b.esq.cotas, ...o.cotas]);
  const pf = o.prefijo || '';
  const cotas = [...o.cotas].sort((a, c) => a - c);
  const yBase = cotas[0];
  const plats = (o.plataformas || []).map(r3);
  const yTope = o.yTope ?? r3(cotas[cotas.length - 1] + (plats.includes(r3(cotas[cotas.length - 1])) ? 1 : 0));
  const col: string[][] = [];
  for (let i = 0; i < S.length; i++) {
    col[i] = [];
    for (let j = 0; j < T.length; j++) col[i][j] = b.columna(`${pf}c${i}_${j}`, [S[i], T[j]], yBase, yTope, o.apoyo || 'base_regulable');
  }
  const nj = T.length - 1;
  const vanosS: string[][] = [];
  for (let j = 0; j <= nj; j++) {
    vanosS[j] = [];
    const cara: 'interior' | 'exterior' | 'interna' = j === 0 ? 'interior' : j === nj ? 'exterior' : 'interna';
    for (let i = 0; i < ts.length; i++) vanosS[j][i] = b.vano(`${pf}s${j}_${i}`, col[i][j], col[i + 1][j], cara, { libre: ts[i].libre, normal: j === 0 ? [0, -1] : j === nj ? [0, 1] : undefined });
  }
  const vanosT: string[][] = [];
  for (let i = 0; i < S.length; i++) {
    vanosT[i] = [];
    for (let j = 0; j < nj; j++) vanosT[i][j] = b.vano(`${pf}t${i}_${j}`, col[i][j], col[i][j + 1], 'transversal', { libre: tt[j].libre, normal: i === 0 ? [-1, 0] : i === S.length - 1 ? [1, 0] : undefined });
  }
  const panos: string[][] = [];
  for (let i = 0; i < ts.length; i++) {
    panos[i] = [];
    for (let j = 0; j < nj; j++) panos[i][j] = b.pano(`${pf}p${i}_${j}`, [vanosS[j][i], vanosT[i + 1][j], vanosS[j + 1][i], vanosT[i][j]], { libre: ts[i].libre || tt[j].libre, sentido: vanosS[j][i] });
  }
  const be = { interior: true, exterior: true, laterales: true, ...(o.barandaEn || {}) };
  for (const c of plats) {
    const k = b.k(c);
    if (k < 0) continue;
    for (const fila of panos) for (const pid of fila) b.celdaPano(pid, k, { plataforma: 'tablones' });
    if (o.barandas !== false) {
      for (let i = 0; i < ts.length; i++) {
        if (be.interior) b.celda(vanosS[0][i], k, { baranda: 2 });
        if (be.exterior) b.celda(vanosS[nj][i], k, { baranda: 2 });
      }
      if (be.laterales) for (let j = 0; j < nj; j++) {
        b.celda(vanosT[0][j], k, { baranda: 2 });
        b.celda(vanosT[S.length - 1][j], k, { baranda: 2 });
      }
    }
  }
  const diag = (h: number, largo: number, s: 'sube' | 'baja') => (o.catalogo ? celdaDiagonal(o.catalogo, h, largo, s) : { diagonal: s });
  if (o.diagonales !== false && sistema === 'multi') {
    const ks = b.esq.cotas;
    vanosArriostrados(ts.length).forEach((i, fase) => {
      let orden = 0;
      for (let k = 1; k < ks.length; k++) if (bandaConDiagonal(ks[k] - ks[k - 1])) b.celda(vanosS[nj][i], k, diag(ks[k] - ks[k - 1], ts[i].medida, sentidoZigzag(orden++, fase)));
    });
    for (const [i, fase] of [[0, 0], [S.length - 1, 1]] as const) for (let j = 0; j < nj; j++) {
      let orden = 0;
      for (let k = 1; k < ks.length; k++) if (bandaConDiagonal(ks[k] - ks[k - 1])) b.celda(vanosT[i][j], k, diag(ks[k] - ks[k - 1], tt[j].medida, sentidoZigzag(orden++, fase + j)));
    }
  }
  return { b, esqueleto: b.esq, S, T, col, vanosS, vanosT, panos };
}

export interface CotasNiveles {
  ARR: number;
  niveles: Nivel[];
  /** cotas de anillo con intermedios (≤ 2,00 libres) */
  cotas: number[];
  plataformas: number[];
  yTopCol: number;
  alturaReal: number;
}

/**
 * Niveles cada 2,00 con el último nivel de trabajo a H − 1,00 y el arranque regulable.
 * `arranque` fija la fase de rosetas (p. ej. heredada de otra estructura); `base` corre todo hacia arriba
 * (estructura sobre una losa o azotea).
 */
export function cotasNiveles(o: { altura: number; modo?: ModoPlataforma; arranque?: number; viaPublica?: boolean; base?: number }): CotasNiveles {
  const base = o.base ?? 0;
  const H = o.altura;
  const ARR = o.arranque ?? arrDesde(H - 1);
  const nv = nivelesMulti(H, ARR, { modoPlataforma: o.modo || 'cada_2m', viaPublica: o.viaPublica });
  const { cotas } = conIntermedios([nv.ARR, ...nv.niveles.map((x) => x.cota)]);
  const sube = (y: number) => r3(y + base);
  return {
    ARR: sube(nv.ARR),
    niveles: nv.niveles.map((x) => ({ ...x, cota: sube(x.cota) })),
    cotas: cotas.map(sube),
    plataformas: nv.niveles.filter((x) => x.plataforma).map((x) => sube(x.cota)),
    yTopCol: sube(nv.yTopCol),
    alturaReal: nv.alturaReal,
  };
}

// ───────────── grilla sobre un polígono ─────────────
export interface OpcionesGrillaPoligono {
  poligono: Poligono;
  /** distancia del polígono a la línea de verticales de contacto */
  offset: number;
  profundidad: number;
  cotas: number[];
  /** true: anillo cerrado (envolvente); false: tira abierta sobre los lados */
  cerrada: boolean;
  /** 'afuera' rodea el volumen (envolvente); 'adentro' va por dentro (patio entre medianeras) */
  lado?: 'afuera' | 'adentro';
  modo?: ModoMedida;
  medidas?: MedidasCatalogo;
  prefijo?: string;
  apoyo?: Columna['apoyo'];
  yTope?: number;
  plataformas?: number[];
  barandas?: boolean;
  diagonales?: boolean;
  /** lados (índices) sin andamio (p. ej. el lado abierto de un patio) */
  sinLados?: number[];
  /** para elegir caño y grampa en bandas sin diagonal de catálogo */
  catalogo?: Catalogo;
  en?: ConstructorEsqueleto;
}

export interface GrillaPoligono {
  b: ConstructorEsqueleto;
  esqueleto: Esqueleto;
  /** por lado: columnas de contacto y exteriores, vanos y paños */
  lados: { contacto: string[]; exterior: string[]; vInt: string[]; vExt: string[]; vTr: string[]; panos: string[]; tramos: TramoVano[] }[];
  /** columnas de contacto (para anclar al muro o al volumen) */
  contacto: string[];
}

const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2, k = 1): V2 => [r3(a[0] + b[0] * k), r3(a[1] + b[1] * k)];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const unit = (a: V2): V2 => {
  const L = len(a) || 1;
  return [a[0] / L, a[1] / L];
};
function cruce(p: V2, u: V2, q: V2, v: V2): V2 | null {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const l = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [r3(p[0] + u[0] * l), r3(p[1] + u[1] * l)];
}

/**
 * Recorre un polígono con un andamio de profundidad dada. Cada lado se parte en vanos (catálogo o libre).
 * - 'afuera' (envolvente): las verticales de contacto se comparten en las esquinas (inglete) y la esquina
 *   exterior se cierra con un cuadro (o un triángulo si el giro es chico).
 * - 'adentro' (patio): cada lado arranca contra la cara del lado anterior (como una esquina entrante) y
 *   comparte sus columnas.
 */
export function grillaPoligono(o: OpcionesGrillaPoligono): GrillaPoligono {
  const m = o.medidas || medidasPorDefecto();
  const P = o.poligono;
  const n = P.length;
  const lado = o.lado || 'afuera';
  const b = o.en || new ConstructorEsqueleto('multi', o.cotas);
  if (o.en) b.setCotas([...b.esq.cotas, ...o.cotas]);
  const pf = o.prefijo || 'g';
  const cotas = [...o.cotas].sort((a, c) => a - c);
  const plats = (o.plataformas || []).map(r3);
  const yTope = o.yTope ?? r3(cotas[cotas.length - 1] + (plats.includes(r3(cotas[cotas.length - 1])) ? 1 : 0));
  const c0 = centroide(P);
  const nLados = o.cerrada ? n : n - 1;
  // normal de cada lado hacia donde va el andamio
  const normales: V2[] = [];
  const dirs: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const c = P[(i + 1) % n];
    const d = unit(sub(c, a));
    let nn: V2 = [-d[1], d[0]];
    const mid: V2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    const haciaCentro = (c0[0] - mid[0]) * nn[0] + (c0[1] - mid[1]) * nn[1] > 0;
    if ((lado === 'afuera') === haciaCentro) nn = [-nn[0], -nn[1]];
    normales.push(nn);
    dirs.push(d);
  }
  const linea = (i: number, dist: number): { p: V2; u: V2 } => ({ p: add(P[i], normales[i], dist), u: dirs[i] });
  const esquina = (i: number, j: number, dist: number): V2 => {
    const a = linea(i, dist);
    const c = linea(j, dist);
    return cruce(a.p, a.u, c.p, c.u) || add(P[j], normales[j], dist);
  };
  const d0 = o.offset;
  const d1 = o.offset + o.profundidad;
  const yBase = cotas[0];
  const lados: GrillaPoligono['lados'] = [];
  const contacto: string[] = [];
  const sinLados = new Set(o.sinLados || []);
  for (let i = 0; i < nLados; i++) {
    if (sinLados.has(i)) {
      lados.push({ contacto: [], exterior: [], vInt: [], vExt: [], vTr: [], panos: [], tramos: [] });
      continue;
    }
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;
    const tienePrev = (o.cerrada || i > 0) && !sinLados.has(prev);
    const tieneNext = (o.cerrada || i < n - 2) && !sinLados.has(next);
    // extremos de la línea de contacto
    let ini = tienePrev ? esquina(prev, i, d0) : add(P[i], normales[i], d0);
    const fin = tieneNext ? esquina(i, next, d0) : add(P[(i + 1) % n], normales[i], d0);
    if (lado === 'adentro' && tienePrev) {
      // arranca contra la cara exterior del lado anterior
      const a = linea(prev, d1);
      const c = linea(i, d0);
      ini = cruce(a.p, a.u, c.p, c.u) || ini;
    }
    const L = r3(len(sub(fin, ini)));
    const rel = rellenarLargo(L, 'multi', { modo: o.modo || 'catalogo', medidas: m });
    const tramos = rel.vanos;
    const sAcc = [0];
    for (const t of tramos) sAcc.push(r3(sAcc[sAcc.length - 1] + t.medida));
    const ci: string[] = [];
    const ce: string[] = [];
    sAcc.forEach((s, k) => {
      const q = add(ini, dirs[i], s);
      ci.push(b.columna(`${pf}${i}i${k}`, q, yBase, yTope, o.apoyo || 'base_regulable'));
      ce.push(b.columna(`${pf}${i}e${k}`, add(q, normales[i], o.profundidad), yBase, yTope, o.apoyo || 'base_regulable'));
    });
    const vInt: string[] = [];
    const vExt: string[] = [];
    const vTr: string[] = [];
    const panos: string[] = [];
    const nInt: V2 = [-normales[i][0], -normales[i][1]];
    tramos.forEach((t, k) => {
      vInt.push(b.vano(`${pf}${i}vi${k}`, ci[k], ci[k + 1], 'interior', { libre: t.libre, normal: nInt }));
      vExt.push(b.vano(`${pf}${i}ve${k}`, ce[k], ce[k + 1], 'exterior', { libre: t.libre, normal: normales[i] }));
    });
    const profLibre = !m.multi.profundidades.some((x) => Math.abs(x - o.profundidad) < 0.0015);
    ci.forEach((_, k) => vTr.push(b.vano(`${pf}${i}vt${k}`, ci[k], ce[k], 'transversal', { libre: profLibre })));
    tramos.forEach((t, k) => panos.push(b.pano(`${pf}${i}p${k}`, [vInt[k], vTr[k + 1], vExt[k], vTr[k]], { libre: t.libre || profLibre, sentido: vExt[k] })));
    contacto.push(...ci);
    lados.push({ contacto: ci, exterior: ce, vInt, vExt, vTr, panos, tramos });
  }
  // esquinas exteriores (afuera): cuadro con columna de inglete o triángulo
  if (lado === 'afuera') {
    for (let i = 0; i < nLados; i++) {
      const next = (i + 1) % n;
      if (!(o.cerrada || i < n - 2) || sinLados.has(i) || sinLados.has(next) || !lados[next] || !lados[next].exterior.length) continue;
      const A = lados[i];
      const B = lados[next];
      const oA = A.exterior[A.exterior.length - 1];
      const oB = B.exterior[0];
      if (oA === oB) continue;
      const giro = Math.acos(Math.max(-1, Math.min(1, dirs[i][0] * dirs[next][0] + dirs[i][1] * dirs[next][1]))) * (180 / Math.PI);
      const trA = A.vTr[A.vTr.length - 1];
      const trB = B.vTr[0];
      if (giro >= 60) {
        const X = esquina(i, next, d1);
        const cx = b.columna(`${pf}x${i}`, X, yBase, yTope, o.apoyo || 'base_regulable');
        const v1 = b.vano(`${pf}x${i}a`, oA, cx, 'exterior', { libre: true, normal: normales[i] });
        const v2 = b.vano(`${pf}x${i}b`, cx, oB, 'exterior', { libre: true, normal: normales[next] });
        b.pano(`${pf}x${i}p`, [trA, v1, v2, trB], { libre: true, sentido: v1 });
      } else {
        const v1 = b.vano(`${pf}x${i}a`, oA, oB, 'exterior', { libre: true });
        b.pano(`${pf}x${i}p`, [trA, v1, trB], { libre: true });
      }
    }
  }
  // libre flag del vano según catálogo
  for (const v of b.esq.vanos) if (!v.libre) v.libre = !(v.cara === 'transversal' ? m.multi.profundidades : m.multi.vanos).some((x) => Math.abs(x - v.medida) < 0.0015);
  // plataformas, barandas y diagonales
  for (const c of plats) {
    const k = b.k(c);
    if (k < 0) continue;
    for (const p of b.esq.panos) if (p.id.startsWith(pf)) b.celdaPano(p.id, k, { plataforma: 'tablones' });
    if (o.barandas !== false) for (const v of b.esq.vanos) {
      if (!v.id.startsWith(pf)) continue;
      if (v.cara === 'exterior' || (v.cara === 'interior' && o.offset > CRITERIOS.retiroLibre + EPS)) b.celda(v.id, k, { baranda: 2 });
    }
    if (!o.cerrada && o.barandas !== false) {
      const primero = lados.find((x) => x.vTr.length);
      const ultimo = [...lados].reverse().find((x) => x.vTr.length);
      if (primero) b.celda(primero.vTr[0], k, { baranda: 2 });
      if (ultimo) b.celda(ultimo.vTr[ultimo.vTr.length - 1], k, { baranda: 2 });
    }
  }
  const diag = (h: number, largo: number, s: 'sube' | 'baja') => (o.catalogo ? celdaDiagonal(o.catalogo, h, largo, s) : { diagonal: s });
  if (o.diagonales !== false) {
    const ks = b.esq.cotas;
    for (const L of lados) {
      vanosArriostrados(L.vExt.length).forEach((i, fase) => {
        let orden = 0;
        for (let k = 1; k < ks.length; k++) if (bandaConDiagonal(ks[k] - ks[k - 1])) b.celda(L.vExt[i], k, diag(ks[k] - ks[k - 1], L.tramos[i].medida, sentidoZigzag(orden++, fase)));
      });
    }
  }
  return { b, esqueleto: b.esq, lados, contacto };
}

