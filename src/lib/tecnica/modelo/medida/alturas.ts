/**
 * Niveles y alturas (port de la maqueta): niveles cada 2,00 sobre la grilla de rosetas de 0,50,
 * arranque regulable con el tornillón y último nivel a H − 1,00.
 */
import { CRITERIOS } from '../criterios.ts';
import { EPS, mod, r3 } from '../util.ts';

export interface Nivel {
  n: number;
  cota: number;
  plataforma: boolean;
  bandeja: boolean;
  faldon?: boolean;
  alto?: number;
  paso?: boolean;
  tope?: boolean;
}
export interface Niveles {
  ARR: number;
  niveles: Nivel[];
  yTopCol: number;
  alturaReal: number;
}

/** Arranque (fase de la grilla de rosetas) para que `objetivo` caiga en una roseta. */
export const arrDesde = (objetivo: number): number => r3(0.25 + mod(objetivo - 0.25, 0.5));

export type ModoPlataforma = 'cada_2m' | 'cada_nivel' | 'solo_trabajo' | 'ninguna';

export function nivelesMulti(H: number, ARR: number, p: { viaPublica?: boolean; modoPlataforma?: ModoPlataforma; bandejaPB?: boolean } = {}): Niveles {
  const yN = r3(ARR + 0.5 * Math.floor((H - 1 - ARR) / 0.5 + EPS));
  const minimo = p.viaPublica ? Math.max(ARR + 1.5, CRITERIOS.galiboPeatonal) : ARR + 1.5;
  const cotas: number[] = [];
  for (let c = yN; c >= minimo - EPS; c = r3(c - CRITERIOS.pasoNivel)) cotas.unshift(c);
  if (!cotas.length) cotas.push(Math.max(yN, r3(ARR + 0.5)));
  const N = cotas.length;
  const niveles: Nivel[] = cotas.map((cota, n) => ({ n, cota, plataforma: false, bandeja: false }));
  const modo = p.modoPlataforma || 'cada_2m';
  let ultima = Infinity;
  for (let n = N - 1; n >= 0; n--) {
    const lv = niveles[n];
    if (modo === 'cada_nivel') lv.plataforma = true;
    else if (modo === 'cada_2m') {
      if (ultima - lv.cota >= 2 - EPS) {
        lv.plataforma = true;
        ultima = lv.cota;
      }
    } else if (modo === 'solo_trabajo') lv.plataforma = n === N - 1;
  }
  if (p.bandejaPB) {
    niveles[0].plataforma = true;
    niveles[0].bandeja = true;
  }
  const top = niveles[N - 1];
  const yTopCol = r3(top.plataforma ? top.cota + 1 : top.cota);
  return { ARR, niveles, yTopCol, alturaReal: yTopCol };
}

export function nivelesPantalla(H: number): Niveles {
  const ARR = arrDesde(H);
  const bandeja = r3(ARR + 0.5 * Math.ceil((CRITERIOS.galiboPeatonal - ARR) / 0.5 - EPS));
  const cotas = [bandeja];
  for (let c = r3(bandeja + 2); c < H - 0.25 + EPS; c = r3(c + 2)) cotas.push(c);
  if (H - cotas[cotas.length - 1] >= 0.5 - EPS) cotas.push(r3(ARR + 0.5 * Math.floor((H - ARR) / 0.5 + EPS)));
  const niveles: Nivel[] = cotas.map((cota, n) => ({ n, cota, plataforma: n === 0, bandeja: n === 0, faldon: n === 0 }));
  const yTopCol = r3(Math.max(cotas[cotas.length - 1], bandeja + 0.5));
  return { ARR, niveles, yTopCol, alturaReal: yTopCol };
}

export function nivelesBastidor(H: number, pea: boolean, m: { alturaCuerpo: number; alturaPaso: number; alturaBaranda: number }): Niveles {
  const ARR = 0.25;
  const primero = pea ? m.alturaPaso : m.alturaCuerpo;
  const N = Math.max(1, 1 + Math.round((H - m.alturaBaranda - ARR - primero) / m.alturaCuerpo));
  const niveles: Nivel[] = [];
  let c = ARR;
  for (let n = 0; n < N; n++) {
    const h = n === 0 ? primero : m.alturaCuerpo;
    c = r3(c + h);
    niveles.push({ n, cota: c, alto: h, plataforma: true, bandeja: n === 0 && pea, paso: n === 0 && pea });
  }
  const yTopCol = r3(c + m.alturaBaranda);
  return { ARR, niveles, yTopCol, alturaReal: yTopCol };
}

/**
 * Anillos intermedios: ninguna vertical queda más de 2,00 sin horizontales. Se ubican lo más alto posible
 * en la grilla de rosetas (c0 + 2,00, c0 + 4,00…).
 */
export function intermedios(c0: number, c1: number): number[] {
  const out: number[] = [];
  const paso = Math.floor((CRITERIOS.libreVerticalMax + EPS) / CRITERIOS.pasoRoseta) * CRITERIOS.pasoRoseta;
  for (let c = c0; c1 - c > CRITERIOS.libreVerticalMax + EPS; ) {
    c = r3(c + paso);
    out.push(c);
  }
  return out;
}

/** Cotas de anillo con intermedios para una lista ascendente de cotas (arranque incluido). */
export function conIntermedios(cotas: number[]): { cotas: number[]; intermedias: Set<number> } {
  const out: number[] = [];
  const inter = new Set<number>();
  for (let i = 0; i < cotas.length; i++) {
    out.push(cotas[i]);
    if (i < cotas.length - 1) for (const c of intermedios(cotas[i], cotas[i + 1])) {
      out.push(c);
      inter.add(c);
    }
  }
  return { cotas: out, intermedias: inter };
}

/**
 * Pila de verticales para una columna de largo L: verticales de 2,00, una de 3,00 al pie si sobra ≥ 1,00
 * y el suplemento (≤ 1,50) arriba. Opcional: escalonar empalmes ⚠.
 */
export function pilaVerticales(L: number, paridad = 0, escalonar = false): number[] {
  const seg: number[] = [];
  let resto = r3(L);
  if (escalonar) {
    if (paridad % 2 === 1 && resto >= 3 - EPS) {
      seg.push(1);
      resto = r3(resto - 1);
    }
    while (resto >= 2 - EPS) {
      seg.push(2);
      resto = r3(resto - 2);
    }
  } else {
    while (resto >= 2 - EPS) {
      seg.push(2);
      resto = r3(resto - 2);
    }
    if (seg.length && resto >= 1 - EPS) {
      seg[0] = 3;
      resto = r3(resto - 1);
    }
  }
  if (resto > 0.25) seg.push(Math.min(1.5, Math.round(resto * 2) / 2) || 0.5);
  return seg;
}
