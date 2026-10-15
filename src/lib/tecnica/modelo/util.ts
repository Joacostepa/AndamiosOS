/** Utilidades puras del núcleo (geometría, redondeo, formato es-AR). */
import type { Poligono, V2, V3 } from './tipos.ts';

export const EPS = 1e-6;
/** Milímetros enteros (para claves de nodo). */
export const mm = (v: number): number => Math.round(v * 1000);
export const r3 = (v: number): number => Math.round(v * 1000) / 1000;
export const deg = (r: number): number => (r * Math.PI) / 180;
export const clone = <T>(o: T): T => structuredClone(o);
export const mod = (a: number, b: number): number => ((a % b) + b) % b;
export const sum = (arr: number[]): number => arr.reduce((s, x) => s + x, 0);
export const ceil10 = (v: number): number => Math.ceil(v * 10 - 1e-6) / 10;
export const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Número con coma decimal: fmt(14) → "14,00". */
export const fmt = (v: number, d = 2): string =>
  (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
export const fmtKg = (v: number): string => Math.round(v).toLocaleString('es-AR');

export const dirDe = (rumbo: number): V2 => [Math.cos(deg(rumbo)), Math.sin(deg(rumbo))];
export const normalDe = (rumbo: number): V2 => [-Math.sin(deg(rumbo)), Math.cos(deg(rumbo))];
export const rot2 = ([x, z]: V2, r: number): V2 => [
  x * Math.cos(deg(r)) - z * Math.sin(deg(r)),
  x * Math.sin(deg(r)) + z * Math.cos(deg(r)),
];
export const angulo2 = ([x, z]: V2): number => (Math.atan2(z, x) * 180) / Math.PI;

export interface Marco {
  O: V2;
  u: V2;
  n: V2;
  rumbo: number;
  /** local (s, y, t) → mundo (x, y, z) */
  W: (s: number, y: number, t: number) => V3;
  /** local (s, t) → planta (x, z) */
  P: (p: V2) => V2;
}

/** Marco local (s a lo largo, t hacia afuera, y arriba) → mundo. */
export function marco(O: V2, rumbo: number): Marco {
  const u = dirDe(rumbo);
  const n = normalDe(rumbo);
  const W = (s: number, y: number, t: number): V3 => [
    r3(O[0] + u[0] * s + n[0] * t),
    r3(y),
    r3(O[1] + u[1] * s + n[1] * t),
  ];
  const P = (p: V2): V2 => [r3(O[0] + u[0] * p[0] + n[0] * p[1]), r3(O[1] + u[1] * p[0] + n[1] * p[1])];
  return { O, u, n, rumbo, W, P };
}

/** Pasa un punto de planta de mundo a local de un marco. */
export function aLocal(m: Marco, q: V2): V2 {
  const dx = q[0] - m.O[0];
  const dz = q[1] - m.O[1];
  return [r3(dx * m.u[0] + dz * m.u[1]), r3(dx * m.n[0] + dz * m.n[1])];
}

export const dist2 = (a: V2, b: V2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const dist3 = (a: V3, b: V3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function dentroPoligono(x: number, z: number, poly: Poligono): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c;
  }
  return c;
}

export function enBorde(x: number, z: number, poly: Poligono, tol = 0.02): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, z1] = poly[j];
    const [x2, z2] = poly[i];
    const L = Math.hypot(x2 - x1, z2 - z1) || 1;
    const t = ((x - x1) * (x2 - x1) + (z - z1) * (z2 - z1)) / (L * L);
    if (t < -0.001 || t > 1.001) continue;
    if (Math.hypot(x - (x1 + t * (x2 - x1)), z - (z1 + t * (z2 - z1))) < tol) return true;
  }
  return false;
}

/** Área con signo (positiva si es antihoraria en (x, z)). */
export function areaPoligono(poly: Poligono): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

export function centroide(pts: V2[]): V2 {
  if (!pts.length) return [0, 0];
  return [sum(pts.map((p) => p[0])) / pts.length, sum(pts.map((p) => p[1])) / pts.length];
}

/** Envolvente convexa (monotone chain), antihoraria. */
export function envolvente(pts: V2[]): Poligono {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: V2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

/** Lee una ruta tipo "params.frentes.1.largo". */
export function getRuta(obj: unknown, ruta: string): unknown {
  let o: unknown = obj;
  for (const k of ruta.split('.')) {
    if (o === null || o === undefined || typeof o !== 'object') return undefined;
    o = (o as Record<string, unknown>)[k];
  }
  return o;
}

/** Escribe (mutando) una ruta; `undefined` borra la clave. */
export function setRuta(obj: Record<string, unknown>, ruta: string, valor: unknown): void {
  const partes = ruta.split('.');
  let o: Record<string, unknown> = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    const k = partes[i];
    if (o[k] === undefined || o[k] === null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(partes[i + 1]) ? [] : {};
    o = o[k] as Record<string, unknown>;
  }
  const ult = partes[partes.length - 1];
  if (valor === undefined) delete o[ult];
  else o[ult] = valor;
}

export const masCercano = (lista: number[], v: number): number =>
  lista.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), lista[0]);

export const enLista = (lista: number[], v: number, tol = 0.0015): boolean => lista.some((x) => Math.abs(x - v) <= tol);

export const num = (v: unknown, def: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
