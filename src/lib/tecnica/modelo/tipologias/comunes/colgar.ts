/** Estructuras colgantes: columnas colgadas de un soporte (losa, puente u otra estructura), sin bases. */
import type { Aviso, Esqueleto } from '../../tipos.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../../catalogo/catalogo.ts';
import { canoPara } from '../../medida/ajustes.ts';
import { pilaVerticales } from '../../medida/alturas.ts';
import { PREDIMENSIONADO } from '../../constantes.ts';
import { r3 } from '../../util.ts';

export type SoporteColgado = 'losa' | 'acero' | 'estructura';

/**
 * MUTA el esqueleto: todas las columnas pasan a 'colgada' y cada una lleva su colgador hasta la cota del
 * soporte con las piezas que la sostienen (pedido 4, foto 4):
 * - caño + 2 grampas fijas + 1 grampa de seguridad (el caño trabaja a tracción);
 * - arriba, según el soporte: placa con bulón o anclaje químico (losa), grampa de viga (ala de acero) o
 *   nada extra (se toma de otra estructura de andamio);
 * - un pasador (perno) en cada empalme de las verticales colgadas: el espigote solo no toma tracción.
 * Las piezas sin código en el catálogo quedan «sin código» (no se inventan).
 */
export function colgar(esq: Esqueleto, o: { cota: number; sujecion: 'cano_grampa' | 'viga_celosia' | 'mensula' | 'anclaje_quimico'; soporte?: SoporteColgado; estructuraId?: string; medidas?: MedidasCatalogo }): Omit<Aviso, 'id'>[] {
  const m = o.medidas || medidasPorDefecto();
  const soporte: SoporteColgado = o.soporte || (o.sujecion === 'anclaje_quimico' ? 'losa' : 'estructura');
  let pasadores = 0;
  for (const c of esq.columnas) {
    // pasadores en los empalmes de la pila de verticales (de abajo hacia arriba, como la arma armar)
    const pila = pilaVerticales(r3(c.yTope - c.yBase));
    let y = c.yBase;
    for (let i = 0; i < pila.length - 1; i++) {
      y = r3(y + pila[i]);
      const q: [number, number, number] = [c.p[0], y, c.p[1]];
      esq.elementos.push({ id: `colg:${c.id}:pas${i}`, familia: 'accesorio', medidas: { variante: 'pasador' }, a: q, b: q, grupo: 'colgado', sistema: 'comun' });
      pasadores++;
    }
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
      // grampa de seguridad (doble grampa en todo caño a tracción)
      const gs: [number, number, number] = [c.p[0], r3(y0 + 0.1), c.p[1]];
      esq.elementos.push({ id: `colg:${c.id}:g2`, familia: 'grampa_fija', medidas: {}, a: gs, b: gs, grupo: 'colgado', sistema: 'comun' });
    } else {
      esq.elementos.push({ id: `colg:${c.id}`, familia: 'colgador', medidas: { largo }, a, b, grupo: 'colgado', sistema: 'comun' });
    }
    if (soporte === 'losa') esq.elementos.push({ id: `colg:${c.id}:placa`, familia: 'accesorio', medidas: { variante: 'placa_anclaje' }, a: b, b, grupo: 'colgado', sistema: 'comun' });
    else if (soporte === 'acero') esq.elementos.push({ id: `colg:${c.id}:gv`, familia: 'accesorio', medidas: { variante: 'grampa_viga' }, a: b, b, grupo: 'colgado', sistema: 'comun' });
  }
  const arriba = soporte === 'losa' ? 'placa con bulón o anclaje químico en la losa' : soporte === 'acero' ? 'grampa de viga al ala de acero' : 'tomado de la estructura de soporte';
  return [{ regla: 'colgado.soporte', nivel: 'aviso', estructuraId: o.estructuraId || null, texto: `Estructura colgada: ${esq.columnas.length} colgadores (${o.sujecion.replace('_', ' ')}, ${arriba}), doble grampa en cada caño a tracción y ${pasadores} pasadores en los empalmes. Verificar el soporte y las sujeciones. ${PREDIMENSIONADO}.`, reparaciones: [] }];
}
