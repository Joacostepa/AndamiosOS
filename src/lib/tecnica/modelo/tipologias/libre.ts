/**
 * Estructura libre (pedido 8c): último recurso para lo que ninguna plantilla cubre. Es un esqueleto editado a
 * mano (operaciones de esqueleto). Las reglas NO se imponen: quedan como sugerencias con reparación.
 * Produce piezas y BOM con el mismo `armar` que el resto.
 */
import type { Esqueleto, Estructura, V2 } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { revisarEsqueleto } from '../reglas/motor-reglas.ts';
import { cotasNiveles, grillaRect } from './comunes/grilla.ts';
import { puerto, type PuertoLocal } from './comunes/util-tipologias.ts';
import { clamp, envolvente, num, r3, sum } from '../util.ts';

export interface ParamsLibre extends Record<string, unknown> {
  largo: number;
  profundidad: number;
  altura: number;
}

const DEF: ParamsLibre = { largo: 2.5, profundidad: 0.73, altura: 2 };

export function normalizarLibre(parcial: Partial<ParamsLibre>): { params: ParamsLibre; avisos: string[] } {
  const p = { ...DEF, ...(parcial || {}) } as ParamsLibre;
  p.largo = clamp(num(p.largo, 2.5), 0.2, 200);
  p.profundidad = clamp(num(p.profundidad, 0.73), 0.2, 10);
  p.altura = clamp(num(p.altura, 2), 0.5, 120);
  return { params: p, avisos: [] };
}

/** Esqueleto inicial a partir de largo × profundidad × alto (rellenado según el toggle de medida). */
export function esqueletoDesdeMedidas(est: Estructura & { params: ParamsLibre }, ctx: Pick<CtxGenerar, 'catalogo' | 'rellenar'>): Esqueleto {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const rel = ctx.rellenar(p.largo, est.sistema, { modo: est.medida, medidas: m });
  const prof = est.medida === 'libre' ? p.profundidad : m.multi.profundidades.reduce((b, x) => (Math.abs(x - p.profundidad) < Math.abs(b - p.profundidad) ? x : b), m.multi.profundidades[0]);
  let cotas: number[];
  let plataformas: number[];
  if (p.altura <= 2.5) {
    // un solo nivel de trabajo: arranque y plataforma arriba
    const arr = 0.25 + ((((p.altura - 0.25) % 0.5) + 0.5) % 0.5);
    cotas = [r3(arr), r3(Math.max(arr + 0.5, p.altura))];
    plataformas = [cotas[1]];
  } else {
    const cn = cotasNiveles({ altura: p.altura + 1, modo: 'solo_trabajo', topeExacto: true });
    cotas = cn.cotas;
    plataformas = cn.plataformas;
  }
  const g = grillaRect({ vanosS: rel.vanos, profundidades: [prof], cotas, plataformas, medidas: m, catalogo: ctx.catalogo, sistema: 'multi' });
  return g.esqueleto;
}

export function puertosDeEsqueleto(esq: Esqueleto): PuertoLocal[] {
  if (esq.puertos) return esq.puertos;
  if (!esq.columnas.length) return [];
  const xs = esq.columnas.map((c) => c.p[0]);
  const zs = esq.columnas.map((c) => c.p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const H = Math.max(...esq.columnas.map((c) => c.yTope));
  const colsX = [...new Set(xs.map(r3))].sort((a, b) => a - b).map((x) => r3(x - x0));
  return [
    puerto('frente', 'cara', 'Libre · frente', [x1, 0, z0], [x0, 0, z0], [0, 0, -1], colsX.map((c) => r3(x1 - x0 - c)).reverse(), H),
    puerto('fondo', 'cara', 'Libre · fondo', [x0, 0, z1], [x1, 0, z1], [0, 0, 1], colsX, H),
    puerto('izq', 'cara', 'Libre · lateral izq.', [x0, 0, z0], [x0, 0, z1], [-1, 0, 0], [0, r3(z1 - z0)], H),
    puerto('der', 'cara', 'Libre · lateral der.', [x1, 0, z1], [x1, 0, z0], [1, 0, 0], [0, r3(z1 - z0)], H),
    puerto('base', 'base', 'Libre · base', [x0, 0, z0], [x1, 0, z0], [0, 1, 0], colsX, 0),
  ];
}

export function metricasDeEsqueleto(esq: Esqueleto): Generado['metricas'] {
  const col = new Map(esq.columnas.map((c) => [c.id, c]));
  const ext = esq.vanos.filter((v) => v.cara === 'exterior');
  const ml = r3(sum(ext.map((v) => v.medida)));
  const m2 = r3(sum(ext.map((v) => v.medida * Math.max(col.get(v.a)?.yTope ?? 0, col.get(v.b)?.yTope ?? 0))));
  const alturaReal = esq.columnas.length ? Math.max(...esq.columnas.map((c) => c.yTope)) : 0;
  return { m2, ml, alturaReal, huella: envolvente(esq.columnas.map((c) => c.p as V2)) };
}

export function generarLibre(est: Estructura & { params: ParamsLibre }, ctx: CtxGenerar): Generado {
  const esq = est.esqueleto ? structuredClone(est.esqueleto) : esqueletoDesdeMedidas(est, ctx);
  const avisos = revisarEsqueleto(esq, est.id);
  if (est.convertidaDe) avisos.push({ regla: 'libre.convertida', nivel: 'info', estructuraId: est.id, texto: `Convertida desde «${est.convertidaDe.tipologia}»: ya no se regenera por parámetros.`, reparaciones: [] });
  return {
    esqueleto: esq,
    avisos,
    reglas: [],
    metricas: metricasDeEsqueleto(esq),
    puertos: puertosDeEsqueleto(esq),
    info: { libre: true, convertidaDe: est.convertidaDe?.tipologia ?? null },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo inicial', tipo: 'medida', unidad: 'm', min: 0.2, max: 200, grupo: 'Medidas', ayuda: 'Solo al crear: después se edita vano por vano.' },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad inicial', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.altura', etiqueta: 'Altura inicial', tipo: 'medida', unidad: 'm', min: 0.5, max: 120, grupo: 'Medidas' },
];

const PRESETS: Preset[] = [
  { id: 'libre_vacia', nombre: 'Estructura libre', icono: 'libre', descripcion: 'Un vano de 2,50 × 0,73 × 2,00 para crecer a mano en cualquier dirección.', params: { largo: 2.5, profundidad: 0.73, altura: 2 } },
  { id: 'libre_desde_medidas', nombre: 'Libre desde medidas', icono: 'libre', descripcion: 'Largo × profundidad × alto de la medida que quieras; después se retoca a mano.', params: { largo: 7.3, profundidad: 1.09, altura: 6 } },
];

export const LIBRE: Tipologia<ParamsLibre> = {
  id: 'libre',
  version: 1,
  nombre: 'Estructura libre',
  descripcion: 'Grilla 3D editable a mano: vanos, niveles, medidas y piezas por celda. Las reglas quedan como sugerencias.',
  categoria: 'libre',
  sistemas: ['multi', 'bastidor'],
  apoyos: ['suelo', 'colgado', 'sobre_estructura'],
  porDefecto: () => ({ ...DEF }),
  normalizar: normalizarLibre,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarLibre,
};
