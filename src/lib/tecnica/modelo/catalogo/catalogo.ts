/**
 * Catálogo que consume el núcleo (DTO). En producción lo arma persistencia desde catalogo_piezas + stock +
 * tec_pieza_mapa + tec_kits. El núcleo NUNCA fabrica un código ni un peso: lo que no resuelve queda
 * «sin código» y lo que no tiene peso queda «sin peso».
 */
import type { Familia, Medidas, SistemaPieza } from '../tipos.ts';
import { mm } from '../util.ts';

export interface ItemCatalogo {
  codigo: string;
  piezaId: string | null;
  descripcion: string;
  familia: Familia | null;
  sistema: SistemaPieza;
  unidad: string;
  /** Unidades de medida (m² o m) que cubre 1 unidad de compra (rollo, placa). */
  rinde?: number;
  peso_kg: number | null;
  stock: { enDeposito: number; comprometido: number } | null;
  activo: boolean;
}

export interface EntradaMapa {
  familia: Familia;
  sistema: SistemaPieza;
  largo: number | null;
  alto: number | null;
  ancho: number | null;
  variante: string | null;
  codigo: string;
  prioridad: number;
}

export interface MedidasCatalogo {
  multi: {
    vanos: number[];
    profundidades: number[];
    pasoRoseta: number;
    pasoNivel: number;
    mensulas: number[];
    vigasCelosia: number[];
    vigasPuente: number[];
  };
  bastidor: { vanos: number[]; anchos: number[]; alturaCuerpo: number; alturaPaso: number; alturaBaranda: number };
  canos: number[];
}

export interface Catalogo {
  fuente: 'base' | 'fixture';
  piezas: Record<string, ItemCatalogo>;
  mapa: EntradaMapa[];
  /** kit → { componente: cantidad } */
  kits: Record<string, Record<string, number>>;
  medidas: MedidasCatalogo;
}

/** Medidas de la decisión vigente (multidireccional ABA Coronet, bastidor 1,30 × 1,80 supuesto). */
export function medidasPorDefecto(): MedidasCatalogo {
  const canos: number[] = [];
  for (let n = 1; n <= 64; n++) canos.push(Math.round(n * 10) / 100);
  return {
    multi: {
      vanos: [2.5, 2.0, 1.5, 1.25, 1.09, 0.73],
      profundidades: [0.73, 1.09, 1.25],
      pasoRoseta: 0.5,
      pasoNivel: 2.0,
      mensulas: [0.45, 0.73, 1.09],
      vigasCelosia: [2.5, 5.0, 6.0, 7.5],
      vigasPuente: [1.5, 2.5],
    },
    bastidor: { vanos: [2.5, 1.5], anchos: [1.3, 0.9], alturaCuerpo: 1.8, alturaPaso: 2.5, alturaBaranda: 1.0 },
    canos,
  };
}

export function catalogoVacio(): Catalogo {
  return { fuente: 'base', piezas: {}, mapa: [], kits: {}, medidas: medidasPorDefecto() };
}

const igual = (a: number | null | undefined, b: number | null | undefined): boolean => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return mm(a) === mm(b);
};

/** Índice por familia para que resolver sea O(entradas de la familia). */
const INDICES = new WeakMap<Catalogo, Map<string, EntradaMapa[]>>();
const CACHE = new WeakMap<Catalogo, Map<string, string | null>>();

function indice(cat: Catalogo): Map<string, EntradaMapa[]> {
  let ix = INDICES.get(cat);
  if (!ix) {
    ix = new Map();
    for (const e of cat.mapa) {
      const l = ix.get(e.familia);
      if (l) l.push(e);
      else ix.set(e.familia, [e]);
    }
    for (const l of ix.values()) l.sort((a, b) => a.prioridad - b.prioridad);
    INDICES.set(cat, ix);
  }
  return ix;
}

/**
 * Busca en el mapa una coincidencia exacta (al milímetro) de familia, sistema (o 'comun'), largo, alto,
 * ancho y variante. Gana la de menor prioridad. Si no hay, devuelve null: «sin código».
 */
export function resolverCodigo(cat: Catalogo, familia: Familia, medidas: Medidas, sistema: SistemaPieza): string | null {
  let cache = CACHE.get(cat);
  if (!cache) {
    cache = new Map();
    CACHE.set(cat, cache);
  }
  const clave = `${familia}|${sistema}|${medidas.largo ?? ''}|${medidas.alto ?? ''}|${medidas.ancho ?? ''}|${medidas.variante ?? ''}`;
  const enCache = cache.get(clave);
  if (enCache !== undefined) return enCache;
  const lista = indice(cat).get(familia) || [];
  let res: string | null = null;
  for (const e of lista) {
    if (e.sistema !== sistema && e.sistema !== 'comun' && sistema !== 'comun') continue;
    if (!igual(e.largo, medidas.largo) || !igual(e.alto, medidas.alto) || !igual(e.ancho, medidas.ancho)) continue;
    if ((e.variante || null) !== (medidas.variante || null)) continue;
    const it = cat.piezas[e.codigo];
    if (it && !it.activo) continue;
    res = e.codigo;
    break;
  }
  // familias que se computan por superficie: las medidas no eligen el código
  if (!res && POR_RINDE.has(familia) && (medidas.largo !== undefined || medidas.alto !== undefined || medidas.ancho !== undefined)) {
    res = resolverCodigo(cat, familia, medidas.variante ? { variante: medidas.variante } : {}, sistema);
  }
  cache.set(clave, res);
  return res;
}

const POR_RINDE = new Set<Familia>(['fenolico', 'lona', 'media_sombra', 'chapa']);

export function infoDe(cat: Catalogo, codigo: string | null): ItemCatalogo | null {
  if (!codigo) return null;
  return cat.piezas[codigo] || null;
}

/** Largos disponibles de una familia en el mapa (p. ej. vanos de 'horizontal' multi). */
export function largosDe(cat: Catalogo, familia: Familia, sistema: SistemaPieza): number[] {
  const out = new Set<number>();
  for (const e of indice(cat).get(familia) || []) {
    if ((e.sistema === sistema || e.sistema === 'comun') && e.largo !== null && !e.alto && !e.ancho) out.add(e.largo);
  }
  return [...out].sort((a, b) => b - a);
}
