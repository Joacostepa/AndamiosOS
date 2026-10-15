/**
 * Estructura en patio interno (pedido 7, foto 8): entre medianeras, anclada a los muros.
 * - 'pared': una tira contra el muro del fondo que va de medianera a medianera, anclada al fondo y a las dos
 *   medianeras en las puntas (lo de la foto 8).
 * - 'perimetral': la estructura recorre por dentro los muros elegidos del patio (grilla sobre el polígono,
 *   esquinas entrantes compartiendo verticales), anclada a cada muro.
 * Sin cara hacia la calle. Acceso por escalera interior con escotillas. Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla, V2 } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { cotasNiveles, grillaRect } from './comunes/grilla.ts';
import { ConstructorEsqueleto } from '../esqueleto/esqueleto.ts';
import { escaleraInterior } from './comunes/escalera-interior.ts';
import { rectangulo } from './comunes/poligono.ts';
import { puerto, type PuertoLocal } from './comunes/util-tipologias.ts';
import { anclarLinea, type AvisoGen, incorporar, rodapiesCortos, ksDe, medida, opcion, profundidadDe, tramosDe } from './nuevas-comunes.ts';
import { EPS, fmt, r3, sum } from '../util.ts';
import { rellenarLargo } from '../medida/rellenar.ts';

export interface ParamsPatio extends Record<string, unknown> {
  /** ancho del patio (de medianera a medianera) */
  ancho: number;
  /** largo del patio (del muro del fondo hacia adelante) */
  largo: number;
  altura: number;
  profundidad: number;
  /** separación de los muros */
  retiro: number;
  modo: 'pared' | 'perimetral';
  /** en 'perimetral': muros con andamio (0 fondo, 1 medianera derecha, 2 frente, 3 medianera izquierda) */
  muros: number[];
  modoPlataforma: 'cada_2m' | 'cada_nivel' | 'solo_trabajo';
  acceso: boolean;
}

const DEF: ParamsPatio = { ancho: 7.6, largo: 5, altura: 15, profundidad: 0.73, retiro: 0.2, modo: 'pared', muros: [0, 1, 3], modoPlataforma: 'cada_2m', acceso: true };

export function normalizarPatio(parcial: Partial<ParamsPatio>): { params: ParamsPatio; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const muros = Array.isArray(x.muros) ? [...new Set((x.muros as unknown[]).map(Number).filter((n) => [0, 1, 2, 3].includes(n)))].sort() : DEF.muros;
  const p: ParamsPatio = {
    ancho: medida(x.ancho, DEF.ancho, 1.5, 60),
    largo: medida(x.largo, DEF.largo, 1.5, 60),
    altura: medida(x.altura, DEF.altura, 2.5, 80),
    profundidad: medida(x.profundidad, DEF.profundidad, 0.5, 2),
    retiro: medida(x.retiro, DEF.retiro, 0.05, 1),
    modo: opcion(x.modo, ['pared', 'perimetral'] as const, 'pared'),
    muros: muros.length ? muros : [0],
    modoPlataforma: opcion(x.modoPlataforma, ['cada_2m', 'cada_nivel', 'solo_trabajo'] as const, 'cada_2m'),
    acceso: x.acceso === undefined ? true : !!x.acceso,
  };
  return { params: p, avisos: [] };
}

export function generarPatio(est: Estructura & { params: ParamsPatio }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const cn = cotasNiveles({ altura: p.altura, modo: p.modoPlataforma });
  const platsAnc = cn.plataformas.length ? cn.plataformas : [cn.cotas[cn.cotas.length - 1]];
  const prof = profundidadDe(p.profundidad, est.medida, m);
  const ocupa = 2 * (prof.medida + p.retiro);
  const puertos: PuertoLocal[] = [];
  let esq;
  let ml = 0;
  // el patio en local: fondo sobre t = 0 (s de 0 a ancho), el patio crece hacia +t
  if (p.modo === 'pared') {
    if (p.largo < prof.medida + p.retiro + 0.6 - EPS) avisos.push({ regla: 'patio.no_entra', nivel: 'error', estructuraId: est.id, texto: `El patio tiene ${fmt(p.largo)} de largo: no entra un andamio de ${fmt(prof.medida)} con paso.`, reparaciones: [] });
    const L = r3(p.ancho - 2 * p.retiro);
    let tramos = tramosDe(L, est.medida, m);
    // entre muros no se puede pasar: si el relleno de catálogo se pasa, la alternativa más larga que entra
    if (est.medida === 'catalogo' && sum(tramos.map((t) => t.medida)) > L + 0.005) {
      const alt = rellenarLargo(L, 'multi', { modo: 'catalogo', medidas: m }).alternativas.filter((a) => a.desvio <= 0.005 && a.desvio >= -0.3).sort((a, b) => b.desvio - a.desvio)[0];
      if (alt) {
        tramos = alt.vanos;
        reglas.push({ regla: 'patio.relleno', estructuraId: est.id, texto: `Entre medianeras usé ${alt.texto} (${alt.etiqueta.toLowerCase()}) para no pasarme de ${fmt(L)}.` });
      }
    }
    const total = r3(sum(tramos.map((t) => t.medida)));
    if (total > L + 0.005) avisos.push({ regla: 'patio.medianeras', nivel: 'error', estructuraId: est.id, texto: `Los vanos de catálogo (${fmt(total)}) no entran entre medianeras (${fmt(L)}).`, reparaciones: [{ etiqueta: 'Pasar a medida libre', accion: { tipo: 'medida', estructuraId: est.id, modo: 'libre' } }] });
    else if (L - total > 0.3 + EPS) avisos.push({ regla: 'patio.hueco', nivel: 'aviso', estructuraId: est.id, texto: `Quedan ${fmt(L - total)} sin andamio contra una medianera.`, reparaciones: [{ etiqueta: 'Cubrir exacto (medida libre)', accion: { tipo: 'medida', estructuraId: est.id, modo: 'libre' } }] });
    const g = grillaRect({ vanosS: tramos, profundidades: [prof], cotas: cn.cotas, plataformas: cn.plataformas, origen: [p.retiro, p.retiro], barandaEn: { interior: p.retiro > CRITERIOS.retiroLibre, exterior: true, laterales: false }, catalogo: cat, medidas: m });
    const b = g.b;
    const ksAnc = ksDe(b, platsAnc);
    // anclajes: al fondo (interior) al tresbolillo y a las dos medianeras en las puntas, en cada nivel con plataforma
    let n = anclarLinea(b, g.col.map((c) => c[0]), ksAnc, [0, -1], p.retiro);
    for (const [i, dir] of [[0, [-1, 0]], [g.S.length - 1, [1, 0]]] as const) {
      for (const j of [0, 1]) for (const k of ksAnc) {
        b.nodo(g.col[i][j], k, { anclaje: { retiro: p.retiro, dir: [dir[0], dir[1]] } });
        n++;
      }
    }
    // laterales contra las medianeras: si el retiro es grande, baranda
    if (p.retiro > CRITERIOS.retiroLibre) for (const k of ksDe(b, cn.plataformas)) for (const v of [g.vanosT[0][0], g.vanosT[g.S.length - 1][0]]) b.celda(v, k, { baranda: 2 });
    if (p.acceso) {
      const i = Math.max(0, tramos.findIndex((t) => Math.abs(t.medida - 2.5) < EPS));
      escaleraInterior(b.esq, g.panos[i][0]);
    }
    reglas.push({ regla: 'patio.anclajes', estructuraId: est.id, texto: `Tira de medianera a medianera (${fmt(total)}), ${n} anclajes al fondo y a las dos medianeras.` });
    esq = b.esq;
    ml = total;
    const X = g.S[g.S.length - 1];
    const T = g.T[1];
    puertos.push(puerto('frente', 'cara', 'Patio · cara al patio', [p.retiro, 0, T], [X, 0, T], [0, 0, 1], g.S.map((s) => r3(s - p.retiro)), cn.alturaReal));
  } else {
    if (Math.min(p.ancho, p.largo) < ocupa + 0.6 - EPS) avisos.push({ regla: 'patio.no_entra', nivel: 'error', estructuraId: est.id, texto: `El patio de ${fmt(p.ancho)} × ${fmt(p.largo)} es chico para andamio en dos muros enfrentados (${fmt(ocupa)} + paso).`, reparaciones: [{ etiqueta: 'Solo el fondo', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.modo', valor: 'pared' } }] });
    // muros: 0 fondo (z = 0), 1 medianera derecha (x = ancho), 2 frente (z = largo), 3 medianera izquierda (x = 0)
    const r = p.retiro;
    const w = prof.medida;
    const W = p.ancho;
    const Lp = p.largo;
    const tiene = (i: number) => p.muros.includes(i);
    const b = new ConstructorEsqueleto('multi', cn.cotas);
    const bar = { interior: r > CRITERIOS.retiroLibre, exterior: true, laterales: false };
    const tira = (prefijo: string, largoMedio: number, cuadroIni: boolean, cuadroFin: boolean) => {
      const vanos = [...(cuadroIni ? [{ medida: w, libre: prof.libre }] : []), ...tramosDe(largoMedio, 'libre', m), ...(cuadroFin ? [{ medida: w, libre: prof.libre }] : [])];
      const g = grillaRect({ vanosS: vanos, profundidades: [prof], cotas: cn.cotas, plataformas: cn.plataformas, barandaEn: bar, catalogo: cat, medidas: m, prefijo });
      anclarLinea(g.b, g.col.map((c) => c[0]), ksDe(g.b, platsAnc), [0, -1], r);
      return g;
    };
    const juntas: string[] = [];
    const extremosLibres: string[] = [];
    let n = 0;
    let ml0 = 0;
    const cuadroIzq = tiene(3);
    const cuadroDer = tiene(1);
    // fondo y frente: de medianera a medianera, con cuadro de esquina si hay lateral
    for (const [muro, z, sentido] of [[0, r, 1], [2, Lp - r, -1]] as const) {
      if (!tiene(muro)) continue;
      const g = tira(`m${muro}`, r3(W - 2 * r - (cuadroIzq ? w : 0) - (cuadroDer ? w : 0)), cuadroIzq, cuadroDer);
      const T = (q: V2): V2 => [r3(r + q[0]), r3(z + sentido * q[1])];
      const mapa = incorporar(b, g.esqueleto, T, (nv) => [nv[0], r3(sentido * nv[1])]);
      const nj = g.T.length - 1;
      if (cuadroIzq) juntas.push(mapa.vano.get(g.vanosS[nj][0])!);
      if (cuadroDer) juntas.push(mapa.vano.get(g.vanosS[nj][g.vanosS[nj].length - 1])!);
      if (!cuadroIzq) extremosLibres.push(mapa.vano.get(g.vanosT[0][0])!);
      if (!cuadroDer) extremosLibres.push(mapa.vano.get(g.vanosT[g.S.length - 1][0])!);
      n += g.col.length;
      ml0 += g.S[g.S.length - 1];
      puertos.push(puerto(`m${muro}`, 'cara', `Patio · ${muro === 0 ? 'fondo' : 'frente'}`, [r, 0, r3(z + sentido * w)], [r3(W - r), 0, r3(z + sentido * w)], [0, 0, sentido], g.S, cn.alturaReal));
    }
    // medianeras: entre la cara del fondo y la del frente (o los muros)
    const z0 = r3(r + (tiene(0) ? w : 0));
    const z1 = r3(Lp - r - (tiene(2) ? w : 0));
    for (const [muro, x, sentido] of [[1, W - r, -1], [3, r, 1]] as const) {
      if (!tiene(muro)) continue;
      const g = tira(`m${muro}`, r3(z1 - z0), false, false);
      const T = (q: V2): V2 => [r3(x + sentido * q[1]), r3(z0 + q[0])];
      const mapa = incorporar(b, g.esqueleto, T, (nv) => [r3(sentido * nv[1]), nv[0]]);
      if (!tiene(0)) extremosLibres.push(mapa.vano.get(g.vanosT[0][0])!);
      if (!tiene(2)) extremosLibres.push(mapa.vano.get(g.vanosT[g.S.length - 1][0])!);
      ml0 += g.S[g.S.length - 1];
      puertos.push(puerto(`m${muro}`, 'cara', `Patio · medianera ${muro === 1 ? 'derecha' : 'izquierda'}`, [r3(x + sentido * w), 0, z0], [r3(x + sentido * w), 0, z1], [sentido, 0, 0], g.S, cn.alturaReal));
    }
    // en las esquinas se pasa de una tira a la otra: sin baranda en la junta
    for (const v of juntas) for (let k = 0; k < b.esq.cotas.length; k++) if (b.esq.celdas[`${v}@${k}`]) b.esq.celdas[`${v}@${k}`] = { ...b.esq.celdas[`${v}@${k}`], baranda: 0, rodapie: false };
    // las puntas sin tira vecina quedan contra un muro: baranda solo si el retiro es grande
    if (r > CRITERIOS.retiroLibre) for (const v of extremosLibres) for (const k of ksDe(b, cn.plataformas)) b.celda(v, k, { baranda: 2 });
    if (p.acceso) {
      const pano = b.esq.panos.find((x) => {
        const vs = x.vanos.map((id) => b.esq.vanos.find((v) => v.id === id)!);
        return vs.some((v) => Math.abs(v.medida - 2.5) < EPS);
      }) || b.esq.panos[0];
      if (pano) escaleraInterior(b.esq, pano.id);
    }
    reglas.push({ regla: 'patio.anclajes', estructuraId: est.id, texto: `Patio perimetral sobre ${p.muros.length} muro${p.muros.length > 1 ? 's' : ''} con cuadros de esquina y verticales compartidas; anclado a cada muro (${n} columnas en fondo y frente).` });
    rodapiesCortos(b.esq);
    esq = b.esq;
    ml = r3(ml0);
  }
  return {
    esqueleto: esq, avisos, reglas,
    metricas: { m2: r3(ml * cn.alturaReal), ml, alturaReal: cn.alturaReal, huella: rectangulo(0, 0, p.ancho, p.largo) },
    puertos,
    info: { modo: p.modo, patio: { ancho: p.ancho, largo: p.largo } },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.ancho', etiqueta: 'Ancho del patio (entre medianeras)', tipo: 'medida', unidad: 'm', min: 1.5, max: 60, grupo: 'Medidas' },
  { ruta: 'params.largo', etiqueta: 'Largo del patio', tipo: 'medida', unidad: 'm', min: 1.5, max: 60, grupo: 'Medidas' },
  { ruta: 'params.altura', etiqueta: 'Altura', tipo: 'medida', unidad: 'm', min: 2.5, max: 80, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.retiro', etiqueta: 'Separación a los muros', tipo: 'medida', unidad: 'm', min: 0.05, max: 1, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.modo', etiqueta: 'Armado', tipo: 'opcion', opciones: [{ valor: 'pared', etiqueta: 'Contra el fondo, de medianera a medianera' }, { valor: 'perimetral', etiqueta: 'Por dentro de varios muros' }], grupo: 'Medidas' },
  { ruta: 'params.muros', etiqueta: 'Muros con andamio', tipo: 'lista_medidas', grupo: 'Medidas', visibleSi: { ruta: 'params.modo', igual: 'perimetral' }, ayuda: '0 fondo · 1 medianera derecha · 2 frente · 3 medianera izquierda' },
  { ruta: 'params.acceso', etiqueta: 'Escalera interior', tipo: 'bool', grupo: 'Accesos' },
];

const PRESETS: Preset[] = [
  { id: 'patio_medianeras', nombre: 'Patio entre medianeras', icono: 'patio', descripcion: 'Andamio contra el fondo de un patio interno, de medianera a medianera, anclado a los tres muros.', params: {} },
  { id: 'patio_perimetral', nombre: 'Patio perimetral', icono: 'patio', descripcion: 'Andamio por dentro del fondo y las dos medianeras de un patio, con escalera interior.', params: { modo: 'perimetral', ancho: 6.7, largo: 6.7, altura: 12, muros: [0, 1, 3] } },
];

export const PATIO_INTERNO: Tipologia<ParamsPatio> = {
  id: 'patio_interno',
  version: 1,
  nombre: 'Patio interno',
  descripcion: 'Estructura en un patio entre medianeras, anclada a los muros, con acceso por escalera interior.',
  categoria: 'especial',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarPatio,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarPatio,
};
