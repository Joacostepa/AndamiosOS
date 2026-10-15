/** Estructuras colgantes: columnas colgadas de un soporte (losa, puente u otra estructura), sin bases. */
import type { Aviso, Esqueleto } from '../../tipos.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../../catalogo/catalogo.ts';
import { canoPara } from '../../medida/ajustes.ts';
import { PREDIMENSIONADO } from '../../constantes.ts';
import { r3 } from '../../util.ts';

/**
 * MUTA el esqueleto: todas las columnas pasan a 'colgada' y cada una lleva su colgador hasta la cota del
 * soporte (caño + grampas, o colgador sin código).
 */
export function colgar(esq: Esqueleto, o: { cota: number; sujecion: 'cano_grampa' | 'viga_celosia' | 'mensula' | 'anclaje_quimico'; estructuraId?: string; medidas?: MedidasCatalogo }): Omit<Aviso, 'id'>[] {
  const m = o.medidas || medidasPorDefecto();
  for (const c of esq.columnas) {
    c.apoyo = 'colgada';
    const y0 = c.yTope;
    const largo = r3(o.cota - y0);
    if (largo <= 0.05) continue;
    const a: [number, number, number] = [c.p[0], y0, c.p[1]];
    const b: [number, number, number] = [c.p[0], o.cota, c.p[1]];
    if (o.sujecion === 'cano_grampa') {
      esq.elementos.push({ id: `colg:${c.id}`, familia: 'cano', medidas: { largo: canoPara(largo - 0.3, m.canos) }, a, b, grupo: 'colgado', sistema: 'comun' });
      esq.elementos.push({ id: `colg:${c.id}:g0`, familia: 'grampa_fija', medidas: {}, a, b: a, grupo: 'colgado', sistema: 'comun' });
      esq.elementos.push({ id: `colg:${c.id}:g1`, familia: 'grampa_fija', medidas: {}, a: b, b, grupo: 'colgado', sistema: 'comun' });
    } else {
      esq.elementos.push({ id: `colg:${c.id}`, familia: 'colgador', medidas: { largo }, a, b, grupo: 'colgado', sistema: 'comun' });
    }
  }
  return [{ regla: 'colgado.soporte', nivel: 'aviso', estructuraId: o.estructuraId || null, texto: `Estructura colgada: verificar el soporte y las sujeciones (${o.sujecion.replace('_', ' ')}). ${PREDIMENSIONADO}.`, reparaciones: [] }];
}
