/** Torres móviles: ruedas con freno, estabilizadores y control de H/B con ruedas ⚠. */
import type { Aviso, Esqueleto } from '../../tipos.ts';
import { CRITERIOS } from '../../criterios.ts';
import { PREDIMENSIONADO } from '../../constantes.ts';
import { fmt, r3 } from '../../util.ts';

function ladoMenor(esq: Esqueleto): number {
  const xs = esq.columnas.map((c) => c.p[0]);
  const zs = esq.columnas.map((c) => c.p[1]);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
}

/** Pone ruedas en todas las columnas (MUTA el esqueleto) y avisa si H/B pasa el límite. */
export function ruedas(esq: Esqueleto, o: { freno?: boolean; exterior?: boolean; estructuraId?: string; bEfectiva?: number } = {}): { avisos: Omit<Aviso, 'id'>[]; hb: number; hbMax: number } {
  for (const c of esq.columnas) {
    if (c.yBase <= Math.min(...esq.columnas.map((x) => x.yBase)) + 1e-6) c.apoyo = o.freno === false ? 'rueda' : 'rueda_freno';
  }
  const H = Math.max(...esq.columnas.map((c) => c.yTope));
  const B = o.bEfectiva ?? ladoMenor(esq);
  const hbMax = o.exterior ? CRITERIOS.hbMovilExterior : CRITERIOS.hbMovilInterior;
  const hb = B > 0 ? H / B : Infinity;
  const avisos: Omit<Aviso, 'id'>[] = [];
  if (hb > hbMax + 1e-6) {
    const id = o.estructuraId || null;
    avisos.push({ regla: 'movil.hb', nivel: 'error', estructuraId: id, texto: `Torre móvil: H/B = ${fmt(hb, 1)} con ruedas, el máximo ${o.exterior ? 'exterior' : 'interior'} es ${fmt(hbMax, 1)} : 1 (H ${fmt(H)}, B ${fmt(B)}) ⚠. ${PREDIMENSIONADO}.`, reparaciones: [] });
  }
  return { avisos, hb: r3(hb), hbMax };
}

/** Estabilizadores en las 4 esquinas (MUTA el esqueleto). Devuelve la B efectiva ⚠. */
export function estabilizadores(esq: Esqueleto, brazo: number): number {
  const xs = esq.columnas.map((c) => c.p[0]);
  const zs = esq.columnas.map((c) => c.p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const esquinas = esq.columnas.filter((c) => (Math.abs(c.p[0] - x0) < 1e-6 || Math.abs(c.p[0] - x1) < 1e-6) && (Math.abs(c.p[1] - z0) < 1e-6 || Math.abs(c.p[1] - z1) < 1e-6));
  for (const c of esquinas) {
    let k = 0;
    while (k < esq.cotas.length && esq.cotas[k] < c.yBase - 1e-6) k++;
    const key = `${c.id}@${Math.min(k + 1, esq.cotas.length - 1)}`;
    esq.nodos[key] = { ...(esq.nodos[key] || {}), estabilizador: { brazo } };
  }
  // los estabilizadores a 45° agrandan la base en ≈ 2 × brazo × cos 45°
  return r3(Math.min(x1 - x0, z1 - z0) + 2 * brazo * Math.SQRT1_2);
}
