/** Helpers compartidos por las tipologías portadas (puertos, vigas, esbeltez). */
import type { Aviso, Estructura, Puerto, V3 } from '../../tipos.ts';
import { CRITERIOS } from '../../criterios.ts';
import { PREDIMENSIONADO } from '../../constantes.ts';
import { EPS, fmt, marco, r3 } from '../../util.ts';
import type { Frente, FrentesResueltos } from './frentes.ts';

export type PuertoLocal = Omit<Puerto, 'estructuraId'>;

export function puerto(id: string, tipo: Puerto['tipo'], etiqueta: string, p0: V3, p1: V3, normal: V3, cols: number[], altura: number): PuertoLocal {
  const dx = p1[0] - p0[0];
  const dz = p1[2] - p0[2];
  const largo = r3(Math.hypot(dx, dz));
  const d: V3 = largo > EPS ? [r3(dx / largo), 0, r3(dz / largo)] : [1, 0, 0];
  return { id, tipo, etiqueta, p0, p1, normal: normal.map(r3) as V3, d, largo, cols: cols.map(r3), altura: r3(altura) };
}

export function puertosFachada(r: FrentesResueltos): PuertoLocal[] {
  const out: PuertoLocal[] = [];
  const prof = r.prof;
  const nF = r.frentes.length;
  r.frentes.forEach((F, i) => {
    const W = F.mk.W;
    const s0 = F.S[0];
    const s1 = F.S[F.S.length - 1];
    const cols = F.S.map((s) => s - s0);
    out.push(puerto(`f${F.f}:ext`, 'cara', `${F.etiqueta} · cara exterior`, W(s0, 0, prof), W(s1, 0, prof), [F.mk.n[0], 0, F.mk.n[1]], cols, F.alturaReal));
    out.push(puerto(`f${F.f}:base`, 'base', `${F.etiqueta} · base`, W(s0, 0, 0), W(s1, 0, 0), [0, 1, 0], cols, 0));
    if (i === 0) out.push(puerto(`f${F.f}:ini`, 'extremo', `${F.etiqueta} · extremo inicial`, W(s0, 0, prof), W(s0, 0, 0), [-F.mk.u[0], 0, -F.mk.u[1]], [0, prof], F.alturaReal));
    if (i === nF - 1) out.push(puerto(`f${F.f}:fin`, 'extremo', `${F.etiqueta} · extremo final`, W(s1, 0, 0), W(s1, 0, prof), [F.mk.u[0], 0, F.mk.u[1]], [0, prof], F.alturaReal));
  });
  return out;
}

/** Puertos de una caja (torre o pórtico) de L × B en el marco local (0, 0, rumbo 0). */
export function puertosCaja(etiqueta: string, S: number[], L: number, B: number, H: number, yTope: number): PuertoLocal[] {
  const W = marco([0, 0], 0).W;
  return [
    puerto('frente', 'cara', `${etiqueta} · frente`, W(L, 0, 0), W(0, 0, 0), [0, 0, -1], S.map((s) => L - s).reverse(), H),
    puerto('fondo', 'cara', `${etiqueta} · fondo`, W(0, 0, B), W(L, 0, B), [0, 0, 1], S, H),
    puerto('izq', 'cara', `${etiqueta} · lateral izq.`, W(0, 0, 0), W(0, 0, B), [-1, 0, 0], [0, B], H),
    puerto('der', 'cara', `${etiqueta} · lateral der.`, W(L, 0, B), W(L, 0, 0), [1, 0, 0], [0, B], H),
    puerto('tope', 'tope', `${etiqueta} · tope`, W(0, yTope, 0), W(L, yTope, 0), [0, 1, 0], S, yTope),
    puerto('base', 'base', `${etiqueta} · base`, W(0, 0, 0), W(L, 0, 0), [0, 1, 0], S, 0),
  ];
}

/** Viga de celosía de catálogo ≥ luz (o la mayor, con `excede`). */
export function elegirViga(luz: number, lista: number[]): { largo: number; excede: boolean } {
  const ord = [...lista].sort((a, b) => a - b);
  const l = ord.find((x) => x >= luz - 0.05) ?? ord[ord.length - 1];
  return { largo: l, excede: luz > ord[ord.length - 1] + 0.05 };
}

/** Cordones + celosía (representativa) para dibujar una viga. */
export function primViga(a: V3, b: V3, alto: number): { a: V3; b: V3 }[] {
  const prims = [{ a, b }, { a: [a[0], a[1] - alto, a[2]] as V3, b: [b[0], b[1] - alto, b[2]] as V3 }];
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(2, Math.round(L / 0.5));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const P = (t: number, dy: number): V3 => [r3(a[0] + (b[0] - a[0]) * t), r3(a[1] + dy), r3(a[2] + (b[2] - a[2]) * t)];
    prims.push(i % 2 ? { a: P(t0, 0), b: P(t1, -alto) } : { a: P(t0, -alto), b: P(t1, 0) });
  }
  return prims;
}

export function avisoEsbeltez(est: Estructura, H: number, B: number, rutaAnclar: string, ensanchar?: { etiqueta: string; ruta: string; valor: unknown } | null): Omit<Aviso, 'id'> {
  const reps: Aviso['reparaciones'] = [{ etiqueta: 'Anclar', accion: { tipo: 'param', estructuraId: est.id, ruta: rutaAnclar, valor: true } }];
  if (!est.params.pataDeGallo) reps.push({ etiqueta: 'Pata de gallo', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.pataDeGallo', valor: true } });
  if (ensanchar) reps.push({ etiqueta: ensanchar.etiqueta, accion: { tipo: 'param', estructuraId: est.id, ruta: ensanchar.ruta, valor: ensanchar.valor } });
  return { regla: 'esbeltez.hb', nivel: 'aviso', estructuraId: est.id, texto: `${est.nombre}: H/B = ${fmt(H / B, 1)} > ${CRITERIOS.hbMax} sin anclar (H ${fmt(H)}, B ${fmt(B)}). ${PREDIMENSIONADO}.`, reparaciones: reps };
}

/** Frente sin el marco (funciones) para mandar a la UI. */
export function sinMarco(F: Frente): Omit<Frente, 'mk'> {
  const resto: Partial<Frente> = { ...F };
  delete resto.mk;
  return resto as Omit<Frente, 'mk'>;
}
