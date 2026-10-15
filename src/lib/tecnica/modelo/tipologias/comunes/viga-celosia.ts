/** Viga de celosía de catálogo para una luz (o «sin código» si no hay ninguna que alcance). */
import type { Elemento, V3 } from '../../tipos.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../../catalogo/catalogo.ts';
import { primViga } from './util-tipologias.ts';
import { r3 } from '../../util.ts';

export function vigaCelosia(o: { a: V3; b: V3; luz?: number; id?: string; alto?: number; par?: { a: V3; b: V3 }; medidas?: MedidasCatalogo }): { elementos: Elemento[]; largo: number; excede: boolean } {
  const m = o.medidas || medidasPorDefecto();
  const luz = o.luz ?? r3(Math.hypot(o.b[0] - o.a[0], o.b[2] - o.a[2]));
  const lista = [...m.multi.vigasCelosia].sort((x, y) => x - y);
  const l = lista.find((x) => x >= luz - 0.05);
  const largo = l ?? r3(luz);
  const id = o.id || 'viga';
  const els: Elemento[] = [{ id, familia: 'viga_celosia', medidas: { largo }, a: o.a, b: o.b, primitivas: primViga(o.a, o.b, o.alto ?? 0.5), grupo: 'viga' }];
  if (o.par) els.push({ id: `${id}:dpl`, familia: 'diagonal_planta', medidas: { variante: 'celosia' }, a: o.a, b: o.par.b, grupo: 'viga' });
  return { elementos: els, largo, excede: l === undefined };
}
