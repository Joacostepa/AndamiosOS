/**
 * Bandeja de protección con visera (pedido 2): soportes volados (ménsula 0,45, horizontal + diagonal
 * 2,00 hasta 1,09 o vigas en voladizo por encima), fenólico en m² y la visera vertical (90°) o inclinada (45°) con su cerramiento.
 * Devuelve Elementos en coordenadas LOCALES.
 */
import type { Elemento, V2, V3 } from '../../tipos.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../../catalogo/catalogo.ts';
import { canoPara } from '../../medida/ajustes.ts';
import { CRITERIOS } from '../../criterios.ts';
import { r3 } from '../../util.ts';

export interface OpcionesVisera {
  /** punto de arranque de la bandeja sobre la línea de apoyo (s, y, t), a la cota de la bandeja */
  desde: V3;
  /** punto final de la línea de apoyo (misma cota) */
  hasta: V3;
  /** dirección del voladizo en planta (unitaria) */
  dir: V2;
  /** ancho de la bandeja (vuelo) */
  ancho: number;
  tipo: '90' | '45' | 'ninguna';
  /** altura de la visera (subida vertical) */
  alto: number;
  cerramiento: 'lona' | 'chapa' | 'fenolico';
  /** 'mensula' (hasta 1,09) o 'viga' (viga de celosía en voladizo) */
  soporte?: 'mensula' | 'viga';
  /** separación entre soportes (default 2,50) */
  paso?: number;
  prefijo?: string;
  medidas?: MedidasCatalogo;
}

const P = (p: V3, d: V2, k: number, dy = 0): V3 => [r3(p[0] + d[0] * k), r3(p[1] + dy), r3(p[2] + d[1] * k)];

/**
 * Soporte volado «tipo ménsula» de la raíz (sobre la columna) a la punta, a la misma cota (armado ABA):
 * hasta 0,45 la pieza ménsula de catálogo; más, un horizontal del vuelo y una diagonal 2,00 × vuelo
 * que baja 2,00 por la columna. `cateto`: lo que baja la diagonal si no llegó a 2,00 (null si bajó 2,00).
 */
export function voladizoMensula(id: string, raiz: V3, punta: V3, largo: number, ancho: number, grupo = 'bandeja'): { elementos: Elemento[]; cateto: number | null } {
  if (largo <= CRITERIOS.mensulaPiezaMax + 1e-6) {
    const pie = P(raiz, [0, 0], 0, -Math.min(0.5, ancho * 0.7));
    return { elementos: [{ id, familia: 'mensula', medidas: { largo }, a: raiz, b: punta, grupo, primitivas: [{ a: raiz, b: punta }, { a: pie, b: punta }] }], cateto: null };
  }
  const h = r3(Math.min(CRITERIOS.caidaDiagonalVoladizo, raiz[1]));
  const els: Elemento[] = [{ id: `${id}:h`, familia: 'horizontal', medidas: { largo }, a: raiz, b: punta, grupo }];
  if (h > 0.1) els.push({ id: `${id}:d`, familia: 'diagonal', medidas: { alto: h, largo }, a: P(raiz, [0, 0], 0, -h), b: punta, grupo });
  return { elementos: els, cateto: Math.abs(h - CRITERIOS.caidaDiagonalVoladizo) > 0.002 ? h : null };
}

export function visera(o: OpcionesVisera): Elemento[] {
  const m = o.medidas || medidasPorDefecto();
  const pf = o.prefijo || 'band';
  const out: Elemento[] = [];
  const dx = o.hasta[0] - o.desde[0];
  const dz = o.hasta[2] - o.desde[2];
  const largo = r3(Math.hypot(dx, dz));
  const u: V2 = largo > 0 ? [dx / largo, dz / largo] : [1, 0];
  const paso = o.paso && o.paso > 0.3 ? o.paso : 2.5;
  const n = Math.max(1, Math.ceil(largo / paso - 1e-6));
  const soporte = o.soporte || (o.ancho <= Math.max(...m.multi.mensulas) + 1e-6 ? 'mensula' : 'viga');
  const largoSoporte = soporte === 'mensula'
    ? [...m.multi.mensulas].sort((a, b) => a - b).find((x) => x >= o.ancho - 1e-6) ?? o.ancho
    : [...m.multi.vigasCelosia].sort((a, b) => a - b).find((x) => x >= o.ancho - 1e-6) ?? o.ancho;
  for (let i = 0; i <= n; i++) {
    const base = P(o.desde, u, (largo * i) / n);
    const tip = P(base, o.dir, o.ancho);
    if (soporte === 'mensula') {
      out.push(...voladizoMensula(`${pf}:men${i}`, base, tip, largoSoporte, o.ancho).elementos);
    } else {
      out.push({ id: `${pf}:viga${i}`, familia: 'viga_celosia', medidas: { largo: largoSoporte }, a: base, b: tip, grupo: 'bandeja' });
    }
    if (o.tipo !== 'ninguna') {
      const arriba = o.tipo === '90' ? P(tip, o.dir, 0, o.alto) : P(tip, o.dir, o.alto, o.alto);
      const lc = o.tipo === '90' ? o.alto : Math.hypot(o.alto, o.alto);
      out.push({ id: `${pf}:mont${i}`, familia: 'cano', medidas: { largo: canoPara(lc - 0.3, m.canos) }, a: tip, b: arriba, grupo: 'visera', sistema: 'comun' });
      out.push({ id: `${pf}:mont${i}:g0`, familia: 'grampa_giratoria', medidas: {}, a: tip, b: tip, grupo: 'visera', sistema: 'comun' });
    }
  }
  // fenólico de la bandeja
  out.push({ id: `${pf}:fen`, familia: 'fenolico', medidas: { ancho: r3(o.ancho) }, a: P(o.desde, [0, 0], 0, 0.04), b: P(P(o.hasta, o.dir, o.ancho), [0, 0], 0, 0.04), medida: r3(largo * o.ancho), grupo: 'bandeja', sistema: 'comun' });
  if (o.tipo !== 'ninguna') {
    const sube = (p: V3, f: number): V3 => (o.tipo === '90' ? P(p, o.dir, o.ancho, o.alto * f) : P(p, o.dir, o.ancho + o.alto * f, o.alto * f));
    const lc = o.tipo === '90' ? o.alto : Math.hypot(o.alto, o.alto);
    // caños longitudinales (arriba y al medio) que sostienen el cerramiento
    for (const [f, nom] of [[1, 'sup'], [0.5, 'med']] as const) {
      out.push({ id: `${pf}:lon${nom}`, familia: 'cano', medidas: { largo: canoPara(largo - 0.3, m.canos) }, a: sube(o.desde, f), b: sube(o.hasta, f), grupo: 'visera', sistema: 'comun' });
    }
    const fam = o.cerramiento === 'fenolico' ? 'fenolico' : o.cerramiento;
    out.push({ id: `${pf}:cerr`, familia: fam, medidas: {}, a: sube(o.desde, 0), b: sube(o.hasta, 1), medida: r3(largo * lc), grupo: 'visera', sistema: 'comun' });
  }
  return out;
}

/** Bandeja amplia sin visera (solo soportes y fenólico). */
export const bandeja = (o: Omit<OpcionesVisera, 'tipo' | 'alto' | 'cerramiento'>): Elemento[] => visera({ ...o, tipo: 'ninguna', alto: 0, cerramiento: 'fenolico' });
