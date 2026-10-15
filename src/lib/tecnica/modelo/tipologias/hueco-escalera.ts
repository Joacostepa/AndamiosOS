/**
 * Plataforma en hueco de escalera (pedido 8b, foto 13): plataforma de trabajo que cubre el hueco, apoyada en
 * los escalones y los descansos (apoyos a distinto nivel con base regulable), piso de fenólico sobre correas
 * de caño cada ≤ 0,50 (placas contadas sobre toda la superficie) o tablones,
 * baranda doble y rodapié en todo el perímetro. Se puede armar todo con caño y grampa como en la foto.
 * Usa el mismo armador escalonado que «Sobre escalera». Todo es PREDIMENSIONADO.
 */
import type { Estructura } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { puertosCaja } from './comunes/util-tipologias.ts';
import { armarEscalonada, ESCALERA_DEF, normalizarEscalera, sueloDe } from './sobre-escalera.ts';
import { type AvisoGen, canoGrampa, type DefEscalera, medida, metricasCaja, normalizarPerfil, opcion, perfilDeEscalera, type TramoPerfil, tramosAncho, tramosDe } from './nuevas-comunes.ts';
import { fmt, r3 } from '../util.ts';

export interface ParamsHuecoEscalera extends Record<string, unknown> {
  /** largo del hueco (a lo largo del tramo de la escalera) */
  largo: number;
  /** ancho del hueco */
  ancho: number;
  cota: number;
  piso: 'fenolico' | 'tablones';
  armado: 'multi' | 'cano_grampa';
  escalera: DefEscalera;
  perfil: TramoPerfil[] | null;
  volumenId: string;
}

const DEF: ParamsHuecoEscalera = {
  largo: 3.5, ancho: 2.5, cota: 3.2, piso: 'fenolico', armado: 'multi',
  escalera: { ...ESCALERA_DEF, inicio: 0.3, peldanos: 8, descansoTras: 0 }, perfil: null, volumenId: '',
};

export function normalizarHuecoEscalera(parcial: Partial<ParamsHuecoEscalera>): { params: ParamsHuecoEscalera; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const p: ParamsHuecoEscalera = {
    largo: medida(x.largo, DEF.largo, 0.73, 20),
    ancho: medida(x.ancho, DEF.ancho, 0.73, 10),
    cota: medida(x.cota, DEF.cota, 1.5, 40),
    piso: opcion(x.piso, ['fenolico', 'tablones'] as const, 'fenolico'),
    armado: opcion(x.armado, ['multi', 'cano_grampa'] as const, 'multi'),
    escalera: normalizarEscalera(x.escalera ?? DEF.escalera),
    perfil: normalizarPerfil(x.perfil),
    volumenId: typeof x.volumenId === 'string' ? x.volumenId : '',
  };
  return { params: p, avisos: [] };
}

export function generarHuecoEscalera(est: Estructura & { params: ParamsHuecoEscalera }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const avisos: AvisoGen[] = [];
  const perfil = p.perfil || perfilDeEscalera(p.escalera);
  const ySuelo = sueloDe(est, ctx, perfil, p.volumenId, avisos);
  const r = armarEscalonada(est, ctx, {
    vanosS: tramosDe(p.largo, est.medida, m), vanosT: tramosAncho(p.ancho, est.medida, m), cota: p.cota, ySuelo,
    plataforma: p.piso, intermedias: false, canoGrampa: p.armado === 'cano_grampa',
  });
  avisos.push(...r.avisos);
  const { g } = r;
  const L = g.S[g.S.length - 1];
  const B = g.T[g.T.length - 1];
  let correas = 0;
  if (p.piso === 'fenolico') {
    // foto 13: el fenólico apoya sobre correas de caño cada ≤ 0,50 (no cubre 2,00 de luz solo). Las correas
    // corren a lo largo (s) sobre las horizontales transversales; el fenólico se cuenta sobre toda la superficie.
    const b = g.b;
    const k = b.k(p.cota);
    for (const fila of g.panos) for (const pid of fila) b.celdaPano(pid, k, { plataforma: null, fenolico: false });
    const sep = 0.5;
    const n = Math.max(1, Math.ceil(B / sep - 1e-9) - 1);
    const y = r3(p.cota + 0.05);
    for (let j = 1; j <= n; j++) {
      const t = r3((B * j) / (n + 1));
      for (const e of canoGrampa(`cor${j}`, [g.S[0], y, t], [L, y, t], { grupo: 'plataforma', canos: m.canos })) b.elemento(e);
      // una grampa más por cada horizontal transversal intermedia que cruza
      for (let i = 1; i < g.S.length - 1; i++) b.elemento({ id: `cor${j}:x${i}`, familia: 'grampa_fija', medidas: {}, a: [g.S[i], y, t], b: [g.S[i], y, t], grupo: 'plataforma', sistema: 'comun' });
      correas++;
    }
    b.elemento({ id: 'fen', familia: 'fenolico', medidas: {}, a: [g.S[0], r3(y + 0.05), g.T[0]], b: [L, r3(y + 0.05), B], medida: r3(L * B), grupo: 'plataforma', sistema: 'comun' });
  }
  r.reglas.push({ regla: 'hueco.piso', estructuraId: est.id, texto: `Piso de ${p.piso === 'fenolico' ? `fenólico sobre ${correas} correas de caño cada ≤ 0,50` : 'tablones'} de ${fmt(L)} × ${fmt(B)} a ${fmt(p.cota)} cubriendo el hueco, baranda doble y rodapié en todo el perímetro.` });
  return {
    esqueleto: g.b.esq, avisos, reglas: r.reglas,
    metricas: metricasCaja(L, B, r3(p.cota + 1)),
    puertos: puertosCaja('Hueco de escalera', g.S, L, B, r3(p.cota + 1), r3(p.cota + 1)),
    info: { perfil, cota: p.cota, bases: [...new Set(r.bases)].sort((a, b) => a - b), piso: p.piso },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo del hueco', tipo: 'medida', unidad: 'm', min: 0.73, max: 20, grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Ancho del hueco', tipo: 'medida', unidad: 'm', min: 0.73, max: 10, grupo: 'Medidas' },
  { ruta: 'params.cota', etiqueta: 'Cota de la plataforma', tipo: 'medida', unidad: 'm', min: 1.5, max: 40, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.piso', etiqueta: 'Piso', tipo: 'opcion', opciones: [{ valor: 'fenolico', etiqueta: 'Fenólico' }, { valor: 'tablones', etiqueta: 'Tablones' }], grupo: 'Medidas' },
  { ruta: 'params.armado', etiqueta: 'Armado', tipo: 'opcion', opciones: [{ valor: 'multi', etiqueta: 'Multidireccional' }, { valor: 'cano_grampa', etiqueta: 'Caño y grampa' }], grupo: 'Medidas' },
  { ruta: 'params.escalera.peldanos', etiqueta: 'Peldaños', tipo: 'entero', min: 1, max: 60, grupo: 'Apoyo' },
  { ruta: 'params.escalera.huella', etiqueta: 'Huella', tipo: 'medida', unidad: 'm', min: 0.2, max: 0.45, paso: 0.01, grupo: 'Apoyo' },
  { ruta: 'params.escalera.contrahuella', etiqueta: 'Contrahuella', tipo: 'medida', unidad: 'm', min: 0.1, max: 0.25, paso: 0.005, grupo: 'Apoyo' },
  { ruta: 'params.perfil', etiqueta: 'Perfil de apoyo (s → cota)', tipo: 'lista_medidas', grupo: 'Avanzado' },
  { ruta: 'params.volumenId', etiqueta: 'Escalera del contexto', tipo: 'texto', grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'hueco_escalera', nombre: 'Plataforma en hueco de escalera', icono: 'plataforma', descripcion: 'Plataforma de fenólico que cubre el hueco, apoyada en los escalones, con barandas.', params: {} },
];

export const HUECO_ESCALERA: Tipologia<ParamsHuecoEscalera> = {
  id: 'hueco_escalera',
  version: 1,
  nombre: 'Hueco de escalera',
  descripcion: 'Plataforma de trabajo que cubre el hueco de una escalera, apoyada en escalones y descansos.',
  categoria: 'especial',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarHuecoEscalera,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarHuecoEscalera,
};
