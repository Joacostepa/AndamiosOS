/** Acceso interior: escotillas en los niveles con plataforma de un paño y escalera entre niveles. */
import type { Esqueleto } from '../../tipos.ts';
import { columnasPano, indexar } from '../../esqueleto/esqueleto.ts';
import { r3 } from '../../util.ts';

/** MUTA el esqueleto: pone escotilla en el paño (salvo el último nivel) y una escalera por tramo. */
export function escaleraInterior(esq: Esqueleto, panoId: string, o: { tipo?: 'escalera_interior' | 'zanca'; desde?: number } = {}): void {
  const ix = indexar(esq);
  const p = ix.pano.get(panoId);
  if (!p) return;
  const cols = columnasPano(p, ix).map((id) => ix.col.get(id)!);
  const ks = esq.cotas.map((_, k) => k).filter((k) => esq.celdasPano[`${panoId}@${k}`]?.plataforma);
  const xs = cols.map((c) => c.p[0]);
  const zs = cols.map((c) => c.p[1]);
  const x0 = Math.min(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), x1 = Math.max(...xs);
  let y0 = o.desde ?? Math.min(...cols.map((c) => c.ySuelo ?? 0));
  ks.forEach((k, i) => {
    const c = esq.cotas[k];
    if (i < ks.length - 1) esq.celdasPano[`${panoId}@${k}`] = { ...esq.celdasPano[`${panoId}@${k}`], plataforma: 'escotilla' };
    const zm = r3((z0 + z1) / 2);
    const fam = o.tipo === 'zanca' ? 'zanca' : 'escalera_interior';
    esq.elementos.push({ id: `esc:${panoId}:${k}`, familia: fam, medidas: fam === 'zanca' ? { ancho: 1.5, largo: 2.5 } : {}, a: [r3(x0 + 0.25), y0, zm], b: [r3(Math.min(x1, x0 + 1.05)), c, zm], grupo: 'acceso' });
    y0 = c;
  });
}
