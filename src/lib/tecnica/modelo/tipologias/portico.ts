/**
 * Pórticos (port de resolverPortico/construirPortico): peatonal (bastidor de paso o multidireccional) y
 * vehicular (dos torres + vigas de celosía). Puede ser la base de una fachada (unión «apoyo»).
 */
import type { Aviso, Estructura, Regla, Sistema, V2 } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { ConstructorEsqueleto } from '../esqueleto/esqueleto.ts';
import { conIntermedios, type Nivel } from '../medida/alturas.ts';
import { rellenarLargo } from '../medida/rellenar.ts';
import { bandaConDiagonal, celdaDiagonal, sentidoZigzag, vanosArriostrados } from '../reglas/diagonales.ts';
import { tiraBastidor } from './comunes/tira-bastidor.ts';
import { avisoEsbeltez, elegirViga, primViga, puertosCaja } from './comunes/util-tipologias.ts';
import { clamp, EPS, fmt, marco, masCercano, num, r3 } from '../util.ts';

export interface ParamsPortico extends Record<string, unknown> {
  clase: 'peatonal' | 'vehicular';
  largo: number;
  alturaLibre: number;
  ancho: number;
  luz: number;
  galibo: number;
  profundidad: number;
  anchoTorre: number;
  estructuraArriba: boolean;
  anclado: boolean;
  ajuste: 'final' | 'centrado';
  terreno: 'cemento' | 'tierra' | 'losa';
  pataDeGallo: boolean;
}

const DEF: ParamsPortico = { clase: 'peatonal', largo: 10, alturaLibre: 2.5, ancho: 1.3, luz: 6, galibo: 4.5, profundidad: 1.09, anchoTorre: 1.09, estructuraArriba: false, anclado: true, ajuste: 'final', terreno: 'cemento', pataDeGallo: false };

export function normalizarPortico(parcial: Partial<ParamsPortico>): { params: ParamsPortico; avisos: string[] } {
  const p = { ...structuredClone(DEF), ...structuredClone(parcial || {}) } as ParamsPortico;
  if (p.clase !== 'vehicular') p.clase = 'peatonal';
  p.largo = clamp(num(p.largo, 10), 0.5, 200);
  p.alturaLibre = clamp(num(p.alturaLibre, 2.5), 1.5, 6);
  p.ancho = clamp(num(p.ancho, 1.3), 0.5, 3);
  p.luz = clamp(num(p.luz, 6), 1, 20);
  p.galibo = clamp(num(p.galibo, 4.5), 2, 8);
  p.profundidad = clamp(num(p.profundidad, 1.09), 0.5, 3);
  p.anchoTorre = clamp(num(p.anchoTorre, 1.09), 0.5, 3);
  for (const k of ['estructuraArriba', 'anclado', 'pataDeGallo'] as const) p[k] = !!p[k];
  return { params: p, avisos: [] };
}

export function generarPortico(est: Estructura & { params: ParamsPortico }, ctx: CtxGenerar): Generado {
  return est.params.clase === 'vehicular' ? vehicular(est, ctx) : peatonal(est, ctx);
}

function peatonal(est: Estructura & { params: ParamsPortico }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const bast = est.sistema === 'bastidor';
  const arriba = p.estructuraArriba || ctx.relaciones.conArriba;
  const ARR = 0.25;
  const prof = bast ? masCercano(m.bastidor.anchos, p.ancho) : masCercano([0.73, 1.09, 1.25, 1.5, 2.5], p.ancho);
  const relleno = rellenarLargo(p.largo, bast ? 'bastidor' : 'multi', { ajuste: p.ajuste, modo: bast ? 'catalogo' : est.medida, medidas: m });
  const vanos = relleno.vanos.map((t) => t.medida);
  const libres = relleno.vanos.map((t) => t.libre);
  const S = [0];
  for (const v of vanos) S.push(r3(S[S.length - 1] + v));
  const L = S[S.length - 1];
  const yT = bast ? r3(ARR + m.bastidor.alturaPaso) : r3(ARR + 0.5 * Math.ceil((Math.max(p.alturaLibre, 0) + 0.05 - ARR) / 0.5 - EPS));
  const yTopCol = r3(arriba ? yT : yT + 1);
  const mk = marco([0, 0], 0);
  const W = mk.W;
  const avisos: Omit<Aviso, 'id'>[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const nivel: Nivel = { n: 0, cota: yT, alto: r3(yT - ARR), plataforma: true, bandeja: true, paso: true, tope: true };
  let b: ConstructorEsqueleto;
  if (bast) {
    b = new ConstructorEsqueleto('bastidor', [ARR, yT]);
    tiraBastidor(b, { prefijo: 'p', mk, S, vanos, w: prof, niveles: [nivel], ARR, yTopCol, viaPublica: true, barandaTope: !arriba, barandas: !arriba, retiro: 0, laterales: [true, true] });
  } else {
    const { cotas } = conIntermedios([ARR, yT]);
    b = new ConstructorEsqueleto('multi', cotas);
    b.esq.terreno = p.terreno;
    const kT = b.k(yT);
    const col: string[][] = [];
    for (let i = 0; i <= vanos.length; i++) {
      col[i] = [0, prof].map((t, side) => {
        const id = b.columna(`pc${i}${side ? 'e' : 'i'}`, [S[i], t], ARR, yTopCol, 'base_regulable');
        b.elemento({ id: `recub:${id}`, familia: 'recubrimiento', medidas: { largo: 2.0 }, a: W(S[i], ARR, t), b: W(S[i], Math.min(2, yTopCol), t), grupo: 'via_publica', sistema: 'comun' });
        if (side === 1) b.elemento({ id: `esf:${id}`, familia: 'esfera', medidas: {}, a: W(S[i], 1, t), b: W(S[i], 1, t), grupo: 'via_publica', sistema: 'comun' });
        return id;
      });
    }
    const vInt: string[] = [];
    const vExt: string[] = [];
    const vTr: string[] = [];
    for (let v = 0; v < vanos.length; v++) {
      vInt[v] = b.vano(`pi${v}`, col[v][0], col[v + 1][0], 'interior', { libre: libres[v], normal: [0, -1] });
      vExt[v] = b.vano(`pe${v}`, col[v][1], col[v + 1][1], 'exterior', { libre: libres[v], normal: [0, 1] });
    }
    const transv = prof <= 1.25 + EPS;
    for (let i = 0; i <= vanos.length; i++) {
      vTr[i] = b.vano(`pt${i}`, col[i][0], col[i][1], 'transversal', { normal: i === 0 ? [-1, 0] : [1, 0] });
      // el paso queda libre: sin travesaños abajo; arriba horizontal o viga puente
      b.esq.cotas.forEach((c, k) => { if (c < yT - EPS) b.celda(vTr[i], k, { horizontal: false }); });
      if (!transv) {
        b.celda(vTr[i], kT, { horizontal: false });
        const a = W(S[i], yT, 0);
        const bb = W(S[i], yT, prof);
        b.elemento({ id: `tr${i}`, familia: 'viga_puente', medidas: { largo: prof <= 1.5 + EPS ? 1.5 : 2.5 }, a, b: bb, primitivas: primViga(a, bb, 0.3), grupo: 'portico' });
      }
    }
    for (let v = 0; v < vanos.length; v++) {
      const pano = b.pano(`pp${v}`, [vInt[v], vTr[v + 1], vExt[v], vTr[v]], { sentido: vExt[v], libre: libres[v] });
      b.celdaPano(pano, kT, { plataforma: 'tablones', fenolico: true });
      if (!arriba) b.celda(vExt[v], kT, { baranda: 2 });
    }
    if (!arriba) {
      b.celda(vTr[0], kT, { baranda: 2 });
      b.celda(vTr[vanos.length], kT, { baranda: 2 });
    }
    // diagonales en las dos caras de los vanos arriostrados, roseta a roseta
    vanosArriostrados(vanos.length).forEach((v, fase) => {
      for (const id of [vInt[v], vExt[v]]) {
        let orden = 0;
        for (let k = 1; k < cotas.length; k++) if (bandaConDiagonal(cotas[k] - cotas[k - 1])) b.celda(id, k, celdaDiagonal(ctx.catalogo, cotas[k] - cotas[k - 1], vanos[v], sentidoZigzag(orden++, fase)));
      }
    });
  }
  const libre = bast ? m.bastidor.alturaPaso : r3(yT - 0.05);
  const paso = r3(prof - 0.05);
  if (p.alturaLibre < CRITERIOS.galiboPeatonal - EPS || libre < CRITERIOS.galiboPeatonal - 0.06) avisos.push({ regla: 'via.galibo', nivel: 'error', estructuraId: est.id, texto: `Altura libre ${fmt(Math.min(p.alturaLibre, libre))} m: el paso peatonal pide ≥ 2,50.`, reparaciones: [{ etiqueta: 'Subir a 2,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.alturaLibre', valor: 2.5 } }] });
  if (paso < CRITERIOS.pasoPeatonal - EPS) avisos.push({ regla: 'via.paso', nivel: 'error', estructuraId: est.id, texto: `Paso libre ${fmt(paso)} m: se pide ≥ 1,20.`, reparaciones: [{ etiqueta: bast ? 'Bastidor de 1,30' : 'Ancho 1,25', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.ancho', valor: bast ? 1.3 : 1.25 } }] });
  if (Math.abs(relleno.desvio) > CRITERIOS.toleranciaRelleno + EPS) avisos.push({ regla: 'medida.desvio', nivel: 'aviso', estructuraId: est.id, texto: `Pórtico: ${relleno.texto} (${relleno.desvio > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(relleno.desvio))} m).`, reparaciones: est.medida === 'catalogo' && !bast ? [{ etiqueta: 'Pasar a medida libre', accion: { tipo: 'medida', estructuraId: est.id, modo: 'libre' } }] : [] });
  reglas.push({ regla: 'portico.peatonal', estructuraId: est.id, texto: `Pórtico peatonal: ${fmt(libre)} libres, paso ${fmt(paso)}, bandeja de fenólico, esferas y recubrimiento hasta 2 m.` });
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: 0, ml: L, alturaReal: yTopCol, huella: [[0, 0], [L, 0], [L, prof], [0, prof]] },
    puertos: puertosCaja('Pórtico', S, L, prof, yTopCol, yT),
    info: { clase: 'peatonal', prof, yTope: yT, galibo: yT, tieneArriba: arriba, frentes: [{ f: 0, etiqueta: 'Pórtico', largo: p.largo, vanos, S, relleno, texto: relleno.texto, niveles: [nivel], ARR, yTopCol, alturaReal: yTopCol }] },
  };
}

function vehicular(est: Estructura & { params: ParamsPortico }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const arriba = p.estructuraArriba || ctx.relaciones.conArriba;
  const ARR = 0.25;
  const prof = p.profundidad;
  const wT = p.anchoTorre;
  const viga = elegirViga(p.luz, m.multi.vigasCelosia);
  const S = [0, wT, r3(wT + viga.largo), r3(2 * wT + viga.largo)];
  const yG = r3(ARR + 0.5 * Math.ceil((p.galibo - ARR) / 0.5 - EPS));
  const yT = r3(yG + 0.5);
  const niveles: Nivel[] = [];
  for (let c = r3(yG - 2); c >= ARR + 1.5 - EPS; c = r3(c - 2)) niveles.unshift({ n: 0, cota: c, plataforma: false, bandeja: false });
  niveles.push({ n: 0, cota: yG, plataforma: false, bandeja: false });
  niveles.push({ n: 0, cota: yT, plataforma: true, bandeja: false, tope: true });
  niveles.forEach((x, i) => { x.n = i; });
  const yTopCol = r3(arriba ? yT : yT + 1);
  const { cotas } = conIntermedios([ARR, ...niveles.map((x) => x.cota)]);
  const b = new ConstructorEsqueleto('multi', cotas);
  b.esq.terreno = p.terreno;
  const W = marco([0, 0], 0).W;
  const avisos: Omit<Aviso, 'id'>[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const el = b.elemento.bind(b);
  let nAnc = 0;
  const cotasAnc = niveles.map((x) => x.cota).filter((_, i, arr) => (arr.length - 1 - i) % 2 === 0);
  for (const [i0, i1, lado] of [[0, 1, 'I'], [2, 3, 'D']] as const) {
    const sA = S[i0];
    const sB = S[i1];
    const pts: V2[] = [[sA, 0], [sB, 0], [sB, prof], [sA, prof]];
    const cols = pts.map((q, k) => b.columna(`v${lado}c${k}`, q, ARR, yTopCol, 'base_regulable'));
    for (const [k, q] of pts.entries()) {
      b.elemento({ id: `recub:v${lado}c${k}`, familia: 'recubrimiento', medidas: { largo: 2.0 }, a: W(q[0], ARR, q[1]), b: W(q[0], 2, q[1]), grupo: 'via_publica', sistema: 'comun' });
      if (q[1] === 0) b.elemento({ id: `esf:v${lado}c${k}`, familia: 'esfera', medidas: {}, a: W(q[0], 1, q[1]), b: W(q[0], 1, q[1]), grupo: 'via_publica', sistema: 'comun' });
    }
    const caras: [number, number, V2][] = [[0, 1, [0, -1]], [1, 2, [1, 0]], [2, 3, [0, 1]], [3, 0, [-1, 0]]];
    const vid = caras.map(([a, c, n], k) => b.vano(`v${lado}${k}`, cols[a], cols[c], 'exterior', { normal: n }));
    b.pano(`v${lado}p`, vid, { sentido: vid[0] });
    vid.forEach((id, fase) => {
      let orden = 0;
      for (let k = 1; k < cotas.length; k++) if (bandaConDiagonal(cotas[k] - cotas[k - 1])) b.celda(id, k, celdaDiagonal(ctx.catalogo, cotas[k] - cotas[k - 1], fase % 2 ? prof : sB - sA, sentidoZigzag(orden++, fase)));
    });
    el({ id: `dpl${lado}`, familia: 'diagonal_planta', medidas: { variante: 'celosia' }, a: W(sA, ARR, 0), b: W(sB, ARR, prof), grupo: 'portico' });
    if (p.anclado) for (const s of [sA, sB]) {
      const c0 = cols[s === sA ? 0 : 1];
      for (const c of cotasAnc) {
        b.nodo(c0, b.k(c), { anclaje: { retiro: 0.2, dir: [0, -1] } });
        nAnc++;
      }
    }
  }
  // vigas de celosía (cordón inferior en el gálibo, superior en el tope)
  for (const [t, lado] of [[0, 'i'], [prof, 'e']] as const) {
    const a = W(S[1], yT, t);
    const c = W(S[2], yT, t);
    el({ id: `viga${lado}`, familia: 'viga_celosia', medidas: { largo: viga.largo }, a, b: c, primitivas: primViga(a, c, 0.5), grupo: 'viga' });
  }
  // travesaños sobre las vigas en módulos de catálogo (≤ 2,50): tablones entre travesaños y fenólico encima
  const segs = rellenarLargo(viga.largo, 'multi', { medidas: m }).vanos.map((t) => t.medida);
  const Sx = [S[1]];
  for (const v of segs) Sx.push(r3(Math.min(S[2], Sx[Sx.length - 1] + v)));
  Sx[Sx.length - 1] = S[2];
  const ntv = Math.max(1, Math.round(prof / CRITERIOS.anchoTablon));
  Sx.forEach((s, k) => {
    el({ id: `trv${k}`, familia: 'horizontal', medidas: { largo: prof }, a: W(s, yT, 0), b: W(s, yT, prof), grupo: 'tablero' });
    if (k === Sx.length - 1) return;
    const s2 = Sx[k + 1];
    el({ id: `dplv${k}`, familia: 'diagonal_planta', medidas: { variante: 'celosia' }, a: W(s, yT, k % 2 ? prof : 0), b: W(s2, yT, k % 2 ? 0 : prof), grupo: 'tablero' });
    for (let j = 0; j < ntv; j++) el({ id: `tabv${k}_${j}`, familia: 'tablon', medidas: { largo: segs[k] }, a: W(s, yT, r3(((j + 0.5) * prof) / ntv)), b: W(s2, yT, r3(((j + 0.5) * prof) / ntv)), grupo: 'tablero' });
  });
  el({ id: 'fen', familia: 'fenolico', medidas: { ancho: prof }, a: W(S[1], yT + 0.04, 0), b: W(S[2], yT + 0.04, prof), medida: r3(viga.largo * prof), grupo: 'tablero', sistema: 'comun' });
  if (!arriba) {
    for (const [t, lado] of [[0, 'i'], [prof, 'e']] as const) {
      Sx.forEach((s, k) => {
        if (k > 0 && k < Sx.length - 1) el({ id: `mv${lado}${k}`, familia: 'vertical', medidas: { largo: 1.0, variante: 'SE' }, a: W(s, yT, t), b: W(s, yT + 1, t), grupo: 'tablero' });
        if (k === Sx.length - 1) return;
        for (const dy of [0.5, 1]) el({ id: `bv${lado}${k}_${dy * 10}`, familia: 'baranda', medidas: { largo: segs[k] }, a: W(s, yT + dy, t), b: W(Sx[k + 1], yT + dy, t), grupo: 'tablero' });
        el({ id: `rv${lado}${k}`, familia: 'rodapie', medidas: { largo: segs[k] }, a: W(s, yT + 0.08, t), b: W(Sx[k + 1], yT + 0.08, t), grupo: 'tablero' });
      });
    }
    for (const [s, lado] of [[S[1], 'I'], [S[2], 'D']] as const) {
      for (const dy of [0.5, 1]) el({ id: `bl${lado}${dy * 10}`, familia: 'baranda', medidas: { largo: prof }, a: W(s, yT + dy, 0), b: W(s, yT + dy, prof), grupo: 'tablero' });
      el({ id: `rl${lado}`, familia: 'rodapie', medidas: { largo: prof }, a: W(s, yT + 0.08, 0), b: W(s, yT + 0.08, prof), grupo: 'tablero' });
    }
  }
  for (const [s, lado] of [[S[1], 'I'], [S[2], 'D']] as const) el({ id: `def${lado}`, familia: 'defensa', medidas: {}, a: W(s, 0, prof / 2), b: W(s, 0.8, prof / 2), grupo: 'via_publica', sistema: 'comun' });
  avisos.push({ regla: 'via.defensas', nivel: 'aviso', estructuraId: est.id, texto: 'Pórtico vehicular: defensas contra impacto (New Jersey o topes) en las patas del lado de la calzada y señal de gálibo ⚠.', reparaciones: [] });
  if (p.anclado) reglas.push({ regla: 'portico.anclado', estructuraId: est.id, texto: `Pórtico vehicular anclado: ${nAnc} anclajes en las verticales interiores de las torres.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclado', valor: false } });
  if (viga.excede) avisos.push({ regla: 'portico.luz', nivel: 'error', estructuraId: est.id, texto: `Luz ${fmt(p.luz)} m: la viga de celosía más larga es de ${fmt(Math.max(...m.multi.vigasCelosia))}.`, reparaciones: [{ etiqueta: `Luz ${fmt(Math.max(...m.multi.vigasCelosia))}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.luz', valor: Math.max(...m.multi.vigasCelosia) } }] });
  else if (Math.abs(viga.largo - p.luz) > 0.05) avisos.push({ regla: 'portico.luz', nivel: 'info', estructuraId: est.id, texto: `Luz ${fmt(p.luz)} → viga de celosía de ${fmt(viga.largo)} entre torres.`, reparaciones: [] });
  if (p.galibo < CRITERIOS.galiboVehicular - EPS) avisos.push({ regla: 'via.galibo_vehicular', nivel: 'aviso', estructuraId: est.id, texto: `Gálibo ${fmt(p.galibo)} m: para camiones se pide ≥ 4,50.`, reparaciones: [{ etiqueta: 'Subir a 4,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.galibo', valor: 4.5 } }] });
  reglas.push({ regla: 'portico.vehicular', estructuraId: est.id, texto: `Pórtico vehicular: gálibo libre ${fmt(yG)} m, 2 vigas de celosía de ${fmt(viga.largo)}, diagonal en planta y torres de apoyo de ${fmt(S[1])} × ${fmt(prof)}.` });
  if (!p.anclado && !ctx.relaciones.unidaA.length) {
    const Bef = Math.min(S[1], prof) + (p.pataDeGallo ? 3 : 0);
    if (yTopCol / Bef > CRITERIOS.hbMax) avisos.push(avisoEsbeltez(est, yTopCol, Bef, 'params.anclado', { etiqueta: 'Torres de 2,50', ruta: 'params.anchoTorre', valor: 2.5 }));
  }
  if (p.pataDeGallo) reglas.push({ regla: 'portico.pata', estructuraId: est.id, texto: 'Pata de gallo: no aplica en pórticos (sumá anclaje).' });
  const L = S[3];
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: 0, ml: L, alturaReal: yTopCol, huella: [[0, 0], [L, 0], [L, prof], [0, prof]] },
    puertos: puertosCaja('Pórtico vehicular', S, L, prof, yTopCol, yT),
    info: { clase: 'vehicular', prof, yTope: yT, galibo: yG, viga: { largo: viga.largo, excede: viga.excede }, tieneArriba: arriba, frentes: [{ f: 0, etiqueta: 'Pórtico vehicular', largo: L, vanos: [wT, viga.largo, wT], S, niveles, ARR, yTopCol, alturaReal: yTopCol, texto: `luz ${fmt(p.luz)} → viga de ${fmt(viga.largo)}` }] },
  };
}

export function cambiarSistemaPortico(params: ParamsPortico, _de: Sistema, a: Sistema): { params: ParamsPortico; avisos: string[]; rechazado?: boolean } {
  const p = structuredClone(params);
  const avisos: string[] = [];
  if (p.clase === 'vehicular' && a === 'bastidor') return { params: p, avisos: ['El pórtico vehicular solo se arma en multidireccional (vigas de celosía).'], rechazado: true };
  if (a === 'bastidor') {
    p.ancho = masCercano([1.3, 0.9], p.ancho);
    if (p.alturaLibre > 2.5 + EPS) avisos.push(`El bastidor de paso da 2,50 libres (pedías ${fmt(p.alturaLibre)}).`);
    p.alturaLibre = 2.5;
  } else {
    p.ancho = masCercano([1.25, 1.5, 2.5], p.ancho);
    avisos.push(`Pórtico en multidireccional: paso de ${fmt(p.ancho)} con ${p.ancho > 1.25 ? 'viga puente' : 'horizontales'}.`);
  }
  const r = rellenarLargo(p.largo, a);
  if (Math.abs(r.desvio) > 0.005) avisos.push(`Largo: ${r.texto} (${r.desvio > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(r.desvio))} m).`);
  return { params: p, avisos };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', min: 0.5, max: 200, grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'peatonal' } },
  { ruta: 'params.alturaLibre', etiqueta: 'Altura libre', tipo: 'medida', unidad: 'm', min: 1.5, max: 6, paso: 0.05, grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'peatonal' } },
  { ruta: 'params.ancho', etiqueta: 'Ancho de paso', tipo: 'medida', unidad: 'm', grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'peatonal' } },
  { ruta: 'params.luz', etiqueta: 'Luz', tipo: 'medida', unidad: 'm', catalogo: 'vigasCelosia', grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'vehicular' } },
  { ruta: 'params.galibo', etiqueta: 'Gálibo', tipo: 'medida', unidad: 'm', min: 2, max: 8, paso: 0.25, grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'vehicular' } },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'vehicular' } },
  { ruta: 'params.anchoTorre', etiqueta: 'Ancho de torre', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas', visibleSi: { ruta: 'params.clase', igual: 'vehicular' } },
  { ruta: 'params.estructuraArriba', etiqueta: 'Estructura arriba', tipo: 'bool', grupo: 'Avanzado' },
  { ruta: 'params.anclado', etiqueta: 'Anclado', tipo: 'bool', grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'portico_peatonal', nombre: 'Pórtico peatonal', icono: 'portico', tecla: 'P', sistema: 'bastidor', descripcion: 'Paso cubierto sobre la vereda: 2,50 libres, paso ≥ 1,20, bandeja de fenólico.', params: { clase: 'peatonal', largo: 10, alturaLibre: 2.5, ancho: 1.3 } },
  { id: 'portico_vehicular', nombre: 'Pórtico vehicular', icono: 'camion', sistema: 'multi', descripcion: 'Vigas de celosía sobre dos torres. Gálibo 4,50 y luces de 5 a 7,50 m.', params: { clase: 'vehicular', luz: 6, galibo: 4.5, profundidad: 1.09, anchoTorre: 1.09 } },
];

export const PORTICO: Tipologia<ParamsPortico> = {
  id: 'portico',
  version: 1,
  nombre: 'Pórtico',
  descripcion: 'Pórtico peatonal o vehicular. Puede ser la base de una fachada.',
  categoria: 'portico',
  sistemas: ['bastidor', 'multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarPortico,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarPortico,
  cambiarSistema: cambiarSistemaPortico,
};

