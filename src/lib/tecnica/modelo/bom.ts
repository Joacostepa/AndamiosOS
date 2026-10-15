/**
 * Lista de materiales (BOM). Agrupa por código (o por familia + medidas si no tiene código), aplica kits
 * (bastidor) y rindes (fenólico por despiece, media sombra, lona, concertina). Los pesos salen del catálogo:
 * si un código no tiene peso, la línea va «sin peso» (null). Nunca se inventa.
 */
import type { AjusteBom, Familia, LineaBom, Medidas, ModoBom, Pieza } from './tipos.ts';
import { type Catalogo, infoDe } from './catalogo/catalogo.ts';
import { fmt, r3 } from './util.ts';

export const GRUPOS: Record<Familia, string> = {
  modulo_kit: 'Módulos (kit)', bastidor: 'Bastidores', bastidor_baranda: 'Bastidores', rienda_h: 'Bastidores', rienda_d: 'Bastidores',
  vertical: 'Verticales', horizontal: 'Horizontales y barandas', baranda: 'Horizontales y barandas',
  diagonal: 'Diagonales', diagonal_planta: 'Diagonales',
  tablon: 'Plataformas', tablon_escotilla: 'Accesos', fenolico: 'Vía pública', rodapie: 'Rodapiés',
  mensula: 'Ménsulas', viga_celosia: 'Vigas', viga_puente: 'Vigas',
  zanca: 'Accesos', escalera_interior: 'Accesos', baranda_escalera: 'Accesos',
  anclaje: 'Anclajes', base_fija: 'Bases', base_regulable: 'Bases', collarin: 'Bases', rueda: 'Bases', rueda_freno: 'Bases', estabilizador: 'Bases',
  lona: 'Cubiertas', media_sombra: 'Cubiertas', chapa: 'Cubiertas',
  recubrimiento: 'Vía pública', esfera: 'Vía pública', defensa: 'Vía pública', accesorio: 'Vía pública',
  cano: 'Uniones', grampa_fija: 'Uniones', grampa_giratoria: 'Uniones', manguito: 'Uniones', colgador: 'Uniones',
};
export const GRUPO_AJUSTE = 'Ajuste con caño y grampa';
export const ORDEN_GRUPOS = ['Módulos (kit)', 'Bastidores', 'Verticales', 'Horizontales y barandas', 'Diagonales', 'Plataformas', 'Rodapiés', 'Ménsulas', 'Vigas', 'Accesos', 'Anclajes', 'Bases', 'Cubiertas', 'Vía pública', 'Uniones', GRUPO_AJUSTE];

const textoMedidas = (m: Medidas) => [m.alto !== undefined ? fmt(m.alto) : null, m.largo !== undefined ? fmt(m.largo) : null, m.ancho !== undefined ? fmt(m.ancho) : null].filter(Boolean).join(' × ') + (m.variante ? ` (${m.variante})` : '');
const NOMBRES: Partial<Record<Familia, string>> = { cano: 'Caño', grampa_fija: 'Grampa fija', grampa_giratoria: 'Grampa giratoria', horizontal: 'Horizontal', baranda: 'Baranda', diagonal: 'Diagonal', tablon: 'Tablón', rodapie: 'Rodapié', mensula: 'Ménsula', viga_celosia: 'Viga celosía', colgador: 'Colgador', estabilizador: 'Estabilizador', chapa: 'Chapa', lona: 'Lona' };

export function calcularBom(piezas: Pieza[], cat: Catalogo, modo: ModoBom = 'kit', ajustes: AjusteBom[] = []): LineaBom[] {
  type Acc = { codigo: string | null; familia: Familia; medidas: Medidas; cantidad: number; medida: number; esAjuste: boolean; esKit: boolean; despiece: Map<number, number>; area: number };
  const lineas = new Map<string, Acc>();
  const kitsVistos = new Set<string>();
  const acc = (clave: string, init: () => Acc) => {
    let a = lineas.get(clave);
    if (!a) lineas.set(clave, (a = init()));
    return a;
  };
  for (const p of piezas) {
    if (modo === 'kit' && p.kit) {
      if (!kitsVistos.has(p.kit.grupo)) {
        kitsVistos.add(p.kit.grupo);
        acc(p.kit.codigo, () => ({ codigo: p.kit!.codigo, familia: 'modulo_kit', medidas: {}, cantidad: 0, medida: 0, esAjuste: false, esKit: true, despiece: new Map(), area: 0 })).cantidad++;
      }
      continue;
    }
    const esAjuste = !!p.ajuste;
    const base = p.codigo ?? `SIN:${p.familia}:${textoMedidas(p.medidas)}`;
    const clave = esAjuste ? `${base}|ajuste` : base;
    const a = acc(clave, () => ({ codigo: p.codigo, familia: p.familia, medidas: p.medidas, cantidad: 0, medida: 0, esAjuste, esKit: false, despiece: new Map(), area: 0 }));
    const it = infoDe(cat, p.codigo);
    if (it?.rinde || (!p.codigo && p.medida !== undefined)) {
      a.medida += p.medida || 0;
      if (it?.rinde && p.familia === 'fenolico' && (p.medidas.ancho || 0) > 0) {
        const w = p.medidas.ancho as number;
        a.despiece.set(w, (a.despiece.get(w) || 0) + (p.medida || 0) / w);
      } else a.area += p.medida || 0;
      continue;
    }
    a.cantidad++;
  }
  const out: LineaBom[] = [];
  for (const [clave, a] of lineas) {
    const it = infoDe(cat, a.codigo);
    let cantidad = a.cantidad;
    if (it?.rinde) {
      let n = 0;
      // fenólico por despiece (placa 1,22 × 2,44), la mejor de dos orientaciones
      for (const [ancho, ml] of a.despiece) {
        const atravesadas = Math.max(1, Math.ceil(ancho / 2.44 - 1e-9));
        const porPlaca = atravesadas > 1 ? 1 : Math.max(1, Math.floor(2.44 / ancho + 1e-9));
        let placas = Math.ceil(Math.ceil(ml / 1.22 - 1e-9) / porPlaca) * atravesadas;
        if (ancho <= 1.3 + 1e-9) placas = Math.min(placas, Math.ceil(Math.ceil(ml / 2.44 - 1e-9) / Math.max(1, Math.floor(1.3 / ancho + 1e-9))));
        n += placas;
      }
      if (a.area > 0) n += Math.ceil(a.area / it.rinde - 1e-9);
      cantidad = Math.max(1, n);
    } else if (!a.codigo && a.medida > 0) cantidad = Math.max(cantidad, Math.ceil(a.medida - 1e-9));
    const ajusteManual = ajustes.filter((x) => x.codigo === a.codigo && a.codigo !== null && !a.esAjuste).reduce((s, x) => s + x.delta, 0);
    cantidad = Math.max(0, cantidad + ajusteManual);
    const stockLibre = it?.stock ? it.stock.enDeposito - it.stock.comprometido : null;
    const peso = it ? it.peso_kg : null;
    const fam = (it?.familia as Familia | null) || a.familia;
    out.push({
      clave, codigo: a.codigo, piezaId: it?.piezaId ?? null,
      descripcion: it?.descripcion || `${NOMBRES[a.familia] || a.familia} ${textoMedidas(a.medidas)}`.trim(),
      familia: fam, grupo: a.esAjuste ? GRUPO_AJUSTE : GRUPOS[fam] || 'Otros', cantidad,
      unidad: it?.unidad || (!a.codigo && a.medida > 0 ? 'm²' : 'u'),
      peso_unit: peso, peso_total: peso === null ? null : r3(peso * cantidad),
      stockLibre, falta: stockLibre === null ? null : Math.max(0, cantidad - stockLibre),
      esKit: a.esKit || !!cat.kits[a.codigo || ''], esAjuste: a.esAjuste, sinCodigo: !a.codigo, ajusteManual,
      ...(a.medida > 0 ? { medida: r3(a.medida) } : {}),
    });
  }
  // ajustes manuales de códigos que el modelo no tiene
  for (const x of ajustes) {
    if (out.some((l) => l.codigo === x.codigo && !l.esAjuste)) continue;
    const it = infoDe(cat, x.codigo);
    if (!it || x.delta <= 0) continue;
    const stockLibre = it.stock ? it.stock.enDeposito - it.stock.comprometido : null;
    const fam = (it.familia || 'accesorio') as Familia;
    out.push({ clave: x.codigo, codigo: x.codigo, piezaId: it.piezaId, descripcion: it.descripcion, familia: fam, grupo: GRUPOS[fam] || 'Otros', cantidad: x.delta, unidad: it.unidad, peso_unit: it.peso_kg, peso_total: it.peso_kg === null ? null : r3(it.peso_kg * x.delta), stockLibre, falta: stockLibre === null ? null : Math.max(0, x.delta - stockLibre), esKit: !!cat.kits[x.codigo], esAjuste: false, sinCodigo: false, ajusteManual: x.delta });
  }
  const ord = (g: string) => {
    const i = ORDEN_GRUPOS.indexOf(g);
    return i < 0 ? 99 : i;
  };
  out.sort((a, b) => ord(a.grupo) - ord(b.grupo) || a.clave.localeCompare(b.clave));
  return out;
}
