/**
 * Tira de bastidores en esqueleto (port de tramoBastidor): bastidores en cada plano transversal, riendas H
 * en las dos líneas y cruzadas D en la cara exterior, tablones, bastidor baranda arriba y laterales de caño.
 */
import type { OverrideCelda, V2 } from '../../tipos.ts';
import { CRITERIOS } from '../../criterios.ts';
import type { Nivel } from '../../medida/alturas.ts';
import type { ConstructorEsqueleto } from '../../esqueleto/esqueleto.ts';
import { EPS, type Marco } from '../../util.ts';

export interface OpcionesTira {
  prefijo: string;
  mk: Marco;
  S: number[];
  vanos: number[];
  w: number;
  niveles: Nivel[];
  ARR: number;
  yTopCol: number;
  O?: (v: number, n: number) => OverrideCelda;
  accesos?: number[];
  viaPublica?: boolean;
  retiro?: number;
  /** false: sin barandas en el piso (pórtico con estructura arriba) */
  barandas?: boolean;
  barandaTope?: boolean;
  laterales?: [boolean, boolean];
  movil?: boolean;
}

export interface Tira {
  col: string[][];
  vInt: string[];
  vExt: string[];
  vTr: string[];
  pano: string[];
  K: (y: number) => number;
}

export function tiraBastidor(b: ConstructorEsqueleto, o: OpcionesTira): Tira {
  const { mk, S, vanos, w, niveles, ARR, yTopCol, prefijo } = o;
  const m = vanos.length;
  const N = niveles.length;
  const O = o.O || ((): OverrideCelda => ({}));
  const P = (s: number, t: number): V2 => {
    const q = mk.W(s, 0, t);
    return [q[0], q[2]];
  };
  const K = (y: number) => b.k(y);
  const col: string[][] = [];
  for (let i = 0; i <= m; i++) {
    col[i] = [0, w].map((t, side) => {
      const id = b.columna(`${prefijo}c${i}${side ? 'e' : 'i'}`, P(S[i], t), ARR, yTopCol, 'base_regulable', o.movil ? { movil: true } : {});
      if (o.viaPublica) {
        b.elemento({ id: `recub:${id}`, familia: 'recubrimiento', medidas: { largo: 2.0 }, a: mk.W(S[i], ARR, t), b: mk.W(S[i], 2, t), grupo: 'via_publica', sistema: 'comun' });
        if (side === 1) b.elemento({ id: `esf:${id}`, familia: 'esfera', medidas: {}, a: mk.W(S[i], 1, t), b: mk.W(S[i], 1, t), grupo: 'via_publica', sistema: 'comun' });
      }
      return id;
    });
  }
  const nInt: V2 = [-mk.n[0], -mk.n[1]];
  const nExt: V2 = [mk.n[0], mk.n[1]];
  const vInt: string[] = [];
  const vExt: string[] = [];
  const vTr: string[] = [];
  const pano: string[] = [];
  for (let v = 0; v < m; v++) {
    vInt[v] = b.vano(`${prefijo}i${v}`, col[v][0], col[v + 1][0], 'interior', { normal: nInt });
    vExt[v] = b.vano(`${prefijo}e${v}`, col[v][1], col[v + 1][1], 'exterior', { normal: nExt });
  }
  for (let i = 0; i <= m; i++) vTr[i] = b.vano(`${prefijo}t${i}`, col[i][0], col[i][1], 'transversal', { normal: i === 0 ? [-mk.u[0], -mk.u[1]] : [mk.u[0], mk.u[1]] });
  for (let v = 0; v < m; v++) pano[v] = b.pano(`${prefijo}p${v}`, [vInt[v], vTr[v + 1], vExt[v], vTr[v]], { sentido: vExt[v] });

  const kTop = K(niveles[N - 1].cota);
  if (o.barandaTope !== false) for (let i = 0; i <= m; i++) b.celda(vTr[i], kTop, { baranda: 2, rodapie: false });
  niveles.forEach((lv, n) => {
    const k = K(lv.cota);
    for (let v = 0; v < m; v++) {
      const o2 = O(v, n);
      if (o2.abertura) b.celda(vExt[v], k, { abertura: !lv.paso, ...(lv.paso ? {} : { horizontal: false }) });
      if (!o2.abertura || lv.paso) b.celda(vExt[v], k, { diagonal: 'sube' });
      if (o2.abertura && !lv.paso) b.celda(vInt[v], k, { horizontal: false });
      const esAcceso = (o.accesos || []).includes(v);
      const conPlat = (lv.plataforma || esAcceso) && !o2.abertura && !o2.sinPlataforma;
      if (conPlat) {
        const esc = esAcceso && Math.abs(vanos[v] - 2.5) < EPS && n < N - 1;
        b.celdaPano(pano[v], k, { plataforma: esc ? 'escotilla' : 'tablones', ...(lv.bandeja ? { fenolico: true } : {}) });
        if (o.barandas !== false) {
          b.celda(vExt[v], k, { baranda: 2 });
          if ((o.retiro ?? 0.2) > CRITERIOS.retiroLibre + EPS) b.celda(vInt[v], k, { baranda: 2 });
          for (const [i, activo] of [[0, v === 0 && o.laterales?.[0]], [m, v === m - 1 && o.laterales?.[1]]] as const) {
            if (!activo) continue;
            if (n < N - 1 || o.barandaTope === false) b.celda(vTr[i], k, { baranda: 2, rodapie: true });
            else b.celda(vTr[i], k, { rodapie: true });
          }
        }
      }
      if (esAcceso) {
        const y0 = n === 0 ? ARR : niveles[n - 1].cota;
        b.elemento({ id: `esc:${prefijo}v${v}n${n}`, familia: 'escalera_interior', medidas: {}, a: mk.W(S[v] + 0.25, y0, w * 0.5), b: mk.W(S[v] + 1.0, lv.cota, w * 0.5), grupo: 'acceso', sistema: 'bastidor' });
      }
    }
  });
  return { col, vInt, vExt, vTr, pano, K };
}
