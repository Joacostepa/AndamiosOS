/**
 * Frentes de una fachada (port de resolverFachada de la maqueta): vanos por relleno, esquinas a 90°
 * (convexa con vertical compartida o vano de giro, entrante con cuadro) y niveles. Todo en coordenadas
 * LOCALES de la estructura (el primer frente arranca en (0, 0) con rumbo 0).
 */
import type { ModoMedida, Poligono, Relleno, Sistema, TramoVano, V2 } from '../../tipos.ts';
import type { MedidasCatalogo } from '../../catalogo/catalogo.ts';
import { rellenarLargo, textoVanos } from '../../medida/rellenar.ts';
import { arrDesde, type Nivel, nivelesBastidor, nivelesMulti, nivelesPantalla, type ModoPlataforma } from '../../medida/alturas.ts';
import { EPS, fmt, LETRAS, marco, type Marco, masCercano, r3, sum } from '../../util.ts';

export interface FrenteParam {
  largo: number;
  angulo?: number;
  altura?: number;
  vanos?: number[];
}

export interface ParamsFrentes {
  frentes: FrenteParam[];
  altura: number;
  profundidad: number;
  niveles: 'arriba' | 'pantalla';
  modoPlataforma: ModoPlataforma;
  bandejaPB: boolean;
  viaPublica: boolean;
  esquinas: ('vertical_compartida' | 'vano_giro')[];
  ajuste: 'final' | 'centrado';
}

export interface Frente {
  f: number;
  etiqueta: string;
  largo: number;
  largoEf: number;
  sIni: number;
  /** medidas de los vanos (incluye los cuadros de esquina) */
  vanos: number[];
  /** true si el vano es un tramo libre (caño y grampa) */
  libres: boolean[];
  S: number[];
  relleno: Relleno & { elegido?: boolean };
  texto: string;
  vanoEsquina: number;
  vanoEsquinaFin: number;
  angulo: number;
  modoEsquina: 'vertical_compartida' | 'vano_giro' | null;
  rumbo: number;
  origen: V2;
  mk: Marco;
  altura: number;
  ARR: number;
  niveles: Nivel[];
  yTopCol: number;
  alturaReal: number;
}

export interface FrentesResueltos {
  prof: number;
  frentes: Frente[];
  alturaReal: number;
  ARR: number;
  huellas: Poligono[];
}

/** Separación del primer bastidor del frente B en una esquina convexa (port). */
export function sepEsquinaBastidor(w: number): number {
  const L = [0.73, 1.09, 1.25, 1.5, 2.0, 2.5].find((x) => x - w >= 0.18 - EPS) ?? w + 0.2;
  return r3(L - w);
}

export function profundidadEfectiva(p: { profundidad: number }, sistema: Sistema, modo: ModoMedida, m: MedidasCatalogo): { prof: number; libre: boolean } {
  if (sistema === 'bastidor') return { prof: masCercano(m.bastidor.anchos, p.profundidad), libre: false };
  if (modo === 'libre') {
    const cat = m.multi.profundidades.some((x) => Math.abs(x - p.profundidad) < 0.0015);
    return { prof: r3(Math.max(0.3, p.profundidad)), libre: !cat };
  }
  return { prof: masCercano(m.multi.profundidades, p.profundidad), libre: false };
}

export function resolverFrentes(
  p: ParamsFrentes,
  sistema: Sistema,
  modo: ModoMedida,
  m: MedidasCatalogo,
  o: { soporteTop?: number | null } = {},
): FrentesResueltos {
  const bast = sistema === 'bastidor';
  const { prof } = profundidadEfectiva(p, sistema, modo, m);
  const soporteTop = o.soporteTop ?? null;
  let nivGen: (H: number) => { ARR: number; niveles: Nivel[]; yTopCol: number; alturaReal: number };
  if (bast) nivGen = (H) => nivelesBastidor(H, !!p.bandejaPB && soporteTop === null, m.bastidor);
  else if (p.niveles === 'pantalla') nivGen = (H) => nivelesPantalla(H);
  else {
    const ARR = soporteTop !== null ? arrDesde(soporteTop) : arrDesde(p.altura - 1);
    nivGen = (H) => nivelesMulti(H, ARR, { modoPlataforma: p.modoPlataforma, bandejaPB: p.bandejaPB && soporteTop === null, viaPublica: p.viaPublica && soporteTop === null });
  }
  const frentes: Frente[] = [];
  let P: V2 = [0, 0];
  let rumbo = 0;
  const nF = p.frentes.length;
  for (let f = 0; f < nF; f++) {
    const fr = p.frentes[f];
    const ang = f === 0 ? 0 : (fr.angulo ?? 90);
    if (f > 0) rumbo -= ang;
    const modoEsq = f > 0 ? p.esquinas[f - 1] || 'vertical_compartida' : null;
    let sIni = 0;
    if (f > 0 && ang > 0 && !bast && modoEsq === 'vertical_compartida') sIni = -prof;
    if (f > 0 && ang > 0 && bast) sIni = sepEsquinaBastidor(prof);
    if (f > 0 && ang < 0) sIni = prof;
    const largo = Math.max(0.5, +fr.largo || 0);
    const largoEf = r3(largo - sIni);
    const vanoEsq = sIni < 0 ? r3(-sIni) : 0;
    const vanoFin = !bast && f < nF - 1 && (p.frentes[f + 1].angulo ?? 90) < 0 ? prof : 0;
    const largoRell = r3(largoEf - vanoEsq - vanoFin);
    let vanosUsr = fr.vanos && fr.vanos.length ? [...fr.vanos] : null;
    if (vanosUsr && (vanoEsq || vanoFin) && Math.abs(sum(vanosUsr) - largoEf) < 0.3) {
      if (vanoEsq && Math.abs(vanosUsr[0] - vanoEsq) < EPS) vanosUsr = vanosUsr.slice(1);
      if (vanoFin && Math.abs(vanosUsr[vanosUsr.length - 1] - vanoFin) < EPS) vanosUsr = vanosUsr.slice(0, -1);
    }
    let relleno: Relleno & { elegido?: boolean };
    const modoRell: ModoMedida = bast ? 'catalogo' : modo;
    if (vanosUsr && vanosUsr.length && Math.abs(sum(vanosUsr) - largoRell) < 0.3) {
      const lista = bast ? m.bastidor.vanos : m.multi.vanos;
      const tramos: TramoVano[] = vanosUsr.map((medida) => ({ medida, libre: !lista.some((x) => Math.abs(x - medida) < 0.0015) }));
      relleno = { ...rellenarLargo(largoRell, sistema, { ajuste: p.ajuste, modo: modoRell, medidas: m }), vanos: tramos, elegido: true };
      relleno.total = r3(sum(vanosUsr));
      relleno.desvio = r3(sum(vanosUsr) - largoRell);
      relleno.texto = `${fmt(largoRell)} → ${textoVanos(vanosUsr)}`;
    } else relleno = rellenarLargo(largoRell, sistema, { ajuste: p.ajuste, modo: modoRell, medidas: m });
    const vanos = [...(vanoEsq ? [vanoEsq] : []), ...relleno.vanos.map((t) => t.medida), ...(vanoFin ? [vanoFin] : [])];
    const libres = [...(vanoEsq ? [false] : []), ...relleno.vanos.map((t) => t.libre), ...(vanoFin ? [false] : [])];
    const S = [sIni];
    for (const v of vanos) S.push(r3(S[S.length - 1] + v));
    const H = fr.altura ?? p.altura;
    const nv = nivGen(H);
    const mk = marco(P, rumbo);
    frentes.push({
      f, etiqueta: `Frente ${LETRAS[f]}`, largo, largoEf, sIni, vanos, libres, S, relleno,
      texto: relleno.texto + (sIni < 0 ? ` + cuadro de esquina ${fmt(-sIni)}` : sIni > 0 ? ` (descuenta ${fmt(sIni)} de esquina)` : '') + (vanoFin ? ` + cuadro de esquina entrante ${fmt(vanoFin)}` : ''),
      vanoEsquina: vanoEsq, vanoEsquinaFin: vanoFin, angulo: ang, modoEsquina: modoEsq, rumbo, origen: [...P] as V2, mk,
      altura: H, ARR: nv.ARR, niveles: nv.niveles, yTopCol: nv.yTopCol, alturaReal: nv.alturaReal,
    });
    const fin = mk.W(S[S.length - 1], 0, 0);
    P = [fin[0], fin[2]];
  }
  const huellas: Poligono[] = frentes.map((F) => {
    const s0 = F.S[0];
    const s1 = F.S[F.S.length - 1];
    return [F.mk.W(s0, 0, 0), F.mk.W(s1, 0, 0), F.mk.W(s1, 0, prof), F.mk.W(s0, 0, prof)].map((q) => [q[0], q[2]] as V2);
  });
  return { prof, frentes, alturaReal: Math.max(...frentes.map((x) => x.alturaReal)), ARR: frentes[0]?.ARR ?? 0.25, huellas };
}
