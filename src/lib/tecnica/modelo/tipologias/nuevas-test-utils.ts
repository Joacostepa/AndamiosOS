/**
 * Chequeos de armado para los tests de las tipologías nuevas (no es un test).
 * Cubren lo que se ve en obra: piezas superpuestas, tubos que pasan por una vertical, verticales dobles en
 * el mismo punto (nodos compartidos sin fusionar), pies repetidos y diagonales que no llegan a un nodo.
 */
import type { Pieza, Resultado } from '../tipos.ts';
import { coordenadasFinitas, diagonalesFueraDeNodo } from '../test-utils.ts';

const MM = (v: number) => Math.round(v * 1000);
const k3 = (q: number[]) => `${MM(q[0])},${MM(q[1])},${MM(q[2])}`;
const esHoriz = (p: Pieza) => (p.familia === 'horizontal' || p.familia === 'baranda' || p.familia === 'rodapie') && Math.abs(p.a[1] - p.b[1]) < 1e-6;

const CONTAR = new Set(['vertical', 'horizontal', 'baranda', 'diagonal', 'tablon', 'tablon_escotilla', 'rodapie', 'viga_celosia', 'mensula', 'cano', 'base_regulable', 'base_fija', 'rueda', 'rueda_freno', 'escalera_interior', 'zanca']);

/** Dos piezas iguales en el mismo lugar (misma familia y código, mismos extremos). */
export function piezasRepetidas(r: Resultado): string[] {
  const vistos = new Map<string, string>();
  const out: string[] = [];
  for (const p of r.piezas) {
    if (!CONTAR.has(p.familia)) continue;
    const a = k3(p.a);
    const b = k3(p.b);
    const k = `${p.familia}|${p.codigo ?? JSON.stringify(p.medidas)}|${a < b ? a + '|' + b : b + '|' + a}`;
    const ya = vistos.get(k);
    if (ya) out.push(`${ya} = ${p.id}`);
    else vistos.set(k, p.id);
  }
  return out;
}

/** Verticales que se pisan en el mismo punto de planta (nodos compartidos sin fusionar). */
export function verticalesDobles(r: Resultado): string[] {
  const porPunto = new Map<string, Pieza[]>();
  for (const p of r.piezas) {
    if (p.familia !== 'vertical' || MM(p.a[0]) !== MM(p.b[0]) || MM(p.a[2]) !== MM(p.b[2])) continue;
    const k = `${MM(p.a[0])}|${MM(p.a[2])}`;
    porPunto.set(k, [...(porPunto.get(k) || []), p]);
  }
  const out: string[] = [];
  for (const g of porPunto.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const lo = Math.max(Math.min(g[i].a[1], g[i].b[1]), Math.min(g[j].a[1], g[j].b[1]));
    const hi = Math.min(Math.max(g[i].a[1], g[i].b[1]), Math.max(g[j].a[1], g[j].b[1]));
    if (hi - lo > 0.01) out.push(`${g[i].id} ⟂ ${g[j].id}`);
  }
  return out;
}

/** Horizontales que pasan por una vertical (una roseta no se puede atravesar). */
export function tubosPorColumna(r: Resultado): string[] {
  const cols = r.piezas.filter((p) => p.familia === 'vertical').map((p) => ({ x: p.a[0], z: p.a[2], y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) }));
  const out: string[] = [];
  for (const p of r.piezas.filter(esHoriz)) {
    const dx = p.b[0] - p.a[0];
    const dz = p.b[2] - p.a[2];
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) continue;
    const L = Math.sqrt(L2);
    for (const c of cols) {
      if (p.a[1] < c.y0 - 1e-6 || p.a[1] > c.y1 + 1e-6) continue;
      const t = ((c.x - p.a[0]) * dx + (c.z - p.a[2]) * dz) / L2;
      if (t * L < 0.01 || (1 - t) * L < 0.01) continue;
      if (Math.hypot(p.a[0] + t * dx - c.x, p.a[2] + t * dz - c.z) < 0.005) {
        out.push(`${p.id} pasa por (${c.x}; ${c.z})`);
        break;
      }
    }
  }
  return out;
}

/** Bases (tornillón) a menos de 15 cm entre sí. */
export function piesRepetidos(r: Resultado): string[] {
  const pies = r.piezas.filter((p) => p.familia === 'base_regulable' || p.familia === 'base_fija' || p.familia === 'rueda' || p.familia === 'rueda_freno').map((p) => [p.a[0], p.a[2], p.id] as const);
  const out: string[] = [];
  for (let i = 0; i < pies.length; i++) for (let j = i + 1; j < pies.length; j++) if (Math.hypot(pies[i][0] - pies[j][0], pies[i][1] - pies[j][1]) < 0.15) out.push(`${pies[i][2]} ~ ${pies[j][2]}`);
  return out;
}

/** Todos los chequeos juntos: vacío si está bien armado. */
export function problemasDeArmado(r: Resultado): string[] {
  return [
    ...(coordenadasFinitas(r) ? [] : ['coordenadas no finitas']),
    ...diagonalesFueraDeNodo(r).map((x) => `diagonal fuera de nodo: ${x}`),
    ...piezasRepetidas(r).map((x) => `repetida: ${x}`),
    ...verticalesDobles(r).map((x) => `vertical doble: ${x}`),
    ...tubosPorColumna(r).map((x) => `cruce: ${x}`),
    ...piesRepetidos(r).map((x) => `pie repetido: ${x}`),
  ];
}

/** Cantidades por familia de las piezas (antes de la BOM: sin rindes). */
export function piezasPorFamilia(r: Resultado): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of r.piezas) out[p.familia] = (out[p.familia] || 0) + 1;
  return out;
}

/** Subconjunto de familias de la BOM para los goldens (cantidades de compra). */
export function golden(bomPorFamilia: Record<string, number>, familias: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of familias) if (bomPorFamilia[k]) out[k] = bomPorFamilia[k];
  return out;
}

export const FAMILIAS_GOLDEN = ['vertical', 'horizontal', 'diagonal', 'tablon', 'viga_celosia', 'mensula', 'base_regulable', 'rueda_freno', 'anclaje', 'escalera_interior', 'tablon_escotilla', 'estabilizador', 'cano'];
