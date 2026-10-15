/**
 * Tipología «fachada» multidireccional (port de construirFachadaMulti de la maqueta) en esqueleto:
 * pantalla, estructura + pantalla, estructura sin pantalla y voladizo con ménsulas (presets).
 * Frentes en L, esquinas con vertical compartida o vano de giro, esquina entrante, aberturas con viga,
 * ménsulas, bandeja en PB, vía pública, cubierta, accesos y anclajes al tresbolillo.
 * Las piezas las arma `armar` a partir del esqueleto. Todo es PREDIMENSIONADO.
 */
import type { Accion, Aviso, Estructura, OverrideCelda, Regla, UnionResuelta, V2, V3 } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { ConstructorEsqueleto, celdaId } from '../esqueleto/esqueleto.ts';
import { conIntermedios, intermedios, type ModoPlataforma } from '../medida/alturas.ts';
import { bandaConDiagonal, celdaDiagonal, sentidoZigzag, vanosArriostrados } from '../reglas/diagonales.ts';
import { type Frente, type FrenteParam, type FrentesResueltos, resolverFrentes } from './comunes/frentes.ts';
import { avisoEsbeltez, elegirViga, primViga, puertosFachada, sinMarco } from './comunes/util-tipologias.ts';
import { clamp, dentroPoligono, enBorde, envolvente, EPS, fmt, num, r3, sum } from '../util.ts';

export interface MensulaSpec {
  lado: 'afuera' | 'fachada';
  brazo: number;
  desdeNivel?: number;
  hastaNivel?: number;
  frentes?: number[];
}

export interface ParamsFachada extends Record<string, unknown> {
  frentes: FrenteParam[];
  altura: number;
  profundidad: number;
  retiro: number;
  niveles: 'arriba' | 'pantalla';
  modoPlataforma: ModoPlataforma;
  bandejaPB: boolean;
  cubierta: 'nada' | 'media_sombra' | 'lona';
  viaPublica: boolean;
  concertina: boolean;
  anclada: boolean;
  accesos: 'auto' | number | { f: number; v: number }[];
  esquinas: ('vertical_compartida' | 'vano_giro')[];
  mensulas: MensulaSpec[];
  brazoMensula: number;
  ajuste: 'final' | 'centrado';
  cuerpo: 'STD' | 'JR';
  terreno: 'cemento' | 'tierra' | 'losa';
  pataDeGallo: boolean;
  densificarAnclajes?: boolean;
  escalonarEmpalmes?: boolean;
}

export const P_FACHADA_BASE: ParamsFachada = {
  frentes: [{ largo: 14 }], altura: 12, profundidad: 0.73, retiro: 0.2, niveles: 'arriba',
  modoPlataforma: 'cada_2m', bandejaPB: false, cubierta: 'nada', viaPublica: false, concertina: false,
  anclada: true, accesos: 'auto', esquinas: [], mensulas: [], brazoMensula: 0.73, ajuste: 'final',
  cuerpo: 'STD', terreno: 'cemento', pataDeGallo: false,
};

export function normalizarFachada(parcial: Partial<ParamsFachada>): { params: ParamsFachada; avisos: string[] } {
  const avisos: string[] = [];
  const p = { ...structuredClone(P_FACHADA_BASE), ...structuredClone(parcial || {}) } as ParamsFachada;
  if (!Array.isArray(p.frentes) || !p.frentes.length) {
    p.frentes = [{ largo: 14 }];
    avisos.push('Sin frentes: arranqué con uno de 14,00.');
  }
  p.frentes = p.frentes.map((fr, i) => {
    const largo = clamp(num(fr?.largo, 14), 0.5, 200);
    if (largo !== fr?.largo) avisos.push(`Frente ${i + 1}: largo ajustado a ${fmt(largo)}.`);
    const out: FrenteParam = { largo };
    if (i > 0) out.angulo = [90, -90, 0].includes(num(fr?.angulo, 90)) ? num(fr?.angulo, 90) : 90;
    if (fr?.altura !== undefined) out.altura = clamp(num(fr.altura, p.altura), 1.5, 120);
    if (Array.isArray(fr?.vanos) && fr.vanos.every((x) => Number.isFinite(+x) && +x > 0)) out.vanos = fr.vanos.map(Number);
    return out;
  });
  const alt = clamp(num(p.altura, 12), 1.5, 120);
  if (alt !== p.altura) avisos.push(`Altura ajustada a ${fmt(alt)}.`);
  p.altura = alt;
  p.profundidad = clamp(num(p.profundidad, 0.73), 0.3, 3);
  p.retiro = clamp(num(p.retiro, 0.2), 0, 3);
  p.brazoMensula = clamp(num(p.brazoMensula, 0.73), 0.2, 2);
  if (!['arriba', 'pantalla'].includes(p.niveles)) p.niveles = 'arriba';
  if (!['cada_2m', 'cada_nivel', 'solo_trabajo', 'ninguna'].includes(p.modoPlataforma)) p.modoPlataforma = 'cada_2m';
  if (!['nada', 'media_sombra', 'lona'].includes(p.cubierta)) p.cubierta = 'nada';
  if (!Array.isArray(p.esquinas)) p.esquinas = [];
  if (!Array.isArray(p.mensulas)) p.mensulas = [];
  p.mensulas = p.mensulas.filter((x) => x && (x.lado === 'afuera' || x.lado === 'fachada')).map((x) => ({ ...x, brazo: clamp(num(x.brazo, p.brazoMensula), 0.2, 2) }));
  for (const k of ['bandejaPB', 'viaPublica', 'concertina', 'anclada', 'pataDeGallo'] as const) p[k] = !!p[k];
  if (!['cemento', 'tierra', 'losa'].includes(p.terreno)) p.terreno = 'cemento';
  return { params: p, avisos };
}

/** Celda de la maqueta (f:v:n) o del esqueleto: override de la cara exterior del vano v, nivel n. */
function overrideDe(ov: Record<string, OverrideCelda>, f: number, v: number, k: number, n: number): OverrideCelda {
  const id = `f${f}e${v}`;
  return { ...(ov[`${id}@N${n}`] || {}), ...(ov[celdaId(id, k)] || {}) };
}

interface Hueco { v0: number; v1: number; n0: number; n1: number; viga: boolean }

export function generarFachadaMulti(est: Estructura & { params: ParamsFachada }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const cat = ctx.catalogo;
  const rel = ctx.relaciones;
  const soportes = rel.soportes;
  const soporteTop = soportes.length ? soportes[0].yTope : null;
  const res: FrentesResueltos = resolverFrentes(p, 'multi', est.medida, cat.medidas, { soporteTop });
  const prof = res.prof;
  const ov = est.overrides || {};
  const nF = res.frentes.length;
  const cubierta = p.cubierta || 'nada';
  const retiro = Math.max(0, p.retiro ?? 0.2);
  const avisos: Omit<Aviso, 'id'>[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const aviso = (nivel: Aviso['nivel'], regla: string, texto: string, extra: Partial<Aviso> = {}) => avisos.push({ nivel, regla, texto, estructuraId: est.id, reparaciones: [], ...extra });
  const regla = (r: string, texto: string, deshacer?: Accion) => reglas.push({ regla: r, texto, estructuraId: est.id, ...(deshacer ? { deshacer } : {}) });
  const supTop = (q: V2): number | null => {
    for (const sp of soportes) for (const h of sp.huellas) if (dentroPoligono(q[0], q[1], h) || enBorde(q[0], q[1], h)) return sp.yTope;
    return null;
  };

  // ── cotas globales: anillos (arranque + niveles) e intermedios de cada frente ──
  const ringsF = res.frentes.map((F) => {
    const base = [F.ARR, ...F.niveles.map((x) => x.cota)];
    return conIntermedios(base);
  });
  const todas = new Set<number>();
  for (const r of ringsF) for (const c of r.cotas) todas.add(r3(c));
  const b = new ConstructorEsqueleto('multi', [...todas]);
  b.esq.terreno = p.terreno;
  const K = (y: number) => b.k(y);
  const libreProf = est.medida === 'libre' && !cat.medidas.multi.profundidades.some((x) => Math.abs(x - prof) < 0.0015);

  // ── accesos ──
  const totalMl = sum(res.frentes.map((F) => sum(F.vanos)));
  let accesos: { f: number; v: number }[] = [];
  if (Array.isArray(p.accesos)) accesos = p.accesos.map((a) => ({ f: a.f, v: a.v }));
  else if (!rel.accesoPorTorre) {
    const cant = typeof p.accesos === 'number' ? p.accesos : Math.max(1, Math.round(totalMl / CRITERIOS.accesoCadaMl));
    const globales: { f: number; v: number }[] = [];
    res.frentes.forEach((F) => F.vanos.forEach((v, i) => { if (Math.abs(v - 2.5) < EPS) globales.push({ f: F.f, v: i }); }));
    for (let k = 0; k < cant && globales.length; k++) {
      const idx = cant === 1 ? Math.min(1, globales.length - 1) : Math.round(((k + 0.5) * globales.length) / cant - 0.5);
      const g = globales[Math.min(globales.length - 1, Math.max(0, idx))];
      if (!accesos.some((a) => a.f === g.f && a.v === g.v)) accesos.push(g);
    }
    if (!globales.length && cant) aviso('aviso', 'acceso.sin_vano', 'No hay vanos de 2,50 para la escotilla de acceso.');
  }
  if (rel.accesoPorTorre && p.accesos === 'auto') regla('acceso.torre', `${est.nombre}: el acceso es por la torre, no agregué escaleras internas.`);

  let anclBase = 0;
  let anclMens = 0;
  let anclTot = 0;
  const anclNodos = new Set<string>();
  const anclBaseNodos = new Set<string>();
  const anclCandidatos: { col: string; k: number; ok: boolean; dir: V2 }[] = [];
  const diagTxt: string[] = [];
  let barandasLados = 0;
  const conAccesorios = new Set<string>();
  const uniones: UnionResuelta[] = [];
  const colsDeFrente: string[][] = [];

  for (const F of res.frentes) {
    const f = F.f;
    const mk = F.mk;
    const L = (s: number, t: number): V2 => {
      const q = mk.W(s, 0, t);
      return [q[0], q[2]];
    };
    const L3 = (s: number, y: number, t: number): V3 => mk.W(s, y, t);
    const S = F.S;
    const m = F.vanos.length;
    const N = F.niveles.length;
    const ARR = F.ARR;
    const cot = (n: number) => F.niveles[n].cota;
    const kN = (n: number) => K(cot(n));
    const primero = f === 0;
    const ultimo = f === nF - 1;
    const iniAbierto = primero || (F.angulo > 0 && F.modoEsquina === 'vertical_compartida');
    const finAbierto = ultimo;
    const O = (v: number, n: number) => overrideDe(ov, f, v, kN(n), n);
    const esqV0 = F.vanoEsquina > 0;
    const finEsPaso = !ultimo && res.frentes[f + 1].angulo > 0;
    const esqFin = F.vanoEsquinaFin > 0;
    const ladoPaso = (v: number, t: number) => (esqV0 && v === 0 && t === 0) || (esqFin && v === m - 1 && Math.abs(t - prof) < EPS);
    const nInt: V2 = [-mk.n[0], -mk.n[1]];
    const nExt: V2 = [mk.n[0], mk.n[1]];
    const rings = ringsF[f];

    // huecos (aberturas)
    const ab = new Set<string>();
    for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) if (O(v, n).abertura) ab.add(`${v}:${n}`);
    const huecos: Hueco[] = [];
    const visto = new Set<string>();
    for (const k0 of ab) {
      if (visto.has(k0)) continue;
      const pila = [k0];
      let v0 = Infinity, v1 = -1, n0 = Infinity, n1 = -1;
      visto.add(k0);
      while (pila.length) {
        const [v, n] = pila.pop()!.split(':').map(Number);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v); n0 = Math.min(n0, n); n1 = Math.max(n1, n);
        for (const [dv, dn] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const kk = `${v + dv}:${n + dn}`;
          if (ab.has(kk) && !visto.has(kk)) { visto.add(kk); pila.push(kk); }
        }
      }
      huecos.push({ v0, v1, n0, n1, viga: O(v0, n0).viga !== false });
    }
    const enHueco = (v: number, n: number) => huecos.find((h) => v >= h.v0 && v <= h.v1 && n >= h.n0 && n <= h.n1);
    const colInterior = (i: number) => huecos.find((h) => h.v1 > h.v0 && i > h.v0 && i <= h.v1);
    const platQuitada = (v: number, n: number) => huecos.some((h) => v >= h.v0 && v <= h.v1 && n >= h.n0 && n <= h.n1 - 1);
    const ringQuitado = (v: number, r: number) => huecos.some((h) => v >= h.v0 && v <= h.v1 && ((h.n0 === 0 && r === 0) || (r >= h.n0 + 1 && r <= h.n1)));
    /** nivel al que pertenece una banda que termina en y (el primero con cota ≥ y) */
    const nivelDeBanda = (y: number) => {
      for (let n = 0; n < N; n++) if (cot(n) >= y - EPS) return n;
      return N - 1;
    };

    // arranque de cada columna
    const colIni: { y: number; base: boolean; apoyo?: boolean }[][] = [];
    for (let i = 0; i <= m; i++) {
      colIni[i] = [0, prof].map((t) => {
        const h = colInterior(i);
        if (h) return { y: cot(h.n1), base: false };
        const st = supTop(L(S[i], t));
        if (st !== null) return { y: st, base: false, apoyo: true };
        return { y: ARR, base: true };
      });
    }
    const colY = (i: number) => Math.max(colIni[i][0].y, colIni[i][1].y);
    const bajoApoyo = (v: number, n: number) => {
      const tops = [v, v + 1].flatMap((i) => colIni[i].filter((c) => c.apoyo).map((c) => c.y));
      return tops.length > 0 && cot(n) <= Math.max(...tops) + EPS;
    };
    const supEnFrente = colIni.some((c) => c.some((x) => x.apoyo));

    // columnas
    const col: string[][] = [];
    const propias: string[] = [];
    for (let i = 0; i <= m; i++) {
      col[i] = [0, prof].map((t, side) => {
        const ci = colIni[i][side];
        const idProp = `f${f}c${i}${side ? 'e' : 'i'}`;
        const id = b.columna(idProp, L(S[i], t), ci.y, F.yTopCol, ci.base ? 'base_regulable' : 'sobre');
        if (id === idProp) propias.push(id);
        if (p.viaPublica && ci.base && !conAccesorios.has(id)) {
          conAccesorios.add(id);
          b.elemento({ id: `recub:${id}`, familia: 'recubrimiento', medidas: { largo: 2.0 }, a: L3(S[i], ci.y, t), b: L3(S[i], Math.min(2, F.yTopCol), t), grupo: 'via_publica', sistema: 'comun' });
          if (side === 1) b.elemento({ id: `esf:${id}`, familia: 'esfera', medidas: {}, a: L3(S[i], 1, t), b: L3(S[i], 1, t), grupo: 'via_publica', sistema: 'comun' });
        }
        return id;
      });
    }
    colsDeFrente.push(propias);
    // vanos
    const vInt: string[] = [];
    const vExt: string[] = [];
    const vTr: string[] = [];
    const propiosV = new Set<string>();
    const nuevoVano = (idp: string, a: string, bb: string, cara: 'exterior' | 'interior' | 'transversal', libre: boolean, normal?: V2) => {
      const id = b.vano(idp, a, bb, cara, { libre, normal });
      if (id === idp) propiosV.add(id);
      return id;
    };
    for (let v = 0; v < m; v++) {
      vInt[v] = nuevoVano(`f${f}i${v}`, col[v][0], col[v + 1][0], 'interior', F.libres[v], nInt);
      vExt[v] = nuevoVano(`f${f}e${v}`, col[v][1], col[v + 1][1], 'exterior', F.libres[v], nExt);
    }
    for (let i = 0; i <= m; i++) {
      const extTr = esqV0 && i === 0;
      vTr[i] = nuevoVano(`f${f}t${i}`, col[i][0], col[i][1], extTr ? 'exterior' : 'transversal', libreProf, extTr ? [-mk.u[0], -mk.u[1]] : i === 0 ? [-mk.u[0], -mk.u[1]] : [mk.u[0], mk.u[1]]);
    }
    const pano: string[] = [];
    for (let v = 0; v < m; v++) pano[v] = b.pano(`f${f}p${v}`, [vInt[v], vTr[v + 1], vExt[v], vTr[v]], { libre: F.libres[v] || libreProf, sentido: vExt[v] });

    // cotas que no son de este frente: sin anillo en sus vanos propios
    const deFrente = new Set(rings.cotas.map(r3));
    b.esq.cotas.forEach((c, k) => {
      if (deFrente.has(r3(c))) return;
      for (const id of propiosV) b.celda(id, k, { horizontal: false });
    });

    // anillos principales
    const ringCota = (r: number) => (r === 0 ? ARR : cot(r - 1));
    for (let r = 0; r <= N; r++) {
      const c = ringCota(r);
      const k = K(c);
      for (let v = 0; v < m; v++) {
        if (ringQuitado(v, r)) {
          b.celda(vInt[v], k, { horizontal: false });
          b.celda(vExt[v], k, { horizontal: false });
          continue;
        }
        if (ladoPaso(v, prof) && p.viaPublica && c < CRITERIOS.galiboPeatonal - EPS) b.celda(vExt[v], k, { horizontal: false });
      }
      for (let i = 0; i <= m; i++) {
        const quitado = i > 0 && i < m && ringQuitado(i, r) && ringQuitado(i - 1, r);
        if ((p.viaPublica && c < CRITERIOS.galiboPeatonal - EPS) || quitado) b.celda(vTr[i], k, { horizontal: false });
      }
      // intermedios de la banda r → r+1
      if (r < N) {
        const cSup = ringCota(r + 1);
        for (const ci of intermedios(c, cSup)) {
          const kc = K(ci);
          for (let v = 0; v < m; v++) {
            if (enHueco(v, r)) {
              b.celda(vInt[v], kc, { horizontal: false });
              b.celda(vExt[v], kc, { horizontal: false });
            }
            if (ladoPaso(v, prof) && p.viaPublica && ci < CRITERIOS.libreBajoTravesano - EPS) b.celda(vExt[v], kc, { horizontal: false });
          }
          for (let i = 0; i <= m; i++) {
            const quitado = i > 0 && i < m && enHueco(i, r) && enHueco(i - 1, r);
            if ((p.viaPublica && ci < CRITERIOS.libreBajoTravesano - EPS) || quitado) b.celda(vTr[i], kc, { horizontal: false });
          }
        }
      }
    }

    // plataformas, barandas, ménsulas
    const accF = accesos.filter((a) => a.f === f).map((a) => a.v);
    const mensDe = (v: number, n: number): { lado: 'afuera' | 'fachada'; brazo: number } | null => {
      const o = O(v, n).mensula;
      if (o === false) return null;
      if (o === 'afuera' || o === 'fachada') {
        const spec = (p.mensulas || []).find((x) => x.lado === o);
        return { lado: o, brazo: spec?.brazo || p.brazoMensula || 0.73 };
      }
      for (const spec of p.mensulas || []) {
        if (spec.frentes && !spec.frentes.includes(f)) continue;
        if (n < (spec.desdeNivel ?? 0) || n > (spec.hastaNivel ?? Infinity)) continue;
        return { lado: spec.lado, brazo: spec.brazo || p.brazoMensula || 0.73 };
      }
      return null;
    };
    for (let n = 0; n < N; n++) {
      const lv = F.niveles[n];
      const k = kN(n);
      for (let v = 0; v < m; v++) {
        const o = O(v, n);
        if (bajoApoyo(v, n)) continue;
        const esAcceso = accF.includes(v);
        const hu = enHueco(v, n);
        const conPlat = (lv.plataforma || esAcceso) && !platQuitada(v, n) && !o.sinPlataforma && !(hu && n < hu.n1);
        if (conPlat) {
          const esc = esAcceso && Math.abs(F.vanos[v] - 2.5) < EPS && n < N - 1;
          b.celdaPano(pano[v], k, { plataforma: esc ? 'escotilla' : 'tablones', ...(lv.bandeja ? { fenolico: true } : {}) });
        }
        const mens = mensDe(v, n);
        const conMens = !!mens && !hu;
        if (conMens && mens) {
          const side = mens.lado === 'afuera' ? 1 : 0;
          const conBaranda = mens.lado === 'afuera' || retiro - mens.brazo > CRITERIOS.retiroLibre + EPS;
          for (const i of [v, v + 1]) {
            const nk = `${col[i][side]}@${k}`;
            if (!b.esq.nodos[nk]?.mensula) b.nodo(col[i][side], k, { mensula: { dir: mens.lado, brazo: mens.brazo, baranda: conBaranda } });
          }
        }
        if (!conPlat && !conMens) continue;
        const bar = lv.faldon ? 1 : 2;
        if (!(conMens && mens!.lado === 'afuera') && !ladoPaso(v, prof)) {
          b.celda(vExt[v], k, { baranda: bar });
          barandasLados++;
        } else if (conMens) barandasLados++;
        const gap = conMens && mens!.lado === 'fachada' ? retiro - mens!.brazo : retiro;
        if (gap > CRITERIOS.retiroLibre + EPS && !(esqV0 && v === 0)) {
          if (!(conMens && mens!.lado === 'fachada')) b.celda(vInt[v], k, { baranda: bar });
          barandasLados++;
        }
        if (v === 0 && iniAbierto) b.celda(vTr[0], k, { baranda: bar });
        if (v === m - 1 && finAbierto) b.celda(vTr[m], k, { baranda: bar });
      }
    }
    // escaleras internas en vanos de acceso
    for (const v of accF) {
      if (v >= m) continue;
      let yb = colY(v) > ARR + EPS ? colY(v) : 0;
      for (let n = 0; n < N; n++) {
        const c = cot(n);
        if (bajoApoyo(v, n) || enHueco(v, n)) { yb = c; continue; }
        b.elemento({ id: `esc:f${f}v${v}n${n}`, familia: 'escalera_interior', medidas: {}, a: L3(S[v] + 0.25, yb, prof * 0.5), b: L3(S[v] + 1.05, c, prof * 0.5), grupo: 'acceso' });
        yb = c;
      }
      regla('acceso.escotilla', `Escotilla y escalera de acceso en ${F.etiqueta}, vano ${v + 1} (todos los niveles).`, { tipo: 'param', estructuraId: est.id, ruta: 'params.accesos', valor: [] });
    }

    // diagonales: roseta a roseta, zigzag continuo (pedido 1)
    const arr = vanosArriostrados(m);
    let diag = arr;
    if (esqFin && m > 1) diag = [...new Set([...arr.filter((v) => v !== m - 1), m - 2])].sort((a, c) => a - c);
    diagTxt.push(`${F.etiqueta}: vanos ${diag.map((v) => v + 1).join(', ')}`);
    const cotasF = rings.cotas;
    const bandas: { k: number; lo: number; hi: number; n: number }[] = [];
    for (let j = 1; j < cotasF.length; j++) {
      const lo = cotasF[j - 1];
      const hi = cotasF[j];
      const k = K(hi);
      if (!bandaConDiagonal(hi - lo) || b.esq.cotas[k - 1] === undefined || Math.abs(b.esq.cotas[k - 1] - lo) > 0.0015) continue;
      bandas.push({ k, lo, hi, n: nivelDeBanda(hi) });
    }
    diag.forEach((v, fase) => {
      let orden = 0;
      for (const bd of bandas) {
        if (enHueco(v, bd.n) || bajoApoyo(v, bd.n)) continue;
        if (bd.lo < colY(v) - EPS || bd.lo < colY(v + 1) - EPS) continue;
        if (O(v, bd.n).abertura) continue;
        b.celda(vExt[v], bd.k, celdaDiagonal(cat, bd.hi - bd.lo, F.vanos[v], sentidoZigzag(orden++, fase)));
      }
    });
    const extremos: number[] = [];
    if (primero || esqV0) extremos.push(0);
    if (!finEsPaso) extremos.push(m);
    extremos.forEach((i, fase) => {
      let orden = 0;
      for (const bd of bandas) {
        if (p.viaPublica && bd.lo < CRITERIOS.galiboPeatonal - EPS) continue;
        if (bd.lo < colY(i) - EPS) continue;
        b.celda(vTr[i], bd.k, celdaDiagonal(cat, bd.hi - bd.lo, prof, sentidoZigzag(orden++, fase)));
      }
    });

    // anclajes al tresbolillo (lado fachada)
    if (p.anclada !== false) {
      const filas = (dn: number) => F.niveles.map((_, n) => n).filter((n) => (N - 1 - n) % dn === 0);
      const grilla = (dx: number, dn: number) => {
        const out = new Set<string>();
        filas(dn).forEach((n) => {
          const fila = (N - 1 - n) / dn;
          for (let i = 0; i <= m; i++) if ((i + fila) % dx === 0 || i === 0 || i === m) out.add(`${i}:${n}`);
        });
        return out;
      };
      const base = grilla(CRITERIOS.anclajeDx, CRITERIOS.anclajeDn);
      let usado = base;
      if (cubierta === 'media_sombra') usado = grilla(2, 1);
      if (cubierta === 'lona') usado = grilla(1, 1);
      if (p.densificarAnclajes === false) usado = base;
      usado = new Set(usado);
      for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) {
        if (O(v, n).lona && cubierta !== 'lona') usado.add(`${v}:${n}`);
        if (mensDe(v, n)) {
          const kk = [`${v}:${n}`, `${v + 1}:${n}`].find((x) => +x.split(':')[0] % 2 === 0);
          if (kk && !usado.has(kk)) { usado.add(kk); anclMens++; }
        }
      }
      for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) {
        const a = O(v, n).anclaje;
        if (a === undefined) continue;
        if (a) usado.add(`${v}:${n}`);
        else usado.delete(`${v}:${n}`);
      }
      const tieneMuro = (i: number) => S[i] >= -EPS;
      for (const kk of base) {
        const [i, n] = kk.split(':').map(Number);
        if (i > m || n >= N || !tieneMuro(i) || cot(n) < colY(i) - EPS) continue;
        const key = `${col[i][0]}@${kN(n)}`;
        if (!anclBaseNodos.has(key)) { anclBaseNodos.add(key); anclBase++; }
      }
      for (let i = 0; i <= m; i++) if (tieneMuro(i) && !usado.has(`${i}:${N - 1}`)) anclCandidatos.push({ col: col[i][0], k: kN(N - 1), ok: cot(N - 1) >= colY(i) - EPS, dir: nInt });
      for (const kk of [...usado].sort()) {
        const [i, n] = kk.split(':').map(Number);
        if (i > m || n >= N || !tieneMuro(i)) continue;
        if (cot(n) < colY(i) - EPS) continue;
        const key = `${col[i][0]}@${kN(n)}`;
        if (anclNodos.has(key)) continue;
        anclNodos.add(key);
        b.nodo(col[i][0], kN(n), { anclaje: { retiro, dir: nInt } });
        anclTot++;
      }
    }

    // cubierta (media sombra / lona)
    for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) {
      const o = O(v, n);
      const tipoCub = o.lona ? 'lona' : cubierta;
      if (tipoCub === 'nada' || enHueco(v, n) || bajoApoyo(v, n) || ladoPaso(v, prof)) continue;
      if (F.niveles[n].bandeja && n === 0 && p.niveles !== 'pantalla') continue;
      if (p.niveles === 'pantalla' && n === 0) continue;
      const y0 = n === 0 ? ARR : cot(n - 1);
      const y1 = cot(n);
      for (let k = K(y0) + 1; k <= K(y1); k++) {
        b.celda(vExt[v], k, { cerramiento: tipoCub });
        if (esqV0 && v === 0) b.celda(vTr[0], k, { cerramiento: tipoCub });
      }
    }
    if (p.concertina) b.elemento({ id: `conc:f${f}`, familia: 'accesorio', medidas: { variante: 'concertina' }, a: L3(S[0], cot(0) + 0.3, prof), b: L3(S[m], cot(0) + 0.3, prof), medida: r3(S[m] - S[0]), grupo: 'via_publica', sistema: 'comun' });

    // vigas de huecos
    for (const h of huecos) {
      const luz = r3(S[h.v1 + 1] - S[h.v0]);
      const celda0 = celdaId(vExt[h.v0], kN(h.n0));
      const celdasH: string[] = [];
      for (let v = h.v0; v <= h.v1; v++) for (let n = h.n0; n <= h.n1; n++) celdasH.push(celdaId(`f${f}e${v}`, kN(n)), `f${f}e${v}@N${n}`);
      const txtH = `abertura N${h.n0 + 1}${h.n1 > h.n0 ? `–N${h.n1 + 1}` : ''} V${h.v0 + 1}${h.v1 > h.v0 ? `–V${h.v1 + 1}` : ''}`;
      const quitar: Accion = { tipo: 'overrides', estructuraId: est.id, celdas: celdasH, valor: { abertura: null, viga: null } };
      if (h.n1 >= N - 1) {
        aviso('error', 'abertura.ultimo_nivel', `${F.etiqueta}: la ${txtH} llega al último nivel; no queda dónde apoyar la viga.`, { celda: celda0, reparaciones: [{ etiqueta: 'Quitar abertura', accion: quitar }] });
        continue;
      }
      if (h.v1 === h.v0) { regla('abertura.un_vano', `${F.etiqueta}: ${txtH} de un vano, no hace falta viga (las verticales quedan).`); continue; }
      const yv = cot(h.n1);
      if (h.viga) {
        const vg = luz <= 2.5 + EPS ? { familia: 'viga_puente' as const, largo: luz <= 1.5 + EPS ? 1.5 : 2.5, excede: false } : { familia: 'viga_celosia' as const, ...elegirViga(luz, cat.medidas.multi.vigasCelosia) };
        if (vg.excede) {
          aviso('error', 'abertura.viga_larga', `${F.etiqueta}: la ${txtH} mide ${fmt(luz)} m y la viga más larga es de ${fmt(Math.max(...cat.medidas.multi.vigasCelosia))}.`, { celda: celda0, reparaciones: [{ etiqueta: 'Achicar la abertura', accion: quitar }] });
          continue;
        }
        for (const [t, lado] of [[0, 'i'], [prof, 'e']] as const) {
          const a = L3(S[h.v0], yv, t);
          const bb = L3(S[h.v1 + 1], yv, t);
          b.elemento({ id: `viga:f${f}v${h.v0}n${h.n1}${lado}`, familia: vg.familia, medidas: { largo: vg.largo }, a, b: bb, primitivas: primViga(a, bb, 0.5), grupo: 'viga' });
        }
        const codigo = b.esq && ctx.catalogo ? `${vg.familia === 'viga_puente' ? 'viga puente' : 'viga celosía'} de ${fmt(vg.largo)}` : '';
        if (Math.abs(vg.largo - luz) > 0.05) aviso('aviso', 'abertura.viga_no_coincide', `${F.etiqueta}: la ${txtH} mide ${fmt(luz)}; la ${codigo} no coincide con los vanos.`, { celda: celda0 });
        regla('abertura.viga', `Propuse ${codigo} sobre la ${txtH} de ${F.etiqueta} (2 vigas, luz ${fmt(luz)}).`, { tipo: 'override', estructuraId: est.id, celda: celdaId(vExt[h.v0], kN(h.n0)), valor: { viga: false } });
      } else {
        const colgadas = (h.v1 - h.v0) * 2;
        aviso('error', 'abertura.sin_viga', `${F.etiqueta}: ${txtH} sin viga puente: ${colgadas} verticales quedan sin apoyo.`, { celda: celda0, reparaciones: [{ etiqueta: 'Agregar viga puente', accion: { tipo: 'overrides', estructuraId: est.id, celdas: celdasH, valor: { viga: null } } }] });
      }
    }

    // relleno y altura
    if (Math.abs(F.relleno.desvio) > CRITERIOS.toleranciaRelleno + EPS) {
      const reps = F.relleno.alternativas.slice(0, 2).map((a) => ({ etiqueta: `${a.etiqueta}: ${a.texto}`, accion: { tipo: 'param', estructuraId: est.id, ruta: `params.frentes.${f}.vanos`, valor: a.vanos.map((x) => x.medida) } as Accion }));
      if (est.medida === 'catalogo') reps.push({ etiqueta: 'Pasar a medida libre', accion: { tipo: 'medida', estructuraId: est.id, modo: 'libre' } });
      aviso('aviso', 'medida.desvio', `${F.etiqueta}: ${F.relleno.texto} (${F.relleno.desvio > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(F.relleno.desvio))} m).`, { reparaciones: reps });
    }
    if (F.relleno.vanos.some((t) => t.libre)) regla('medida.libre', `${F.etiqueta}: ${F.relleno.texto}.`, { tipo: 'medida', estructuraId: est.id, modo: 'catalogo' });
    if (Math.abs(F.alturaReal - F.altura) > 0.25 + EPS) aviso('info', 'altura.real', `${F.etiqueta}: altura real ${fmt(F.alturaReal)} m (pediste ${fmt(F.altura)}).`);
    if (p.bandejaPB && !supEnFrente && cot(0) < CRITERIOS.galiboPeatonal - EPS) {
      aviso('error', 'via.galibo_bandeja', `${F.etiqueta}: la bandeja queda a ${fmt(cot(0))} m; el paso peatonal pide ≥ 2,50.`, { reparaciones: [{ etiqueta: 'Subir la altura', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.altura', valor: r3(p.altura + 0.5) } }] });
    }
  }

  // esquinas: vano de giro y uniones internas
  for (let k = 1; k < nF; k++) {
    const A = res.frentes[k - 1];
    const B = res.frentes[k];
    const modo = B.angulo > 0 ? B.modoEsquina! : B.angulo < 0 ? 'entrante' : 'continuo';
    if (modo === 'vano_giro') vanoDeGiro(b, A, B, prof, p, K);
    const comp = colsCompartidas(b, res, k);
    const alternar: Accion | null = B.angulo > 0 ? { tipo: 'param', estructuraId: est.id, ruta: `params.esquinas.${k - 1}`, valor: modo === 'vano_giro' ? 'vertical_compartida' : 'vano_giro' } : null;
    uniones.push({
      id: `${est.id}:esq${k}`, tipo: 'esquina', estructuraId: est.id, modo,
      a: { estructuraId: est.id, frente: A.f }, b: { estructuraId: est.id, frente: B.f },
      etiqueta: `${A.etiqueta} ↔ ${B.etiqueta} · ${modo === 'vertical_compartida' ? 'vertical compartida' : modo === 'vano_giro' ? `vano de giro ${fmt(prof)}` : modo === 'entrante' ? 'esquina entrante' : 'continuo'}`,
      editable: B.angulo > 0, alternar, compartidas: comp,
    });
    if (B.angulo !== 0) regla('esquina', `Esquina ${A.etiqueta} ↔ ${B.etiqueta}: ${modo === 'vano_giro' ? `vano de giro de ${fmt(prof)}` : 'vertical compartida'}.`, alternar || undefined);
  }

  if (p.anclada !== false && anclTot < CRITERIOS.anclajeMinimo) {
    let agregados = 0;
    for (const c of anclCandidatos) {
      if (anclTot >= CRITERIOS.anclajeMinimo) break;
      if (!c.ok) continue;
      const key = `${c.col}@${c.k}`;
      if (anclNodos.has(key)) continue;
      anclNodos.add(key);
      b.nodo(c.col, c.k, { anclaje: { retiro, dir: c.dir } });
      anclTot++;
      agregados++;
    }
    if (agregados) regla('anclaje.minimo', `Completé el mínimo de ${CRITERIOS.anclajeMinimo} anclajes en el último nivel.`);
  }
  if (diagTxt.length) regla('diag.reparto', `Diagonales roseta a roseta en extremos y cada ≤${CRITERIOS.diagonalCadaVanos} vanos, en zigzag (${diagTxt.join(' · ')}).`);
  if (barandasLados) regla('baranda.lados', `Barandas dobles y rodapiés en los lados abiertos${retiro > CRITERIOS.retiroLibre ? ' (también del lado fachada: retiro ' + fmt(retiro) + ')' : ''}.`);
  if (p.anclada !== false) {
    const extra = anclTot - anclBase;
    if (extra > 0 && cubierta !== 'nada') regla('anclaje.cubierta', `Agregué ${extra} anclajes por la ${cubierta === 'lona' ? 'lona' : 'media sombra'}.`, { tipo: 'param', estructuraId: est.id, ruta: 'params.densificarAnclajes', valor: false });
    if (anclMens) regla('anclaje.mensulas', `Agregué ${anclMens} anclajes por las ménsulas (M09 pendiente).`);
    if (anclTot < CRITERIOS.anclajeMinimo && !soportes.length) aviso('aviso', 'anclaje.minimo', `${est.nombre}: ${anclTot} anclajes, el mínimo es ${CRITERIOS.anclajeMinimo}.`);
  } else {
    const Hm = res.alturaReal;
    const Bm = prof + (p.pataDeGallo ? 3 : 0);
    if (Hm / Bm > CRITERIOS.hbMax) avisos.push(avisoEsbeltez(est, Hm, Bm, 'params.anclada'));
  }
  if (p.bandejaPB && !soportes.length) regla('via.bandeja', 'Bandeja de fenólico en PB, esferas y recubrimiento de verticales hasta 2 m.');
  avisoPasoBajoBandeja(avisos, est, p, prof, 1.25, !soportes.length);
  if (!soportes.length && res.ARR > CRITERIOS.arranqueMax + EPS) {
    const alt = r3(p.altura - res.ARR + 0.25);
    aviso('aviso', 'apoyo.arranque', `${est.nombre}: arranque a ${fmt(res.ARR)} m; el tornillón queda muy extendido (útil ≈ ${fmt(CRITERIOS.arranqueMax)}). Sumá un VERT-050 de suplemento abajo o revisá la altura ⚠.`, { reparaciones: [{ etiqueta: `Altura ${fmt(alt)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.altura', valor: alt } }] });
  }
  if ((p.mensulas || []).length || Object.values(ov).some((o) => o.mensula)) validarMensulas(avisos, reglas, est, p, retiro, cat.medidas.multi.mensulas);

  const esq = b.esq;
  const huella = envolvente(esq.columnas.map((c) => c.p));
  return {
    esqueleto: esq,
    avisos,
    reglas,
    metricas: {
      m2: r3(sum(res.frentes.map((F) => sum(F.vanos) * F.alturaReal))),
      ml: r3(sum(res.frentes.map((F) => sum(F.vanos)))),
      alturaReal: res.alturaReal,
      huella,
    },
    puertos: puertosFachada(res),
    info: { prof, ARR: res.ARR, frentes: res.frentes.map(sinMarco), soporteTop, colsDeFrente },
    uniones,
  };
}

/** Columnas de B que ya eran de frentes anteriores. */
function colsCompartidas(b: ConstructorEsqueleto, res: FrentesResueltos, k: number): number {
  const B = res.frentes[k];
  let n = 0;
  for (const s of [B.S[0], B.S[1] ?? B.S[0]]) for (const t of [0, res.prof]) {
    const q = B.mk.W(s, 0, t);
    const c = b.colEn([q[0], q[2]]);
    if (c && !c.id.startsWith(`f${k}c`)) n++;
  }
  return n;
}

function vanoDeGiro(b: ConstructorEsqueleto, A: Frente, B: Frente, prof: number, p: ParamsFachada, K: (y: number) => number): void {
  const W = A.mk.W;
  const sA = A.S[A.S.length - 1];
  const P2 = (s: number, t: number): V2 => {
    const q = W(s, 0, t);
    return [q[0], q[2]];
  };
  const yTop = Math.min(A.yTopCol, B.yTopCol);
  const cA = b.colEn(P2(sA, prof))!.id;
  const cAi = b.colEn(P2(sA, 0))!.id;
  const g = b.columna(`g${B.f}`, P2(sA + prof, prof), A.ARR, yTop, 'base_regulable');
  const bq = B.mk.W(B.S[0], 0, prof);
  const cB = b.colEn([bq[0], bq[2]])!.id;
  const nA: V2 = [A.mk.n[0], A.mk.n[1]];
  const v1 = b.vano(`g${B.f}a`, cA, g, 'exterior', { normal: nA });
  const v2 = b.vano(`g${B.f}b`, g, cB, 'exterior', { normal: [A.mk.u[0], A.mk.u[1]] });
  const trA = b.vanoEntre(cAi, cA)!.id;
  const trB = b.vanoEntre(cAi, cB)?.id;
  if (!trB) return;
  const pano = b.pano(`g${B.f}p`, [trA, v1, v2, trB], { sentido: v1 });
  if (p.viaPublica) {
    b.elemento({ id: `recub:${g}`, familia: 'recubrimiento', medidas: { largo: 2.0 }, a: W(sA + prof, A.ARR, prof), b: W(sA + prof, Math.min(2, yTop), prof), grupo: 'via_publica', sistema: 'comun' });
    b.elemento({ id: `esf:${g}`, familia: 'esfera', medidas: {}, a: W(sA + prof, 1, prof), b: W(sA + prof, 1, prof), grupo: 'via_publica', sistema: 'comun' });
  }
  A.niveles.forEach((lv) => {
    if (!lv.plataforma || lv.cota > yTop) return;
    const k = K(lv.cota);
    b.celdaPano(pano, k, { plataforma: 'tablones' });
    for (const v of [v1, v2]) b.celda(v, k, { baranda: lv.faldon ? 1 : 2 });
  });
}

function avisoPasoBajoBandeja(avisos: Omit<Aviso, 'id'>[], est: Estructura, p: { bandejaPB: boolean; viaPublica: boolean }, prof: number, profSugerida: number, aplica: boolean): void {
  if (!aplica || !p.bandejaPB || !p.viaPublica) return;
  const paso = r3(prof - 0.05);
  if (paso >= CRITERIOS.pasoPeatonal - EPS) return;
  avisos.push({
    regla: 'via.paso_bandeja', nivel: 'aviso', estructuraId: est.id,
    texto: `${est.nombre}: el paso peatonal bajo la bandeja queda en ${fmt(paso)} m entre verticales; se pide ≥ ${fmt(CRITERIOS.pasoPeatonal)} (pantalla de ${fmt(profSugerida)} ⚠ a confirmar).`,
    reparaciones: [{ etiqueta: `Profundidad ${fmt(profSugerida)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.profundidad', valor: profSugerida } }],
  });
}
export { avisoPasoBajoBandeja };

function validarMensulas(avisos: Omit<Aviso, 'id'>[], reglas: Omit<Regla, 'id'>[], est: Estructura, p: ParamsFachada, retiro: number, mensulas: number[]): void {
  const specs: { lado: 'afuera' | 'fachada'; brazo: number }[] = [...(p.mensulas || [])];
  for (const o of Object.values(est.overrides || {})) if (o.mensula) specs.push({ lado: o.mensula, brazo: specs.find((s) => s.lado === o.mensula)?.brazo || p.brazoMensula || 0.73 });
  for (const sp of specs) {
    if (sp.lado === 'fachada' && sp.brazo > retiro - 0.05 + EPS) {
      const cabe = [...mensulas].sort((a, b) => b - a).find((x) => x <= retiro - 0.05 + EPS);
      const rep: Aviso['reparaciones'] = [];
      if (cabe) rep.push({ etiqueta: `Usar ménsula de ${fmt(cabe)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.mensulas', valor: p.mensulas.map((x) => (x.lado === 'fachada' ? { ...x, brazo: cabe } : x)) } });
      rep.push({ etiqueta: `Retirar a ${fmt(sp.brazo + 0.1)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.retiro', valor: r3(sp.brazo + 0.1) } });
      avisos.push({ regla: 'mensula.choca', nivel: 'error', estructuraId: est.id, texto: `La ménsula de ${fmt(sp.brazo)} hacia la fachada choca: el retiro es ${fmt(retiro)}.`, reparaciones: rep });
      break;
    }
  }
  const afuera = specs.filter((s) => s.lado === 'afuera');
  if (afuera.some((s) => s.brazo >= 0.73 - EPS)) avisos.push({ regla: 'mensula.afuera', nivel: 'aviso', estructuraId: est.id, texto: `Ménsula hacia afuera de ${fmt(Math.max(...afuera.map((s) => s.brazo)))}: verificar M09 y contrapeso. ${PREDIMENSIONADO}.`, reparaciones: [] });
  if (specs.length) reglas.push({ regla: 'mensula', estructuraId: est.id, texto: `Ménsulas ${[...new Set(specs.map((s) => (s.lado === 'fachada' ? 'hacia la fachada' : 'hacia afuera')))].join(' y ')} con sus tablones y barandas en el borde.` });
}

// ───────────── registro ─────────────
const CAMPOS: Campo[] = [
  { ruta: 'params.frentes', etiqueta: 'Frentes', tipo: 'frentes', grupo: 'Medidas', ayuda: 'Largo de cada frente y el ángulo con el anterior (90 = esquina, −90 = entrante).' },
  { ruta: 'params.altura', etiqueta: 'Altura', tipo: 'medida', unidad: 'm', min: 1.5, max: 120, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad', tipo: 'medida', unidad: 'm', min: 0.3, max: 3, catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.retiro', etiqueta: 'Retiro a la fachada', tipo: 'medida', unidad: 'm', min: 0, max: 3, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.niveles', etiqueta: 'Niveles', tipo: 'opcion', opciones: [{ valor: 'arriba', etiqueta: 'Cada 2 m' }, { valor: 'pantalla', etiqueta: 'Pantalla' }], grupo: 'Medidas' },
  { ruta: 'params.modoPlataforma', etiqueta: 'Plataformas', tipo: 'opcion', opciones: [{ valor: 'cada_2m', etiqueta: 'Cada 2 m' }, { valor: 'cada_nivel', etiqueta: 'Cada nivel' }, { valor: 'solo_trabajo', etiqueta: 'Solo arriba' }, { valor: 'ninguna', etiqueta: 'Ninguna' }], grupo: 'Medidas' },
  { ruta: 'params.ajuste', etiqueta: 'Vano de ajuste', tipo: 'opcion', opciones: [{ valor: 'final', etiqueta: 'Al final' }, { valor: 'centrado', etiqueta: 'Centrado' }], grupo: 'Medidas' },
  { ruta: 'params.bandejaPB', etiqueta: 'Bandeja en PB', tipo: 'bool', grupo: 'Protección' },
  { ruta: 'params.viaPublica', etiqueta: 'Sobre vía pública', tipo: 'bool', grupo: 'Protección' },
  { ruta: 'params.cubierta', etiqueta: 'Cubierta', tipo: 'opcion', opciones: [{ valor: 'nada', etiqueta: 'Nada' }, { valor: 'media_sombra', etiqueta: 'Media sombra' }, { valor: 'lona', etiqueta: 'Lona' }], grupo: 'Protección' },
  { ruta: 'params.concertina', etiqueta: 'Concertina', tipo: 'bool', grupo: 'Protección' },
  { ruta: 'params.mensulas', etiqueta: 'Ménsulas', tipo: 'texto', grupo: 'Avanzado', ayuda: 'Lista de {lado, brazo, desdeNivel, hastaNivel}.' },
  { ruta: 'params.brazoMensula', etiqueta: 'Brazo de ménsula', tipo: 'medida', unidad: 'm', catalogo: 'mensulas', grupo: 'Avanzado' },
  { ruta: 'params.anclada', etiqueta: 'Anclada', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.terreno', etiqueta: 'Terreno', tipo: 'opcion', opciones: [{ valor: 'cemento', etiqueta: 'Cemento' }, { valor: 'tierra', etiqueta: 'Tierra' }, { valor: 'losa', etiqueta: 'Losa' }], grupo: 'Apoyo' },
  { ruta: 'params.accesos', etiqueta: 'Accesos', tipo: 'texto', grupo: 'Accesos', ayuda: "'auto', una cantidad o [{f, v}]." },
];

const PRESETS: Preset[] = [
  { id: 'pantalla', nombre: 'Pantalla peatonal', icono: 'pantalla', descripcion: 'Bandeja de fenólico sobre la vereda con esferas y recubrimiento. 3, 6 u 8 m.', params: { frentes: [{ largo: 12.5 }], altura: 3, profundidad: 1.25, niveles: 'pantalla', modoPlataforma: 'ninguna', bandejaPB: true, viaPublica: true, accesos: [] } },
  { id: 'estructura_pantalla', nombre: 'Estructura + pantalla', icono: 'fachada', tecla: 'F', descripcion: 'Fachada completa con bandeja en PB, niveles cada 2 m y media sombra.', params: { frentes: [{ largo: 14 }, { largo: 8, angulo: 90 }], altura: 18, bandejaPB: true, viaPublica: true, cubierta: 'media_sombra', esquinas: ['vertical_compartida'] } },
  { id: 'estructura', nombre: 'Estructura sin pantalla', icono: 'fachada', descripcion: 'Patio, medianera o contrafrente. Igual que la fachada, sin bandeja.', params: {} },
  { id: 'voladizo', nombre: 'Voladizo con ménsulas', icono: 'voladizo', descripcion: 'Andamio retirado (marquesina o retiro) que se acerca a la fachada con ménsulas.', params: { frentes: [{ largo: 12.5 }], altura: 15, retiro: 1.2, bandejaPB: true, viaPublica: true, mensulas: [{ lado: 'fachada', brazo: 1.09, desdeNivel: 1 }], brazoMensula: 1.09 } },
];

export const FACHADA: Tipologia<ParamsFachada> = {
  id: 'fachada',
  version: 1,
  nombre: 'Fachada multidireccional',
  descripcion: 'Andamio de fachada: frentes en L, pantalla, bandeja, ménsulas, cubierta y vía pública.',
  categoria: 'fachada',
  sistemas: ['multi'],
  apoyos: ['suelo', 'sobre_estructura'],
  porDefecto: () => structuredClone(P_FACHADA_BASE),
  normalizar: normalizarFachada,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarFachadaMulti,
};

