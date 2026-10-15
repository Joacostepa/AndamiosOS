/**
 * Catálogo del modelador armado desde la base: catalogo_piezas + stock + tec_pieza_mapa + tec_kits.
 * Puro (sin Supabase): recibe las filas y devuelve el DTO `Catalogo` del núcleo.
 *
 * Reglas (pedido de JS):
 * - El peso se copia TAL CUAL de catalogo_piezas. Si no hay (o es 0, que en Odoo es «no cargado»),
 *   queda null y la UI dice «sin peso». Nunca se inventa.
 * - La familia sale de tec_pieza_mapa (no de `categoria`: las riendas figuran como 'anclaje').
 * - Un código sin fila en tec_pieza_mapa se infiere por convención (semillas.ts) si `inferir`, y si
 *   el código no dice nada (los «ODOO-<n>» del sync), por la descripción (mapa-descripcion.ts).
 *   Uno que tiene filas, aunque estén inactivas, NO: manda lo que cargó Oficina Técnica.
 */
import type { Familia, SistemaPieza } from '../modelo/index.ts';
import { medidasPorDefecto } from '../modelo/index.ts';
import type { Catalogo, EntradaMapa, ItemCatalogo, MedidasCatalogo } from '../modelo/index.ts';
import { mapeoPorCodigo, type EntradaInferida } from './semillas.ts';
import { mapeoPorDescripcion } from './mapa-descripcion.ts';

export interface FilaPieza {
  id: string;
  codigo: string;
  descripcion: string;
  categoria?: string | null;
  sistema_andamio?: string | null;
  peso_kg: number | string | null;
  unidad_medida?: string | null;
  activo: boolean;
}
export interface FilaStock { pieza_id: string; en_deposito: number | null; comprometido: number | null }
export interface FilaMapa {
  familia: string;
  sistema: string;
  largo_m: number | string | null;
  alto_m: number | string | null;
  ancho_m: number | string | null;
  variante: string | null;
  codigo: string;
  prioridad: number | null;
  rinde?: number | string | null;
  unidad_compra?: string | null;
  activo: boolean;
}
export interface FilaKit { kit_codigo: string; pieza_codigo: string; cantidad: number | string }

export interface FilasCatalogo {
  piezas: FilaPieza[];
  stock: FilaStock[];
  mapa: FilaMapa[];
  kits: FilaKit[];
}

export interface AvisoCatalogo { regla: string; texto: string }

const FAMILIAS = new Set<Familia>([
  'vertical', 'horizontal', 'baranda', 'diagonal', 'diagonal_planta', 'tablon', 'tablon_escotilla', 'rodapie', 'fenolico',
  'base_fija', 'base_regulable', 'collarin', 'rueda', 'rueda_freno', 'estabilizador', 'anclaje', 'mensula', 'viga_celosia',
  'viga_puente', 'zanca', 'escalera_interior', 'baranda_escalera', 'bastidor', 'bastidor_baranda', 'rienda_h', 'rienda_d',
  'modulo_kit', 'cano', 'grampa_fija', 'grampa_giratoria', 'manguito', 'lona', 'media_sombra', 'chapa', 'colgador',
  'recubrimiento', 'esfera', 'defensa', 'accesorio',
]);

export const esFamilia = (x: unknown): x is Familia => typeof x === 'string' && FAMILIAS.has(x as Familia);

const num = (x: number | string | null | undefined): number | null => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function sistemaDeAndamio(s: string | null | undefined): SistemaPieza {
  if (s === 'multidireccional') return 'multi';
  if (s === 'tubular') return 'bastidor';
  return 'comun';
}

function unidadLegible(u: string | null | undefined): string {
  if (!u || u === 'unidad' || u === 'Unidades' || u === 'Units') return 'u';
  return u;
}

const unicos = (xs: number[]) => [...new Set(xs.map(r3))].sort((a, b) => b - a);

/**
 * Medidas que ofrece la UI. Vanos y profundidades salen de las horizontales con código (lo que hay
 * de verdad en el depósito); si no hay ninguna, los default de la decisión vigente, con aviso.
 * Ménsulas y vigas suman las del mapa a las default: se pueden dibujar aunque no tengan código
 * (quedan «sin código» en la lista).
 */
function medidasDesdeMapa(mapa: EntradaMapa[], avisos: AvisoCatalogo[]): MedidasCatalogo {
  const def = medidasPorDefecto();
  const largos = (familia: Familia, sistema: SistemaPieza) =>
    unicos(mapa.filter((e) => e.familia === familia && (e.sistema === sistema || e.sistema === 'comun') && e.largo !== null && e.alto === null && e.ancho === null).map((e) => e.largo as number));

  const hor = largos('horizontal', 'multi');
  let vanos = def.multi.vanos;
  let profundidades = def.multi.profundidades;
  if (hor.length === 0) {
    avisos.push({ regla: 'catalogo.sin_horizontales', texto: 'No hay horizontales multidireccionales mapeadas: uso los vanos de la decisión vigente (2,50 · 2,00 · 1,50 · 1,25 · 1,09 · 0,73). Revisá tec_pieza_mapa.' });
  } else {
    vanos = hor;
    const prof = def.multi.profundidades.filter((p) => hor.some((h) => Math.abs(h - p) < 0.0005));
    if (prof.length > 0) profundidades = prof;
  }
  const union = (a: number[], b: number[]) => unicos([...a, ...b]);
  const canos = largos('cano', 'comun');
  if (canos.length === 0) avisos.push({ regla: 'catalogo.sin_canos', texto: 'No hay caños (CAÑO-NNN) en el catálogo: los ajustes con caño y grampa van a quedar «sin código».' });
  return {
    multi: {
      ...def.multi,
      vanos,
      profundidades,
      mensulas: union(def.multi.mensulas, largos('mensula', 'multi')),
      vigasCelosia: union(def.multi.vigasCelosia, largos('viga_celosia', 'multi')),
      vigasPuente: union(def.multi.vigasPuente, largos('viga_puente', 'multi')),
    },
    bastidor: def.bastidor,
    canos: canos.length ? canos.sort((a, b) => a - b) : def.canos,
  };
}

export function catalogoDesdeFilas(filas: FilasCatalogo, opciones: { inferir?: boolean } = {}): { catalogo: Catalogo; avisos: AvisoCatalogo[] } {
  const inferir = opciones.inferir !== false;
  const avisos: AvisoCatalogo[] = [];
  const stockDe = new Map(filas.stock.map((s) => [s.pieza_id, s]));
  const filaDe = new Map(filas.piezas.map((p) => [p.codigo, p]));

  // Mapa: filas activas de tec_pieza_mapa (de códigos que existen) + las inferidas.
  const conFila = new Set(filas.mapa.map((m) => m.codigo));
  const mapa: EntradaMapa[] = [];
  const extra = new Map<string, { familia: Familia; sistema: SistemaPieza; rinde?: number; unidad?: string }>();
  let familiaInvalida = 0;
  for (const m of filas.mapa) {
    if (!m.activo || !filaDe.has(m.codigo)) continue;
    if (!esFamilia(m.familia)) { familiaInvalida++; continue; }
    const sistema = (m.sistema === 'multi' || m.sistema === 'bastidor' ? m.sistema : 'comun') as SistemaPieza;
    mapa.push({ familia: m.familia, sistema, largo: num(m.largo_m), alto: num(m.alto_m), ancho: num(m.ancho_m), variante: m.variante || null, codigo: m.codigo, prioridad: m.prioridad ?? 100 });
    const rinde = num(m.rinde ?? null);
    const prev = extra.get(m.codigo);
    if (!prev) extra.set(m.codigo, { familia: m.familia, sistema, rinde: rinde ?? undefined, unidad: m.unidad_compra || undefined });
    else if (rinde && !prev.rinde) prev.rinde = rinde;
  }
  if (familiaInvalida) avisos.push({ regla: 'catalogo.familia_invalida', texto: `${familiaInvalida} fila(s) de tec_pieza_mapa tienen una familia que el modelador no conoce: no se usan.` });

  let inferidas = 0;
  if (inferir) {
    for (const p of filas.piezas) {
      if (conFila.has(p.codigo) || !p.activo) continue;
      let ents: (EntradaInferida & { prioridad?: number })[] = mapeoPorCodigo(p.codigo);
      if (!ents.length) ents = mapeoPorDescripcion(p.descripcion || '');
      if (!ents.length) continue;
      inferidas++;
      for (const x of ents) {
        // prioridad 900+: si OT carga una fila a mano para la misma medida, gana la de OT
        mapa.push({ familia: x.familia, sistema: x.sistema, largo: x.largo, alto: x.alto, ancho: x.ancho, variante: x.variante, codigo: p.codigo, prioridad: 800 + (x.prioridad ?? 100) });
      }
      extra.set(p.codigo, { familia: ents[0].familia, sistema: ents[0].sistema, rinde: ents[0].rinde, unidad: ents[0].unidad });
    }
  }
  if (inferidas) avisos.push({ regla: 'catalogo.inferidas', texto: `${inferidas} código(s) sin fila en tec_pieza_mapa se mapearon por la convención del código o por la descripción. Conviene cargarlos en tec_pieza_mapa.` });

  const piezas: Record<string, ItemCatalogo> = {};
  for (const p of filas.piezas) {
    const ex = extra.get(p.codigo);
    const st = stockDe.get(p.id);
    const peso = num(p.peso_kg);
    piezas[p.codigo] = {
      codigo: p.codigo,
      piezaId: p.id,
      descripcion: p.descripcion,
      familia: ex?.familia ?? null,
      sistema: ex?.sistema ?? sistemaDeAndamio(p.sistema_andamio),
      unidad: ex?.unidad ?? unidadLegible(p.unidad_medida),
      ...(ex?.rinde ? { rinde: ex.rinde } : {}),
      peso_kg: peso !== null && peso > 0 ? peso : null,
      stock: st ? { enDeposito: st.en_deposito ?? 0, comprometido: st.comprometido ?? 0 } : null,
      activo: p.activo,
    };
  }

  const kits: Record<string, Record<string, number>> = {};
  for (const k of filas.kits) {
    if (!piezas[k.kit_codigo] || !piezas[k.pieza_codigo]) continue;
    const c = num(k.cantidad);
    if (!c || c <= 0) continue;
    (kits[k.kit_codigo] ||= {})[k.pieza_codigo] = c;
  }

  const medidas = medidasDesdeMapa(mapa, avisos);
  return { catalogo: { fuente: 'base', piezas, mapa, kits, medidas }, avisos };
}
