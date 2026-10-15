/**
 * Fachada de bastidores (port de construirFachadaBastidor): tiras de bastidores 1,30 × 1,80 (supuesto Odoo),
 * riendas, bastidor baranda, cómputo por kit y esquina convexa con caño y grampas.
 */
import type { Accion, Aviso, Elemento, Estructura, Regla, UnionResuelta, V2, V3 } from '../tipos.ts';
import type { CtxGenerar, Generado, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { ConstructorEsqueleto, celdaId } from '../esqueleto/esqueleto.ts';
import { canoPara } from '../medida/ajustes.ts';
import { resolverFrentes, type Frente } from './comunes/frentes.ts';
import { tiraBastidor } from './comunes/tira-bastidor.ts';
import { puertosFachada, sinMarco } from './comunes/util-tipologias.ts';
import { avisoPasoBajoBandeja, FACHADA, type ParamsFachada } from './fachada.ts';
import { ceil10, envolvente, EPS, fmt, r3, sum } from '../util.ts';

import { generarFachadaMulti, normalizarFachada } from './fachada.ts';
import { masCercano } from '../util.ts';
import type { Sistema } from '../tipos.ts';
import { medidasPorDefecto } from '../catalogo/catalogo.ts';
import { rellenarLargo } from '../medida/rellenar.ts';
import { arrDesde, nivelesBastidor, nivelesMulti, nivelesPantalla } from '../medida/alturas.ts';

const nTab = (w: number) => Math.max(1, Math.round(w / CRITERIOS.anchoTablon));

export function generarFachadaBastidor(est: Estructura & { params: ParamsFachada }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const cat = ctx.catalogo;
  const res = resolverFrentes(p, 'bastidor', 'catalogo', cat.medidas, { soporteTop: ctx.relaciones.soportes[0]?.yTope ?? null });
  const w = res.prof;
  const avisos: Omit<Aviso, 'id'>[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const aviso = (nivel: Aviso['nivel'], regla: string, texto: string, extra: Partial<Aviso> = {}) => avisos.push({ nivel, regla, texto, estructuraId: est.id, reparaciones: [], ...extra });
  const regla = (r: string, texto: string, deshacer?: Accion) => reglas.push({ regla: r, texto, estructuraId: est.id, ...(deshacer ? { deshacer } : {}) });
  const cotas = new Set<number>();
  for (const F of res.frentes) {
    cotas.add(F.ARR);
    for (const lv of F.niveles) cotas.add(lv.cota);
  }
  const b = new ConstructorEsqueleto('bastidor', [...cotas]);
  b.esq.terreno = p.terreno;
  const ov = est.overrides || {};
  let anclTot = 0;
  const uniones: UnionResuelta[] = [];
  for (const F of res.frentes) {
    const m = F.vanos.length;
    const N = F.niveles.length;
    const kN = (n: number) => b.k(F.niveles[n].cota);
    const O = (v: number, n: number) => ({ ...(ov[`f${F.f}e${v}@N${n}`] || {}), ...(ov[celdaId(`f${F.f}e${v}`, kN(n))] || {}) });
    const accesos = ctx.relaciones.accesoPorTorre ? [] : Array.isArray(p.accesos) ? p.accesos.filter((a) => a.f === F.f).map((a) => a.v) : F.f === 0 ? [Math.min(1, m - 1)].filter((v) => Math.abs(F.vanos[v] - 2.5) < EPS) : [];
    const tira = tiraBastidor(b, {
      prefijo: `f${F.f}`, mk: F.mk, S: F.S, vanos: F.vanos, w, niveles: F.niveles, ARR: F.ARR, yTopCol: F.yTopCol, O,
      accesos, viaPublica: p.viaPublica, retiro: p.retiro, laterales: [F.f === 0, F.f === res.frentes.length - 1],
    });
    if (p.anclada !== false) {
      const dn = p.cubierta && p.cubierta !== 'nada' ? 1 : 2;
      F.niveles.forEach((lv, n) => {
        if ((N - 1 - n) % dn) return;
        const fila = (N - 1 - n) / dn;
        for (let i = 0; i <= m; i++) {
          if ((i + fila) % 2 && i !== 0 && i !== m) continue;
          b.nodo(tira.col[i][0], kN(n), { anclaje: { retiro: Math.max(0.15, p.retiro ?? 0.2), dir: [-F.mk.n[0], -F.mk.n[1]] } });
          anclTot++;
        }
      });
    }
    if (p.cubierta && p.cubierta !== 'nada') F.vanos.forEach((_, v) => F.niveles.forEach((lv, n) => {
      if (lv.paso) return;
      b.celda(tira.vExt[v], kN(n), { cerramiento: p.cubierta === 'lona' ? 'lona' : 'media_sombra' });
    }));
    if (Math.abs(F.relleno.desvio) > 0.005) {
      const d = F.relleno.desvio;
      aviso(Math.abs(d) > CRITERIOS.toleranciaRelleno ? 'aviso' : 'info', 'medida.desvio', `${F.etiqueta}: ${F.relleno.texto} (${d > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(d))} m; el bastidor no tiene vano de ajuste).`, {
        reparaciones: F.relleno.alternativas.slice(0, 2).map((a) => ({ etiqueta: `${a.etiqueta}: ${a.texto}`, accion: { tipo: 'param', estructuraId: est.id, ruta: `params.frentes.${F.f}.vanos`, valor: a.vanos.map((x) => x.medida) } as Accion })),
      });
    }
    if (Math.abs(F.alturaReal - F.altura) > 0.25 + EPS) aviso('info', 'altura.real', `${F.etiqueta}: altura real ${fmt(F.alturaReal)} m con cuerpos de 1,80 (pediste ${fmt(F.altura)}).`);
  }
  for (let k = 1; k < res.frentes.length; k++) {
    const A = res.frentes[k - 1];
    const B = res.frentes[k];
    const e = B.angulo > 0 ? esquinaBastidor(b, k, A, B, w, p, cat.medidas.canos) : null;
    uniones.push({ id: `${est.id}:esq${k}`, tipo: 'esquina', estructuraId: est.id, modo: 'nudos_giratorios', a: { estructuraId: est.id, frente: A.f }, b: { estructuraId: est.id, frente: B.f }, etiqueta: `${A.etiqueta} ↔ ${B.etiqueta} · ${e ? 'caño y grampas' : 'nudos giratorios'}`, editable: false, alternar: null, compartidas: 0 });
    if (e) regla('esquina.bastidor', `Esquina ${A.etiqueta} ↔ ${B.etiqueta} de bastidor: ${B.etiqueta} arranca a ${fmt(e.sep)} con su propio par de pies; el cuadro de esquina va en caño y grampas (parante de esquina, tablones de ${fmt(e.largoTab)}, baranda doble y rodapié) (supuesto ⚠).`);
    else regla('esquina.bastidor', `Esquina ${A.etiqueta} ↔ ${B.etiqueta} de bastidor (supuesto ⚠).`);
  }
  if ((p.mensulas || []).length) aviso('info', 'mensula.bastidor', 'Las ménsulas son de multidireccional: en bastidor no se arman.', { reparaciones: [{ etiqueta: 'Pasar a multidireccional', accion: { tipo: 'sistema', estructuraId: est.id, sistema: 'multi' } }] });
  regla('bastidor.supuesto', `Bastidor 1,30 × 1,80 (supuesto Odoo), ${p.cuerpo === 'JR' ? 'JR' : 'STD'} 2,50. Cómputo por kit.`);
  if (anclTot < CRITERIOS.anclajeMinimo && p.anclada !== false) aviso('aviso', 'anclaje.minimo', `${est.nombre}: ${anclTot} anclajes, el mínimo es ${CRITERIOS.anclajeMinimo}.`);
  avisoPasoBajoBandeja(avisos, est, p, w, 1.3, true);
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: r3(sum(res.frentes.map((F) => sum(F.vanos) * F.alturaReal))), ml: r3(sum(res.frentes.map((F) => sum(F.vanos)))), alturaReal: res.alturaReal, huella: envolvente(b.esq.columnas.map((c) => c.p)) },
    puertos: puertosFachada(res),
    info: { prof: w, ARR: res.ARR, frentes: res.frentes.map(sinMarco) },
    uniones,
  };
}

function cruceRectas(p: V2, u: V2, q: V2, v: V2): V2 | null {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const l = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [r3(p[0] + u[0] * l), r3(p[1] + u[1] * l)];
}

/** Esquina convexa de bastidor: parante de caño, travesaños, tablones de w + sep, barandas y rodapiés (elementos). */
function esquinaBastidor(b: ConstructorEsqueleto, k: number, A: Frente, B: Frente, w: number, p: ParamsFachada, canos: number[]): { sep: number; largoTab: number } | null {
  const g = `esquina${k}`;
  const sA = A.S[A.S.length - 1];
  const sB = B.S[0];
  const xz = (q: V3): V2 => [q[0], q[2]];
  const extA = xz(A.mk.W(sA, 0, w));
  const extB = xz(B.mk.W(sB, 0, w));
  const intA = xz(A.mk.W(sA, 0, 0));
  const intB = xz(B.mk.W(sB, 0, 0));
  const esq = cruceRectas(extA, A.mk.u, extB, B.mk.u);
  if (!esq) return null;
  const P3 = (q: V2, y: number): V3 => [q[0], r3(y), q[1]];
  const ARR = A.ARR;
  const yTop = Math.min(A.yTopCol, B.yTopCol);
  const el = (e: Omit<Elemento, 'grupo'>) => b.elemento({ ...e, grupo: g });
  el({ id: `${g}:pbase`, familia: 'base_regulable', medidas: p.movil ? { variante: 'movil' } : {}, a: P3(esq, 0), b: P3(esq, ARR), sistema: 'comun' });
  if (p.terreno === 'tierra') el({ id: `${g}:pmad`, familia: 'accesorio', medidas: { variante: 'madera_base' }, a: P3(esq, -0.1), b: P3(esq, 0), sistema: 'comun' });
  const maxCano = Math.max(...canos);
  let y = ARR;
  let kk = 0;
  while (yTop - y > 0.05) {
    const resto = r3(yTop - y);
    const l = Math.min(maxCano, canos.find((x) => x >= ceil10(resto) - EPS) ?? maxCano);
    if (kk > 0) el({ id: `${g}:pemp${kk}`, familia: 'manguito', medidas: {}, a: P3(esq, y), b: P3(esq, y), sistema: 'comun' });
    el({ id: `${g}:pv${kk}`, familia: 'cano', medidas: { largo: l }, a: P3(esq, y), b: P3(esq, Math.min(yTop, y + l)), sistema: 'comun' });
    y = r3(y + l);
    kk++;
  }
  if (p.viaPublica) {
    el({ id: `${g}:precub`, familia: 'recubrimiento', medidas: { largo: 2.0 }, a: P3(esq, ARR), b: P3(esq, 2), sistema: 'comun' });
    el({ id: `${g}:pesf`, familia: 'esfera', medidas: {}, a: P3(esq, 1), b: P3(esq, 1), sistema: 'comun' });
  }
  const dist = (a: V2, c: V2) => r3(Math.hypot(c[0] - a[0], c[1] - a[1]));
  const lados: [V2, V2, string][] = [[extA, esq, 'a'], [extB, esq, 'b']];
  const largoTab = dist(extB, esq);
  const nt = nTab(w);
  const tubo = (id: string, q0: V2, q1: V2, yy: number) => {
    const L = dist(q0, q1) || 1;
    const d = Math.min(0.05, L / 4);
    const en = (a: V2, c: V2): V3 => [r3(a[0] + ((c[0] - a[0]) * d) / L), r3(yy), r3(a[1] + ((c[1] - a[1]) * d) / L)];
    el({ id, familia: 'cano', medidas: { largo: canoPara(dist(q0, q1), canos) }, a: P3(q0, yy), b: P3(q1, yy), sistema: 'comun' });
    el({ id: `${id}:g0`, familia: 'grampa_fija', medidas: {}, a: en(q0, q1), b: en(q0, q1), sistema: 'comun' });
    el({ id: `${id}:g1`, familia: 'grampa_fija', medidas: {}, a: en(q1, q0), b: en(q1, q0), sistema: 'comun' });
  };
  A.niveles.forEach((lv, n) => {
    const c = lv.cota;
    if (c > yTop + EPS) return;
    for (const [q0, q1, l] of lados) tubo(`${g}:tr${l}_${n}`, q0, q1, c);
    tubo(`${g}:vin${n}`, intA, intB, c - 0.3);
    for (let j = 0; j < nt; j++) {
      const t = r3(((j + 0.5) * w) / nt);
      el({ id: `${g}:tab${n}_${j}`, familia: 'tablon', medidas: { largo: largoTab }, a: B.mk.W(sB, c, t), b: B.mk.W(sB - largoTab, c, t), sistema: 'comun' });
    }
    if (lv.bandeja) el({ id: `${g}:fen${n}`, familia: 'fenolico', medidas: { ancho: w }, a: B.mk.W(sB, c + 0.04, 0), b: B.mk.W(sB - largoTab, c + 0.04, w), medida: r3(w * largoTab), sistema: 'comun' });
    for (const [q0, q1, l] of lados) {
      for (const dy of [0.5, 1.0]) tubo(`${g}:bar${l}_${n}_${dy * 10}`, q0, q1, c + dy);
      const dd = dist(q0, q1);
      el({ id: `${g}:rod${l}_${n}`, familia: 'rodapie', medidas: { largo: dd < 1 ? 0.9 : dd < 1.2 ? 1.09 : dd < 1.4 ? 1.3 : 1.5 }, a: P3(q0, c + 0.08), b: P3(q1, c + 0.08), sistema: 'bastidor' });
    }
    if (p.cubierta && p.cubierta !== 'nada' && !lv.paso) {
      const y0 = n === 0 ? ARR : A.niveles[n - 1].cota;
      for (const [q0, q1, l] of lados) el({ id: `${g}:cub${l}_${n}`, familia: p.cubierta === 'lona' ? 'lona' : 'media_sombra', medidas: {}, a: P3(q0, y0), b: P3(q1, c), medida: r3(dist(q0, q1) * (c - y0)), sistema: 'comun' });
    }
  });
  return { sep: sB, largoTab };
}

export const FACHADA_BASTIDOR: Tipologia<ParamsFachada> = {
  ...FACHADA,
  id: 'fachada_bastidor',
  nombre: 'Fachada de bastidores',
  descripcion: 'Cuerpos de 1,30 × 2,50 × 1,80 con riendas y bastidor baranda. Cómputo por kit.',
  sistemas: ['bastidor', 'multi'],
  presets: [{ id: 'fachada_bastidor', nombre: 'Fachada de bastidores', icono: 'bastidor', sistema: 'bastidor', descripcion: 'Cuerpos de 1,30 × 2,50 × 1,80 con riendas y bastidor baranda.', params: { frentes: [{ largo: 15 }], altura: 10.25, profundidad: 1.3 } }],
  porDefecto: () => ({ ...FACHADA.porDefecto(), profundidad: 1.3 }),
};

/** Fachada: multi o bastidor según el sistema de la estructura. */
export function generarFachada(est: Estructura & { params: ParamsFachada }, ctx: CtxGenerar): Generado {
  return est.sistema === 'bastidor' ? generarFachadaBastidor(est, ctx) : generarFachadaMulti(est, ctx);
}

function alturaRealAprox(sistema: Sistema, p: ParamsFachada): number {
  const m = medidasPorDefecto();
  if (sistema === 'bastidor') return nivelesBastidor(p.altura, !!p.bandejaPB, m.bastidor).alturaReal;
  if (p.niveles === 'pantalla') return nivelesPantalla(p.altura).alturaReal;
  return nivelesMulti(p.altura, arrDesde(p.altura - 1), p).alturaReal;
}

/** Cambio de sistema de una fachada (port de cambiarSistema): profundidad, relleno y altura real. */
export function cambiarSistemaFachada(params: ParamsFachada, de: Sistema, a: Sistema): { params: ParamsFachada; avisos: string[] } {
  const p = structuredClone(params);
  const m = medidasPorDefecto();
  const avisos: string[] = [];
  const profAntes = p.profundidad;
  p.profundidad = a === 'bastidor' ? masCercano(m.bastidor.anchos, profAntes) : masCercano(m.multi.profundidades, profAntes);
  if (p.profundidad !== profAntes) avisos.push(`Profundidad ${fmt(profAntes)} → ${fmt(p.profundidad)} (${a === 'bastidor' ? (p.profundidad < 1 ? 'bastidor pasillo' : 'bastidor de andamio') : 'multidireccional'}).`);
  p.frentes.forEach((fr, i) => {
    delete fr.vanos;
    const r = rellenarLargo(fr.largo, a, { ajuste: p.ajuste });
    const d = r.desvio;
    const txt = Math.abs(d) < 0.005 ? 'exacto' : d > 0 ? `sobran ${fmt(d)} m` : `faltan ${fmt(-d)} m`;
    avisos.push(`Frente ${'ABCDEFGHIJ'[i]}: ${r.texto} (${txt}).`);
  });
  const hA = alturaRealAprox(de, p);
  const hD = alturaRealAprox(a, p);
  if (Math.abs(hA - hD) > 0.05) avisos.push(`Altura real ${fmt(hA)} → ${fmt(hD)} m (${a === 'bastidor' ? 'cuerpos de 1,80' : 'niveles cada 2,00'}).`);
  if (a === 'bastidor' && (p.mensulas || []).length) avisos.push('Las ménsulas son de multidireccional: quedan guardadas pero no se arman en bastidor.');
  return { params: p, avisos };
}

/** Fachada completa (multi + bastidor) para el registro. */
export const FACHADA_REGISTRO: Tipologia<ParamsFachada> = { ...FACHADA, sistemas: ['multi', 'bastidor'], generar: generarFachada, cambiarSistema: cambiarSistemaFachada, normalizar: normalizarFachada };
FACHADA_BASTIDOR.generar = generarFachada;
FACHADA_BASTIDOR.cambiarSistema = cambiarSistemaFachada;
