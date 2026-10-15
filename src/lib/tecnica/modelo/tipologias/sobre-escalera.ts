/**
 * Estructura sobre escalera (pedido 8b, foto 12): las columnas apoyan a distinto nivel siguiendo los peldaños
 * o el descanso, cada una con base regulable y arrancando en la roseta alcanzable (todas en la fase de la
 * plataforma, así los anillos caen en rosetas). El perfil de apoyo es editable (lista de tramos s → cota) o
 * sale de una escalera paramétrica o de un volumen «escalera» del contexto.
 * El armador `armarEscalonada` lo usa también la plataforma en hueco de escalera. Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla, TramoVano, V2, Volumen } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { grillaRect, type GrillaRect } from './comunes/grilla.ts';
import { apoyoEscalonado, muestrearEscalera } from './comunes/apoyo-escalonado.ts';
import { puertosCaja } from './comunes/util-tipologias.ts';
import {
  anclarLinea, type AvisoGen, barandasPerimetro, cotasEscalonadas, type DefEscalera, diagonalesPerimetro, ksDe, medida, metricasCaja, normalizarPerfil,
  opcion, perfilDeEscalera, plataformaGrilla, type TramoPerfil, tramosAncho, tramosDe, ySueloPerfil,
} from './nuevas-comunes.ts';
import { EPS, fmt, marco, r3 } from '../util.ts';

export const ESCALERA_DEF: DefEscalera = { inicio: 0.6, huella: 0.3, contrahuella: 0.175, peldanos: 12, descansoTras: 0, descansoLargo: 1.2, y0: 0 };

export function normalizarEscalera(v: unknown): DefEscalera {
  const x = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    inicio: medida(x.inicio, ESCALERA_DEF.inicio, -20, 50),
    huella: medida(x.huella, ESCALERA_DEF.huella, 0.2, 0.45),
    contrahuella: medida(x.contrahuella, ESCALERA_DEF.contrahuella, 0.1, 0.25),
    peldanos: Math.round(medida(x.peldanos, ESCALERA_DEF.peldanos, 1, 60)),
    descansoTras: Math.round(medida(x.descansoTras, 0, 0, 60)),
    descansoLargo: medida(x.descansoLargo, 1.2, 0.6, 4),
    y0: medida(x.y0, 0, -10, 100),
  };
}

export interface OpcionesEscalonada {
  vanosS: TramoVano[];
  vanosT: TramoVano[];
  /** cota de la plataforma de trabajo */
  cota: number;
  ySuelo: (p: V2) => number;
  plataforma: 'tablones' | 'fenolico';
  /** plataformas también cada 2,00 por debajo */
  intermedias: boolean;
  /** caras sin baranda (contra un muro) */
  sinBaranda?: ('frente' | 'fondo' | 'izq' | 'der')[];
  /** todo con caño y grampa (horizontales, barandas y diagonales) */
  canoGrampa?: boolean;
}

/** Arma una grilla con apoyos a distinto nivel (fase de rosetas de la plataforma). */
export function armarEscalonada(est: Estructura, ctx: CtxGenerar, o: OpcionesEscalonada): { g: GrillaRect; avisos: AvisoGen[]; reglas: Omit<Regla, 'id'>[]; bases: number[] } {
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const S = [0];
  for (const t of o.vanosS) S.push(r3(S[S.length - 1] + t.medida));
  const T = [0];
  for (const t of o.vanosT) T.push(r3(T[T.length - 1] + t.medida));
  const suelos: number[] = [];
  for (const s of S) for (const t of T) suelos.push(r3(o.ySuelo([s, t])));
  const P = r3(o.cota);
  const sMax = Math.max(...suelos);
  if (P < sMax + 1 - EPS) avisos.push({ regla: 'escalera.cota', nivel: 'error', estructuraId: est.id, texto: `La plataforma a ${fmt(P)} queda a menos de 1,00 del peldaño más alto (${fmt(sMax)}).`, reparaciones: [{ etiqueta: `Subir a ${fmt(r3(sMax + 2))}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.cota', valor: r3(sMax + 2) } }] });
  const ce = cotasEscalonadas(P, suelos);
  const plats = o.intermedias ? ce.cotas.filter((c) => c <= P + EPS && (P - c) % CRITERIOS.pasoNivel < 0.01 && c > Math.max(...ce.bases) + 1 - EPS) : [P];
  const g = grillaRect({ vanosS: o.vanosS, profundidades: o.vanosT, cotas: ce.cotas, yTope: r3(P + 1), diagonales: false, barandas: false, catalogo: cat, medidas: cat.medidas });
  const b = g.b;
  avisos.push(...apoyoEscalonado(b.esq, o.ySuelo, { estructuraId: est.id }));
  const sin = new Set(o.sinBaranda || []);
  for (const c of plats) {
    const k = b.k(c);
    plataformaGrilla(b, g, k, o.plataforma);
    barandasPerimetro(b, g, k, { frente: !sin.has('frente'), fondo: !sin.has('fondo'), izq: !sin.has('izq'), der: !sin.has('der') });
  }
  if (o.canoGrampa) for (const v of b.esq.vanos) for (let k = 0; k < b.esq.cotas.length; k++) b.celda(v.id, k, { cano: true });
  const nd = diagonalesPerimetro(b, cat, g);
  const niveles = new Set(b.esq.columnas.map((c) => c.yBase)).size;
  reglas.push({ regla: 'escalera.apoyos', estructuraId: est.id, texto: `Apoyos a ${niveles} nivel${niveles > 1 ? 'es' : ''} distinto${niveles > 1 ? 's' : ''} con base regulable; ${nd} diagonales roseta a roseta${o.canoGrampa ? ' (todo con caño y grampa)' : ''}.` });
  return { g, avisos, reglas, bases: ce.bases };
}

/** Función de suelo: volumen «escalera» del contexto o perfil propio (en coordenadas de la estructura). */
export function sueloDe(est: Estructura, ctx: CtxGenerar, perfil: TramoPerfil[], volumenId: string, avisos: AvisoGen[]): (p: V2) => number {
  if (volumenId) {
    const vol: Volumen | undefined = ctx.diseno.contexto?.volumenes?.find((v) => v.id === volumenId);
    if (vol?.escalera) {
      const f = muestrearEscalera(vol);
      const mk = marco(est.origen, est.rumbo);
      return (p) => f(mk.P(p));
    }
    avisos.push({ regla: 'escalera.sin_volumen', nivel: 'aviso', estructuraId: est.id, texto: `No encuentro la escalera «${volumenId}»: uso el perfil cargado.`, reparaciones: [] });
  }
  return (p) => ySueloPerfil(perfil, p[0]);
}

export interface ParamsSobreEscalera extends Record<string, unknown> {
  largo: number;
  ancho: number;
  /** cota de la plataforma de trabajo */
  cota: number;
  escalera: DefEscalera;
  /** perfil de apoyo editable (s → cota del suelo); si está, manda sobre la escalera paramétrica */
  perfil: TramoPerfil[] | null;
  volumenId: string;
  intermedias: boolean;
  contraMuro: 'ninguno' | 'frente' | 'fondo';
  /** anclada al muro de la escalera (lado contraMuro, o el fondo) */
  anclada: boolean;
}

const DEF: ParamsSobreEscalera = { largo: 5, ancho: 1.09, cota: 4.5, escalera: ESCALERA_DEF, perfil: null, volumenId: '', intermedias: false, contraMuro: 'ninguno', anclada: false };

export function normalizarSobreEscalera(parcial: Partial<ParamsSobreEscalera>): { params: ParamsSobreEscalera; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const p: ParamsSobreEscalera = {
    largo: medida(x.largo, DEF.largo, 0.73, 40),
    ancho: medida(x.ancho, DEF.ancho, 0.73, 10),
    cota: medida(x.cota, DEF.cota, 1.5, 60),
    escalera: normalizarEscalera(x.escalera),
    perfil: normalizarPerfil(x.perfil),
    volumenId: typeof x.volumenId === 'string' ? x.volumenId : '',
    intermedias: !!x.intermedias,
    contraMuro: opcion(x.contraMuro, ['ninguno', 'frente', 'fondo'] as const, 'ninguno'),
    anclada: !!x.anclada,
  };
  return { params: p, avisos: [] };
}

export function generarSobreEscalera(est: Estructura & { params: ParamsSobreEscalera }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const avisos: AvisoGen[] = [];
  const perfil = p.perfil || perfilDeEscalera(p.escalera);
  const ySuelo = sueloDe(est, ctx, perfil, p.volumenId, avisos);
  const r = armarEscalonada(est, ctx, {
    vanosS: tramosDe(p.largo, est.medida, m), vanosT: tramosAncho(p.ancho, est.medida, m), cota: p.cota, ySuelo,
    plataforma: 'tablones', intermedias: p.intermedias, sinBaranda: p.contraMuro === 'ninguno' ? [] : [p.contraMuro],
  });
  avisos.push(...r.avisos);
  const { g } = r;
  const L = g.S[g.S.length - 1];
  const B = g.T[g.T.length - 1];
  const H = r3(p.cota + 1 - Math.min(...r.bases));
  const b = g.b;
  if (p.anclada) {
    const fondo = p.contraMuro !== 'frente';
    const linea = g.col.map((c) => c[fondo ? c.length - 1 : 0]);
    const n = anclarLinea(b, linea, ksDe(b, b.esq.cotas.filter((c) => c > Math.max(...r.bases) + 1 - EPS)), fondo ? [0, 1] : [0, -1], 0.2);
    r.reglas.push({ regla: 'escalera.anclajes', estructuraId: est.id, texto: `${n} anclajes al muro de la escalera.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
  } else if (H / Math.min(L, B) > CRITERIOS.hbMax + EPS) {
    avisos.push({ regla: 'esbeltez.hb', nivel: 'aviso', estructuraId: est.id, texto: `${est.nombre}: H/B = ${fmt(H / Math.min(L, B), 1)} > ${CRITERIOS.hbMax} sin anclar. ${PREDIMENSIONADO}.`, reparaciones: [{ etiqueta: 'Anclar al muro', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: true } }, { etiqueta: 'Ensanchar', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.ancho', valor: r3(Math.min(10, H / CRITERIOS.hbMax)) } }] });
  }
  return {
    esqueleto: g.b.esq, avisos, reglas: r.reglas,
    metricas: metricasCaja(L, B, r3(p.cota + 1)),
    puertos: puertosCaja('Sobre escalera', g.S, L, B, r3(p.cota + 1), r3(p.cota + 1)),
    info: { perfil, cota: p.cota, bases: [...new Set(r.bases)].sort((a, b) => a - b) },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo (a lo largo de la escalera)', tipo: 'medida', unidad: 'm', min: 0.73, max: 40, catalogo: 'vanos', grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Ancho', tipo: 'medida', unidad: 'm', min: 0.73, max: 10, catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.cota', etiqueta: 'Cota de la plataforma', tipo: 'medida', unidad: 'm', min: 1.5, max: 60, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.escalera.peldanos', etiqueta: 'Peldaños', tipo: 'entero', min: 1, max: 60, grupo: 'Apoyo' },
  { ruta: 'params.escalera.huella', etiqueta: 'Huella', tipo: 'medida', unidad: 'm', min: 0.2, max: 0.45, paso: 0.01, grupo: 'Apoyo' },
  { ruta: 'params.escalera.contrahuella', etiqueta: 'Contrahuella', tipo: 'medida', unidad: 'm', min: 0.1, max: 0.25, paso: 0.005, grupo: 'Apoyo' },
  { ruta: 'params.escalera.inicio', etiqueta: 'Primer peldaño a', tipo: 'medida', unidad: 'm', min: -20, max: 50, paso: 0.05, grupo: 'Apoyo' },
  { ruta: 'params.escalera.descansoTras', etiqueta: 'Descanso después del peldaño', tipo: 'entero', min: 0, max: 60, grupo: 'Apoyo' },
  { ruta: 'params.perfil', etiqueta: 'Perfil de apoyo (s → cota)', tipo: 'lista_medidas', grupo: 'Avanzado', ayuda: 'Tramos a mano: desde s, el suelo está a la cota y. Manda sobre la escalera.' },
  { ruta: 'params.volumenId', etiqueta: 'Escalera del contexto', tipo: 'texto', grupo: 'Apoyo' },
  { ruta: 'params.intermedias', etiqueta: 'Plataformas intermedias', tipo: 'bool', grupo: 'Medidas' },
  { ruta: 'params.anclada', etiqueta: 'Anclada al muro', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.contraMuro', etiqueta: 'Lado contra el muro', tipo: 'opcion', opciones: [{ valor: 'ninguno', etiqueta: 'Ninguno' }, { valor: 'frente', etiqueta: 'Frente' }, { valor: 'fondo', etiqueta: 'Fondo' }], grupo: 'Protección' },
];

const PRESETS: Preset[] = [
  { id: 'sobre_escalera', nombre: 'Estructura sobre escalera', icono: 'escalera', descripcion: 'Andamio con apoyos escalonados siguiendo los peldaños, bases regulables y plataforma arriba.', params: {} },
];

export const SOBRE_ESCALERA: Tipologia<ParamsSobreEscalera> = {
  id: 'sobre_escalera',
  version: 1,
  nombre: 'Sobre escalera',
  descripcion: 'Estructura con apoyos a distinto nivel siguiendo peldaños o descansos, con bases regulables.',
  categoria: 'especial',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarSobreEscalera,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarSobreEscalera,
};
