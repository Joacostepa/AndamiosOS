/**
 * Del modelo al cómputo REAL (computos + computo_items). Puro, con tests.
 *
 * - lineasParaComputo: BOM → líneas por pieza de catalogo_piezas (lo sin código queda afuera, a la vista).
 * - diferenciasComputo: qué cambia contra lo que ya hay, línea por línea, y qué hay que decidir.
 * - planGeneracion: lo que va a quedar escrito. ES EL ESPEJO de la RPC tec_generar_computo
 *   (supabase/migrations/20261015000002_modelador_computos_rls.sql). Si cambia uno, cambiar el otro.
 * - origenAlGuardar: qué origen le queda a una fila cuando la editan a mano en la pantalla de cómputo.
 */
import type { Diseno, LineaBom, Resultado } from '../modelo/index.ts';
import { VERSION_MOTOR } from '../modelo/index.ts';
import type {
  DecisionDiff, DiffLinea, ItemComputoActual, LineaComputo, LineaOmitida, MetricasComputo, OrigenItem, ResumenModelo,
} from './tipos.ts';

/** Mismo set que src/lib/computos/estado.ts (ESTADOS_COMPLETADOS) y que la RPC. */
export const ESTADOS_COMPLETADOS: ReadonlySet<string> = new Set(['verificado', 'aprobado', 'en_preparacion', 'preparado']);
export const computoBloqueado = (estado: string | null | undefined) => !!estado && ESTADOS_COMPLETADOS.has(estado);

/** Agrupa la BOM por pieza de catalogo_piezas. Las cantidades del cómputo son enteras (hacia arriba). */
export function lineasParaComputo(bom: LineaBom[]): { lineas: LineaComputo[]; omitidas: LineaOmitida[] } {
  const porPieza = new Map<string, LineaComputo>();
  const omitidas: LineaOmitida[] = [];
  for (const l of bom) {
    if (!(l.cantidad > 0)) continue;
    if (!l.codigo || l.sinCodigo) {
      omitidas.push({ clave: l.clave, codigo: null, descripcion: l.descripcion, familia: l.familia, cantidad: l.cantidad, unidad: l.unidad, motivo: 'sin_codigo' });
      continue;
    }
    if (!l.piezaId) {
      omitidas.push({ clave: l.clave, codigo: l.codigo, descripcion: l.descripcion, familia: l.familia, cantidad: l.cantidad, unidad: l.unidad, motivo: 'sin_pieza' });
      continue;
    }
    const prev = porPieza.get(l.piezaId);
    if (prev) prev.cantidad += l.cantidad;
    else porPieza.set(l.piezaId, { pieza_id: l.piezaId, codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad });
  }
  const lineas = [...porPieza.values()].map((l) => ({ ...l, cantidad: Math.ceil(l.cantidad - 1e-9) })).filter((l) => l.cantidad > 0);
  lineas.sort((a, b) => a.codigo.localeCompare(b.codigo));
  return { lineas, omitidas };
}

export interface Resolucion {
  /** null = la fila se borra (o no se crea). */
  cantidad: number | null;
  origen: OrigenItem | null;
  modelo_cantidad: number | null;
  /** Para los contadores (los mismos de la RPC). */
  efecto: 'insertada' | 'actualizada' | 'borrada' | 'conservada' | 'igual' | 'nada';
}

/**
 * Qué pasa con UNA pieza. `actual` = la fila que hay (o null), `modelo` = lo que dice el modelo (o null
 * si el modelo ya no la tiene). Exactamente lo que hace la RPC.
 */
export function resolverLinea(actual: ItemComputoActual | null, modelo: number | null, decision?: DecisionDiff): Resolucion {
  if (modelo !== null && modelo > 0) {
    if (!actual) return { cantidad: modelo, origen: 'modelo', modelo_cantidad: modelo, efecto: 'insertada' };
    if (actual.origen === 'modelo') {
      return { cantidad: modelo, origen: 'modelo', modelo_cantidad: modelo, efecto: actual.cantidad_requerida === modelo ? 'igual' : 'actualizada' };
    }
    if (actual.cantidad_requerida === modelo) return { cantidad: modelo, origen: actual.origen, modelo_cantidad: modelo, efecto: 'igual' };
    const d = decision ?? 'mantener';
    if (d === 'modelo') return { cantidad: modelo, origen: 'modelo', modelo_cantidad: modelo, efecto: 'actualizada' };
    if (d === 'sumar') {
      const nueva = Math.max(0, modelo + (actual.cantidad_requerida - (actual.modelo_cantidad ?? 0)));
      return { cantidad: nueva, origen: 'modelo_editado', modelo_cantidad: modelo, efecto: 'actualizada' };
    }
    return { cantidad: actual.cantidad_requerida, origen: actual.origen, modelo_cantidad: modelo, efecto: 'conservada' };
  }
  if (!actual) return { cantidad: null, origen: null, modelo_cantidad: null, efecto: 'nada' };
  if (actual.origen === 'modelo') return { cantidad: null, origen: null, modelo_cantidad: null, efecto: 'borrada' };
  if (actual.origen === 'modelo_editado') {
    if ((decision ?? 'mantener') === 'borrar') return { cantidad: null, origen: null, modelo_cantidad: null, efecto: 'borrada' };
    return { cantidad: actual.cantidad_requerida, origen: 'modelo_editado', modelo_cantidad: 0, efecto: 'conservada' };
  }
  return { cantidad: actual.cantidad_requerida, origen: 'manual', modelo_cantidad: actual.modelo_cantidad, efecto: 'nada' };
}

function indexar(actuales: ItemComputoActual[]): Map<string, ItemComputoActual> {
  // Si una pieza está repetida (no hay unique en computo_items), manda la de origen 'modelo', como en la RPC.
  const m = new Map<string, ItemComputoActual>();
  for (const a of actuales) {
    const prev = m.get(a.pieza_id);
    if (!prev || (prev.origen !== 'modelo' && a.origen === 'modelo')) m.set(a.pieza_id, a);
  }
  return m;
}

/** Diferencias contra el cómputo actual, en el orden: decisiones primero, después cambios, después lo igual. */
export function diferenciasComputo(actuales: ItemComputoActual[], lineas: LineaComputo[]): DiffLinea[] {
  const act = indexar(actuales);
  const out: DiffLinea[] = [];
  const vistos = new Set<string>();
  for (const l of lineas) {
    vistos.add(l.pieza_id);
    const a = act.get(l.pieza_id) ?? null;
    const base = { pieza_id: l.pieza_id, codigo: l.codigo, descripcion: l.descripcion, origenActual: a?.origen ?? null, actual: a?.cantidad_requerida ?? null, modelo: l.cantidad };
    if (!a) { out.push({ ...base, tipo: 'nuevo', resultado: l.cantidad, opciones: [], decisionPorDefecto: null }); continue; }
    if (a.cantidad_requerida === l.cantidad) { out.push({ ...base, tipo: 'igual', resultado: l.cantidad, opciones: [], decisionPorDefecto: null }); continue; }
    if (a.origen === 'modelo') { out.push({ ...base, tipo: 'cambia', resultado: l.cantidad, opciones: [], decisionPorDefecto: null }); continue; }
    out.push({ ...base, tipo: 'conflicto_manual', resultado: a.cantidad_requerida, opciones: ['mantener', 'modelo', 'sumar'], decisionPorDefecto: 'mantener' });
  }
  for (const a of act.values()) {
    if (vistos.has(a.pieza_id)) continue;
    const base = { pieza_id: a.pieza_id, codigo: a.codigo ?? null, descripcion: a.descripcion ?? null, origenActual: a.origen, actual: a.cantidad_requerida, modelo: null };
    if (a.origen === 'modelo') out.push({ ...base, tipo: 'quita', resultado: null, opciones: [], decisionPorDefecto: null });
    else if (a.origen === 'modelo_editado') out.push({ ...base, tipo: 'quita_editado', resultado: a.cantidad_requerida, opciones: ['mantener', 'borrar'], decisionPorDefecto: 'mantener' });
    else out.push({ ...base, tipo: 'manual', resultado: a.cantidad_requerida, opciones: [], decisionPorDefecto: null });
  }
  const orden: Record<DiffLinea['tipo'], number> = { conflicto_manual: 0, quita_editado: 1, nuevo: 2, cambia: 3, quita: 4, manual: 5, igual: 6 };
  out.sort((x, y) => orden[x.tipo] - orden[y.tipo] || (x.codigo ?? '').localeCompare(y.codigo ?? ''));
  return out;
}

export function totalesDiff(diff: DiffLinea[]) {
  return {
    nuevas: diff.filter((d) => d.tipo === 'nuevo').length,
    cambian: diff.filter((d) => d.tipo === 'cambia').length,
    quitan: diff.filter((d) => d.tipo === 'quita').length,
    conflictos: diff.filter((d) => d.tipo === 'conflicto_manual' || d.tipo === 'quita_editado').length,
    iguales: diff.filter((d) => d.tipo === 'igual').length,
  };
}

/** Lo que va a quedar en computo_items después de generar, y los contadores que devuelve la RPC. */
export function planGeneracion(actuales: ItemComputoActual[], lineas: LineaComputo[], decisiones: Record<string, DecisionDiff> = {}) {
  const act = indexar(actuales);
  const modelo = new Map(lineas.map((l) => [l.pieza_id, l.cantidad]));
  const filas: { pieza_id: string; cantidad_requerida: number; origen: OrigenItem; modelo_cantidad: number | null }[] = [];
  const cont = { insertadas: 0, actualizadas: 0, borradas: 0, conservadas: 0, iguales: 0 };
  const ids = new Set([...modelo.keys(), ...act.keys()]);
  for (const id of ids) {
    const r = resolverLinea(act.get(id) ?? null, modelo.get(id) ?? null, decisiones[id]);
    if (r.efecto === 'insertada') cont.insertadas++;
    else if (r.efecto === 'actualizada') cont.actualizadas++;
    else if (r.efecto === 'borrada') cont.borradas++;
    else if (r.efecto === 'conservada') cont.conservadas++;
    else if (r.efecto === 'igual') cont.iguales++;
    if (r.cantidad !== null && r.origen) filas.push({ pieza_id: id, cantidad_requerida: r.cantidad, origen: r.origen, modelo_cantidad: r.modelo_cantidad });
  }
  return { filas, ...cont };
}

/**
 * Las decisiones que manda el cliente, limpias: solo para piezas que de verdad tienen algo que decidir y
 * solo opciones válidas para ese caso. Lo demás se descarta (la RPC usaría el default igual).
 */
export function decisionesValidas(diff: DiffLinea[], crudas: Record<string, string>): Record<string, DecisionDiff> {
  const out: Record<string, DecisionDiff> = {};
  for (const d of diff) {
    const v = crudas[d.pieza_id] as DecisionDiff | undefined;
    if (v && d.opciones.includes(v)) out[d.pieza_id] = v;
  }
  return out;
}

export { origenAlGuardar } from './origen.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Métricas que el cómputo guarda (superficie, ml, altura, sistema). */
export function metricasDe(res: Resultado, diseno: Diseno): MetricasComputo {
  const sistemas = new Set(diseno.estructuras.map((e) => e.sistema));
  const sistema = sistemas.size === 0 ? null : sistemas.has('multi') ? 'multidireccional' : 'tubular';
  return { m2: r2(res.resumen.m2), ml: r2(res.resumen.ml), alturaMax: r2(res.resumen.alturaMax), sistema };
}

/** Lo que se guarda en tec_modelos.resumen (la lista lo muestra sin construir). */
export function resumenDe(res: Resultado, diseno: Diseno): ResumenModelo {
  return {
    m2: r2(res.resumen.m2),
    ml: r2(res.resumen.ml),
    alturaMax: r2(res.resumen.alturaMax),
    pesoKg: Math.round(res.resumen.pesoKg),
    pesoParcial: res.resumen.pesoParcial,
    piezas: res.resumen.piezas,
    piezasAjuste: res.resumen.piezasAjuste,
    estructuras: diseno.estructuras.length,
    tipologias: [...new Set(diseno.estructuras.map((e) => e.tipologia))],
    sinCodigo: res.resumen.sinCodigo.slice(0, 50),
    avisos: { errores: res.avisos.filter((a) => a.nivel === 'error').length, avisos: res.avisos.filter((a) => a.nivel === 'aviso').length },
    texto: res.resumen.texto,
    motorVersion: VERSION_MOTOR,
  };
}
