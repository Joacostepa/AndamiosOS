/**
 * Helpers de test del núcleo (no es un test). Las tipologías nuevas los reusan:
 *   import { assertDiagonalesEnNodos } from '../test-utils.ts';
 */
import type { Pieza, Resultado } from './tipos.ts';

const MM = (v: number) => Math.round(v * 1000);
const k3 = (q: number[]) => `${MM(q[0])}|${MM(q[1])}|${MM(q[2])}`;

/** Diagonales de grilla (no elementos): las de catálogo y las de caño y grampa. */
export function diagonalesDeGrilla(r: Resultado): Pieza[] {
  return r.piezas.filter((p) => !p.elemento && p.celda && (p.familia === 'diagonal' || (p.familia === 'cano' && p.id.includes(':d:') && !/:g[01]$/.test(p.id))));
}

/** Nodos = extremos de horizontales (y de caños horizontales de ajuste) y de bastidores. */
export function nodosDe(r: Resultado): Set<string> {
  const s = new Set<string>();
  for (const p of r.piezas) {
    const horiz = Math.abs(p.a[1] - p.b[1]) < 1e-6;
    if ((p.familia === 'horizontal' || (p.familia === 'cano' && horiz)) && !p.elemento) {
      s.add(k3(p.a));
      s.add(k3(p.b));
    }
  }
  return s;
}

/** Cada diagonal de grilla tiene sus dos extremos en un nodo (roseta con anillo). Devuelve las que fallan. */
export function diagonalesFueraDeNodo(r: Resultado): string[] {
  const nodos = nodosDe(r);
  return diagonalesDeGrilla(r).filter((p) => !nodos.has(k3(p.a)) || !nodos.has(k3(p.b))).map((p) => p.id);
}

export function assertDiagonalesEnNodos(r: Resultado): void {
  const malas = diagonalesFueraDeNodo(r);
  if (malas.length) throw new Error(`Diagonales fuera de nodo: ${malas.slice(0, 5).join(', ')}${malas.length > 5 ? '…' : ''}`);
}

/** Cantidades por familia (golden de BOM por preset). */
export function porFamilia(r: Resultado): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of r.bom) out[l.familia] = (out[l.familia] || 0) + l.cantidad;
  return out;
}

/** BOM comparable (clave → cantidad). */
export function bomPlano(r: Resultado): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of r.bom) out[l.clave] = l.cantidad;
  return out;
}

/** Ninguna coordenada NaN o infinita. */
export function coordenadasFinitas(r: Resultado): boolean {
  return r.piezas.every((p) => [...p.a, ...p.b].every(Number.isFinite));
}
