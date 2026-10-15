/**
 * Regla de diagonales como en obra (pedido 1, fotos 7, 8 y 9):
 * - una diagonal por celda de cara, siempre roseta a roseta dentro de un vano y una banda;
 * - en la cara exterior y en las transversales de los extremos;
 * - zigzag continuo en altura: el sentido alterna banda a banda (el nodo de arriba de una es el de abajo
 *   de la siguiente) y los vanos arriostrados contiguos alternan la fase (V y Λ, no paralelas);
 * - vanos arriostrados: los extremos de cada tramo y al menos uno cada CRITERIOS.diagonalCadaVanos ⚠.
 */
import type { CeldaCara, Sistema } from '../tipos.ts';
import { CRITERIOS } from '../criterios.ts';
import { type Catalogo, resolverCodigo } from '../catalogo/catalogo.ts';

/** Índices de vanos arriostrados en un tramo de m vanos (extremos + cada ≤ n). */
export function vanosArriostrados(m: number, cada: number = CRITERIOS.diagonalCadaVanos, evitar?: (i: number) => boolean): number[] {
  if (m <= 0) return [];
  const set = new Set<number>([0, m - 1]);
  for (let v = 0; v < m; v += cada) set.add(v);
  if (!evitar) return [...set].sort((a, b) => a - b);
  // un vano de ajuste (caño y grampa, más angosto que el catálogo) nunca es el arriostrado: pasa al vecino
  const out = new Set<number>();
  for (const i of [...set].sort((a, b) => a - b)) {
    if (!evitar(i)) {
      out.add(i);
      continue;
    }
    for (let d = 1; d < m; d++) {
      const j = [i - d, i + d].find((x) => x >= 0 && x < m && !evitar(x) && !out.has(x) && !set.has(x));
      if (j !== undefined) {
        out.add(j);
        break;
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Sentido de la diagonal de la banda `orden` (0 = la más baja con diagonal) en el vano arriostrado `fase`.
 * 'sube' va de (a, abajo) a (b, arriba); 'baja' de (b, abajo) a (a, arriba). Alternar con el orden hace
 * que el extremo superior de una coincida con el inferior de la siguiente.
 */
export const sentidoZigzag = (orden: number, fase: number): 'sube' | 'baja' => ((orden + fase) % 2 === 0 ? 'sube' : 'baja');

/** ¿La banda es lo bastante alta para llevar diagonal? */
export const bandaConDiagonal = (h: number): boolean => h >= CRITERIOS.diagonalAltoMin - 1e-6;

/**
 * Celda con diagonal. En la banda estándar (2,00) va siempre la diagonal de catálogo (si falta en la base queda
 * «sin código»). En una banda de otra altura sin diagonal de catálogo para ese vano, la plantilla la arma
 * con caño y grampa (se ve en el bloque de ajuste).
 */
export function celdaDiagonal(cat: Catalogo, h: number, largo: number, sentido: 'sube' | 'baja', sistema: Sistema = 'multi'): Partial<CeldaCara> {
  const estandar = Math.abs(h - CRITERIOS.pasoNivel) < 0.0015;
  // sin mapa (catálogo vacío) no se puede saber: diagonal común (quedará «sin código» con su reparación)
  if (estandar || !cat.mapa.length || resolverCodigo(cat, 'diagonal', { alto: h, largo }, sistema)) return { diagonal: sentido };
  return { diagonal: sentido, diagonalCano: true };
}
