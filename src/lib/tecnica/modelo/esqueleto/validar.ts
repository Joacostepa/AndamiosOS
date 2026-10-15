/** Consistencia geométrica del esqueleto (lo usan los tests y la estructura libre). */
import type { Esqueleto } from '../tipos.ts';
import { partirClave } from './esqueleto.ts';
import { dist2 } from '../util.ts';

export function validarEsqueleto(esq: Esqueleto): string[] {
  const errores: string[] = [];
  const cols = new Map(esq.columnas.map((c) => [c.id, c]));
  const vanos = new Map(esq.vanos.map((v) => [v.id, v]));
  const panos = new Set(esq.panos.map((p) => p.id));
  if (cols.size !== esq.columnas.length) errores.push('Hay ids de columna repetidos.');
  if (vanos.size !== esq.vanos.length) errores.push('Hay ids de vano repetidos.');
  for (let k = 1; k < esq.cotas.length; k++) if (!(esq.cotas[k] > esq.cotas[k - 1])) errores.push('Las cotas no son ascendentes.');
  for (const c of esq.columnas) {
    if (![c.p[0], c.p[1], c.yBase, c.yTope].every(Number.isFinite)) errores.push(`Columna ${c.id}: coordenadas inválidas.`);
    if (c.yTope <= c.yBase) errores.push(`Columna ${c.id}: el tope está por debajo del arranque.`);
  }
  for (const v of esq.vanos) {
    const a = cols.get(v.a);
    const b = cols.get(v.b);
    if (!a || !b) { errores.push(`Vano ${v.id}: columna inexistente.`); continue; }
    if (Math.abs(dist2(a.p, b.p) - v.medida) > 0.002) errores.push(`Vano ${v.id}: la medida no coincide con las columnas.`);
  }
  for (const p of esq.panos) for (const v of p.vanos) if (!vanos.has(v)) errores.push(`Paño ${p.id}: vano ${v} inexistente.`);
  const K = esq.cotas.length;
  for (const key of Object.keys(esq.celdas)) {
    const { id, k } = partirClave(key);
    if (!vanos.has(id) || !(k >= 0 && k < K)) errores.push(`Celda ${key}: fuera del esqueleto.`);
  }
  for (const key of Object.keys(esq.celdasPano)) {
    const { id, k } = partirClave(key);
    if (!panos.has(id) || !(k >= 0 && k < K)) errores.push(`Celda de paño ${key}: fuera del esqueleto.`);
  }
  for (const key of Object.keys(esq.nodos)) {
    const { id, k } = partirClave(key);
    if (!cols.has(id) || !(k >= 0 && k < K)) errores.push(`Nodo ${key}: fuera del esqueleto.`);
  }
  return errores;
}
