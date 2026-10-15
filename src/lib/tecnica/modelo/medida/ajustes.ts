/**
 * Caño y grampa (ajustes de medida libre y amarres). Reglas §3.3:
 * - horizontal o baranda de un vano libre = caño ceil10(luz + 2 × 0,15) + 2 grampas fijas;
 * - diagonal de un vano libre = caño ceil10(√(luz² + h²) + 0,30) + 2 grampas giratorias.
 */
import { CRITERIOS } from '../criterios.ts';
import { ceil10, EPS, r3 } from '../util.ts';

/** Caño más corto de la lista que cubre la luz + el vuelo de grampa en cada punta. */
export function canoPara(luz: number, canos: number[]): number {
  const pedido = ceil10(luz + 2 * CRITERIOS.vueloGrampa);
  const ordenados = [...canos].sort((a, b) => a - b);
  return ordenados.find((l) => l >= pedido - EPS) ?? ordenados[ordenados.length - 1] ?? r3(pedido);
}

export function canoDiagonal(luz: number, h: number, canos: number[]): number {
  const pedido = ceil10(Math.hypot(luz, h) + 2 * CRITERIOS.vueloGrampa);
  const ordenados = [...canos].sort((a, b) => a - b);
  return ordenados.find((l) => l >= pedido - EPS) ?? ordenados[ordenados.length - 1] ?? r3(pedido);
}

/** Tablón de catálogo para un vano libre: el siguiente largo mayor si el solape entra. */
export function tablonParaLibre(luz: number, largos: number[]): { largo: number; solape: number } | null {
  const l = [...largos].sort((a, b) => a - b).find((x) => x >= luz - EPS);
  if (l === undefined || l - luz > CRITERIOS.solapeTablonMax + EPS) return null;
  return { largo: l, solape: r3(l - luz) };
}
