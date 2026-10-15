/**
 * Torres (port de construirTorre): torre escalera con zancas y descansos y torre de acceso con escalera
 * interna y escotilla. Admite unión por cara con una fachada (hereda altura y fase) y la unión `embebida`.
 */
import type { Aviso, Elemento, Estructura, Regla, Sistema, V2 } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { ConstructorEsqueleto } from '../esqueleto/esqueleto.ts';
import { arrDesde, conIntermedios, nivelesBastidor, nivelesMulti, type Nivel } from '../medida/alturas.ts';
import { bandaConDiagonal, celdaDiagonal, sentidoZigzag } from '../reglas/diagonales.ts';
import { tiraBastidor } from './comunes/tira-bastidor.ts';
import { avisoEsbeltez, puertosCaja } from './comunes/util-tipologias.ts';
import { clamp, EPS, fmt, marco, masCercano, num } from '../util.ts';

export interface ParamsTorre extends Record<string, unknown> {
  largo: number;
  ancho: number;
  altura: number;
  acceso: 'escalera' | 'interna';
  desembarco: 'cada_nivel' | 'ultimo' | number[];
  anclada: boolean;
  pataDeGallo: boolean;
  terreno: 'cemento' | 'tierra' | 'losa';
  alturaHeredada?: boolean;
}

const DEF: ParamsTorre = { largo: 2.5, ancho: 1.5, altura: 18, acceso: 'escalera', desembarco: 'cada_nivel', anclada: false, pataDeGallo: false, terreno: 'cemento' };

export function normalizarTorre(parcial: Partial<ParamsTorre>): { params: ParamsTorre; avisos: string[] } {
  const avisos: string[] = [];
  const p = { ...structuredClone(DEF), ...structuredClone(parcial || {}) } as ParamsTorre;
  p.largo = clamp(num(p.largo, 2.5), 0.5, 5);
  p.ancho = clamp(num(p.ancho, 1.5), 0.5, 5);
  const h = clamp(num(p.altura, 18), 2, 120);
  if (h !== p.altura) avisos.push(`Altura ajustada a ${fmt(h)}.`);
  p.altura = h;
  if (p.acceso !== 'escalera' && p.acceso !== 'interna') p.acceso = 'escalera';
  if (!(p.desembarco === 'cada_nivel' || p.desembarco === 'ultimo' || Array.isArray(p.desembarco))) p.desembarco = 'cada_nivel';
  p.anclada = !!p.anclada;
  p.pataDeGallo = !!p.pataDeGallo;
  return { params: p, avisos };
}

export function generarTorre(est: Estructura & { params: ParamsTorre }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const rel = ctx.relaciones;
  const bast = est.sistema === 'bastidor';
  const L = bast ? 2.5 : p.largo;
  const B = bast ? masCercano(m.bastidor.anchos, p.ancho) : p.ancho;
  const H = rel.alturaHeredada ?? p.altura;
  const nv = bast ? nivelesBastidor(H, false, m.bastidor) : nivelesMulti(H, rel.arrHeredado ?? arrDesde(H - 1), { modoPlataforma: 'cada_nivel' });
  const N = nv.niveles.length;
  const ARR = nv.ARR;
  const avisos: Omit<Aviso, 'id'>[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const unida = rel.unidaA.length > 0;
  const desembarco = (n: number) => unida && (p.desembarco === 'cada_nivel' || (p.desembarco === 'ultimo' && n === N - 1) || (Array.isArray(p.desembarco) && p.desembarco.includes(n)));
  const mk = marco([0, 0], 0);
  const W = mk.W;
  let b: ConstructorEsqueleto;
  if (bast) {
    b = new ConstructorEsqueleto('bastidor', [ARR, ...nv.niveles.map((x) => x.cota)]);
    tiraBastidor(b, { prefijo: 't', mk, S: [0, L], vanos: [L], w: B, niveles: nv.niveles, ARR, yTopCol: nv.yTopCol, accesos: [0] });
  } else {
    const { cotas } = conIntermedios([ARR, ...nv.niveles.map((x) => x.cota)]);
    b = new ConstructorEsqueleto('multi', cotas);
    b.esq.terreno = p.terreno;
    const pts: V2[] = [[0, 0], [L, 0], [L, B], [0, B]];
    const cols = pts.map((q, i) => b.columna(`tc${i}`, q, ARR, nv.yTopCol, 'base_regulable'));
    const caras: { id: string; a: number; c: number; normal: V2; nom: string }[] = [
      { id: 'tfrente', a: 0, c: 1, normal: [0, -1], nom: 'frente' },
      { id: 'tder', a: 1, c: 2, normal: [1, 0], nom: 'der' },
      { id: 'tfondo', a: 2, c: 3, normal: [0, 1], nom: 'fondo' },
      { id: 'tizq', a: 3, c: 0, normal: [-1, 0], nom: 'izq' },
    ];
    const vid = caras.map((x) => b.vano(x.id, cols[x.a], cols[x.c], 'exterior', { normal: x.normal }));
    const pano = b.pano('tp', vid, { sentido: vid[0] });
    // diagonales en todas las caras, zigzag roseta a roseta
    caras.forEach((_, fase) => {
      let orden = 0;
      for (let k = 1; k < cotas.length; k++) {
        if (!bandaConDiagonal(cotas[k] - cotas[k - 1])) continue;
        b.celda(vid[fase], k, celdaDiagonal(ctx.catalogo, cotas[k] - cotas[k - 1], fase % 2 ? B : L, sentidoZigzag(orden++, fase)));
      }
    });
    if (Math.abs(L - 2.5) < EPS && (Math.abs(B - 2.5) < EPS || Math.abs(B - 1.5) < EPS)) b.celdaPano(pano, 0, { diagonalPlanta: true });
    const el = (e: Elemento) => b.elemento(e);
    if (p.acceso === 'escalera') escaleraConDescansos(el, W, cotas, ARR, nv.niveles[N - 1].cota, L, B, avisos, est);
    nv.niveles.forEach((lv: Nivel, n) => {
      const y0 = n === 0 ? 0 : nv.niveles[n - 1].cota;
      const c = lv.cota;
      const k = b.k(c);
      if (p.acceso !== 'escalera') {
        el({ id: `esc${n}`, familia: 'escalera_interior', medidas: {}, a: W(0.25, y0, B / 2), b: W(1.05, c, B / 2), grupo: 'acceso' });
        b.celdaPano(pano, k, { plataforma: n < N - 1 && Math.abs(L - 2.5) < EPS ? 'escotilla' : 'tablones' });
      }
      caras.forEach((cara, i) => {
        if (cara.nom === 'frente' && desembarco(n)) return;
        b.celda(vid[i], k, { baranda: 2 });
      });
    });
    if (p.pataDeGallo) pataDeGallo(b, L, B, ARR, reglas, est);
    // anclada: a la fachada (cara del fondo) cada ≈ 4,00, en las dos verticales del fondo
    if (p.anclada && !unida) {
      let n = 0;
      nv.niveles.forEach((lv, i) => {
        if (i % 2 !== 1 && i !== N - 1) return;
        for (const c of [cols[2], cols[3]]) {
          b.nodo(c, b.k(lv.cota), { anclaje: { retiro: 0.2, dir: [0, 1] } });
          n++;
        }
      });
      reglas.push({ regla: 'torre.anclajes', estructuraId: est.id, texto: `${est.nombre}: ${n} anclajes a la fachada cada ≈ 4,00 en la cara del fondo.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
    }
  }
  if (unida) reglas.push({ regla: 'torre.desembarco', estructuraId: est.id, texto: `${est.nombre}: desembarco ${p.desembarco === 'cada_nivel' ? 'en cada nivel de la fachada' : p.desembarco === 'ultimo' ? 'solo en el último nivel' : 'en los niveles elegidos'}.` });
  if (!unida && !p.anclada) {
    const Bef = Math.min(L, B) + (p.pataDeGallo ? 3 : 0);
    if (nv.alturaReal / Bef > CRITERIOS.hbMax) avisos.push(avisoEsbeltez(est, nv.alturaReal, Bef, 'params.anclada', B < 2.5 ? { etiqueta: 'Ensanchar a 2,50', ruta: 'params.ancho', valor: 2.5 } : null));
  }
  const desembarcos = nv.niveles.filter((_, n) => desembarco(n)).map((x) => x.cota);
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: 0, ml: 0, alturaReal: nv.alturaReal, huella: [[0, 0], [L, 0], [L, B], [0, B]] },
    puertos: puertosCaja('Torre', [0, L], L, B, nv.alturaReal, nv.yTopCol),
    info: { prof: B, largo: L, ARR, desembarcos, frentes: [{ f: 0, etiqueta: 'Torre', largo: L, vanos: [L], S: [0, L], niveles: nv.niveles, ARR, yTopCol: nv.yTopCol, alturaReal: nv.alturaReal, altura: H, texto: `${fmt(L)} × ${fmt(B)}` }] },
  };
}

/** Módulo de altura de la zanca de catálogo (ZANCA-ESC-150x250: sube 2,00 en 1,40 de planta). */
export const MODULO_ZANCA = 2;

/**
 * Escalera con descansos (pedido 6, foto 7): arranca en el primer anillo (no en el suelo), cada tramo sube
 * exactamente un módulo de zanca (2,00) de anillo a anillo y alterna el sentido; del suelo al arranque va un
 * escalón de arranque. Si el último nivel no cae en la grilla de 2,00, el resto se sube con escalera interna.
 */
function escaleraConDescansos(el: (e: Elemento) => void, W: (s: number, y: number, t: number) => [number, number, number], cotas: number[], ARR: number, top: number, L: number, B: number, avisos: Omit<Aviso, 'id'>[], est: Estructura): void {
  const hay = (y: number) => cotas.some((c) => Math.abs(c - y) < EPS);
  el({ id: 'zarr', familia: 'accesorio', medidas: { variante: 'escalon_arranque' }, a: W(0.3, 0, B / 2), b: W(0.3, ARR, B / 2), grupo: 'escalera', sistema: 'comun' });
  let y = ARR;
  let n = 0;
  while (y + MODULO_ZANCA <= top + EPS && hay(y + MODULO_ZANCA)) {
    const c = Math.round((y + MODULO_ZANCA) * 1000) / 1000;
    const ida = n % 2 === 0;
    const s0 = ida ? 0.55 : L - 0.55;
    const s1 = ida ? L - 0.55 : 0.55;
    el({ id: `zan${n}`, familia: 'zanca', medidas: { ancho: 1.5, largo: 2.5 }, a: W(s0, y, B / 2), b: W(s1, c, B / 2), grupo: 'escalera', primitivas: [{ a: W(s0, y, 0.08), b: W(s1, c, 0.08) }, { a: W(s0, y, B - 0.08), b: W(s1, c, B - 0.08) }] });
    el({ id: `bze${n}`, familia: 'baranda_escalera', medidas: {}, a: W(s0, y + 1, B - 0.05), b: W(s1, c + 1, B - 0.05), grupo: 'escalera' });
    for (const [d0, d1, kk] of [[0, 0.55, 'a'], [L - 0.55, L, 'b']] as const) {
      for (let j = 0; j < 2; j++) {
        const s = d0 + ((j + 0.5) * (d1 - d0)) / 2;
        el({ id: `des${n}${kk}${j}`, familia: 'tablon', medidas: { largo: B }, a: W(s, c, 0), b: W(s, c, B), grupo: 'escalera', sistema: 'comun' });
      }
    }
    y = c;
    n++;
  }
  if (top - y > EPS) {
    el({ id: 'zfin', familia: 'escalera_interior', medidas: {}, a: W(0.25, y, B / 2), b: W(1.05, top, B / 2), grupo: 'escalera' });
    avisos.push({ regla: 'torre.escalera_resto', nivel: 'info', estructuraId: est.id, texto: `${est.nombre}: el último nivel (${fmt(top)}) no cae en un módulo de zanca de 2,00; los ${fmt(top - y)} finales se suben con escalera interna.`, reparaciones: [] });
  }
}

function pataDeGallo(b: ConstructorEsqueleto, L: number, B: number, ARR: number, reglas: Omit<Regla, 'id'>[], est: Estructura): void {
  const W = marco([0, 0], 0).W;
  const sal = 1.5;
  const puntos = [[0, 0, 0, -1], [L, 0, 0, -1], [0, B, 0, 1], [L, B, 0, 1], [0, 0, -1, 0], [0, B, -1, 0], [L, 0, 1, 0], [L, B, 1, 0]];
  puntos.forEach(([s, t, ds, dt], k) => {
    const s2 = s + ds * sal;
    const t2 = t + dt * sal;
    const g = 'pata_de_gallo';
    b.elemento({ id: `pg${k}h`, familia: 'horizontal', medidas: { largo: 1.5 }, a: W(s, ARR, t), b: W(s2, ARR, t2), grupo: g });
    b.elemento({ id: `pg${k}d`, familia: 'diagonal', medidas: { alto: 1.5, largo: 2.5 }, a: W(s2, ARR, t2), b: W(s, ARR + 2.5, t), grupo: g });
    b.elemento({ id: `pg${k}b`, familia: 'base_regulable', medidas: {}, a: W(s2, 0, t2), b: W(s2, ARR, t2), grupo: g, sistema: 'comun' });
  });
  reglas.push({ regla: 'torre.pata_de_gallo', estructuraId: est.id, texto: `${est.nombre}: pata de gallo en los 4 lados (+1,50 por lado).`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.pataDeGallo', valor: false } });
}

export function cambiarSistemaTorre(params: ParamsTorre, _de: Sistema, a: Sistema): { params: ParamsTorre; avisos: string[] } {
  const p = structuredClone(params);
  if (a === 'bastidor') {
    p.largo = 2.5;
    p.ancho = 1.3;
    return { params: p, avisos: ['Torre en bastidor: cuerpo 1,30 × 2,50 × 1,80 con escalera interna.'] };
  }
  p.ancho = masCercano([1.09, 1.25, 1.5], p.ancho);
  return { params: p, avisos: [`Torre en multidireccional: ${fmt(p.largo)} × ${fmt(p.ancho)}.`] };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', catalogo: 'vanos', grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Ancho', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.altura', etiqueta: 'Altura', tipo: 'medida', unidad: 'm', min: 2, max: 120, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.acceso', etiqueta: 'Acceso', tipo: 'opcion', opciones: [{ valor: 'escalera', etiqueta: 'Escalera con descansos' }, { valor: 'interna', etiqueta: 'Escalera interna' }], grupo: 'Accesos' },
  { ruta: 'params.desembarco', etiqueta: 'Desembarco', tipo: 'opcion', opciones: [{ valor: 'cada_nivel', etiqueta: 'Cada nivel' }, { valor: 'ultimo', etiqueta: 'Solo arriba' }], grupo: 'Accesos' },
  { ruta: 'params.anclada', etiqueta: 'Anclada', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.pataDeGallo', etiqueta: 'Pata de gallo', tipo: 'bool', grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'torre_escalera', nombre: 'Torre escalera', icono: 'escalera', tecla: 'T', descripcion: 'Torre de 2,50 × 1,50 con zancas y descansos, anclada a la fachada. Desembarca en cada nivel.', params: { largo: 2.5, ancho: 1.5, altura: 18, acceso: 'escalera', anclada: true } },
  { id: 'torre_acceso', nombre: 'Torre de acceso', icono: 'torre', descripcion: 'Torre con escalera interna y escotilla en cada nivel.', params: { largo: 2.5, ancho: 1.09, altura: 10, acceso: 'interna', anclada: true } },
];

export const TORRE: Tipologia<ParamsTorre> = {
  id: 'torre',
  version: 1,
  nombre: 'Torre',
  descripcion: 'Torre de escalera o de acceso. Se une a una fachada por cara o se embebe en ella.',
  categoria: 'torre',
  sistemas: ['multi', 'bastidor'],
  apoyos: ['suelo', 'sobre_estructura'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarTorre,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarTorre,
  cambiarSistema: cambiarSistemaTorre,
};

