/**
 * Estructura colgante (pedido 4, foto 4): sin apoyo en el suelo, suspendida de una losa, un puente u otra
 * estructura. Grilla multidireccional que cuelga desde la cota del soporte: columnas colgadas (sin bases),
 * colgadores de caño y grampa (con grampa de seguridad, placa o grampa de viga arriba y pasadores en los
 * empalmes) en cada vertical hasta el soporte, plataforma
 * abajo (y en los niveles intermedios), barandas en todo el perímetro y diagonales en las cuatro caras
 * más diagonal en planta en los extremos y cada ≤ 3 vanos (no hay base que la trabe). Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla, Volumen } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { grillaRect } from './comunes/grilla.ts';
import { colgar, type SoporteColgado } from './comunes/colgar.ts';
import { vanosArriostrados } from '../reglas/diagonales.ts';
import { puertosCaja } from './comunes/util-tipologias.ts';
import { type AvisoGen, barandasPerimetro, diagonalesPerimetro, diagonalPlanta, medida, metricasCaja, opcion, plataformaGrilla, tramosAncho, tramosDe } from './nuevas-comunes.ts';
import { EPS, fmt, r3 } from '../util.ts';

export interface ParamsColgante extends Record<string, unknown> {
  largo: number;
  ancho: number;
  /** cota de la cara inferior del soporte (losa o tablero del puente) */
  cotaSoporte: number;
  /** distancia del soporte a la plataforma de trabajo más baja */
  alturaColgada: number;
  /** plataformas: solo la de abajo o cada 2,00 */
  plataformas: 'abajo' | 'cada_2m';
  sujecion: 'cano_grampa' | 'viga_celosia' | 'anclaje_quimico';
  /** id de un volumen del contexto (losa, puente) del que cuelga: toma su cota inferior */
  volumenId: string;
  /** de qué se toma arriba: losa de hormigón (placa/bulón), ala de acero (grampa de viga) u otra estructura */
  soporte: SoporteColgado;
}

const DEF: ParamsColgante = { largo: 7.5, ancho: 2.5, cotaSoporte: 6, alturaColgada: 2.5, plataformas: 'abajo', sujecion: 'cano_grampa', volumenId: '', soporte: 'losa' };

export function normalizarColgante(parcial: Partial<ParamsColgante>): { params: ParamsColgante; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const p: ParamsColgante = {
    largo: medida(x.largo, DEF.largo, 1, 120),
    ancho: medida(x.ancho, DEF.ancho, 0.73, 20),
    cotaSoporte: medida(x.cotaSoporte, DEF.cotaSoporte, 2, 120),
    alturaColgada: medida(x.alturaColgada, DEF.alturaColgada, 1.5, 30),
    plataformas: opcion(x.plataformas, ['abajo', 'cada_2m'] as const, 'abajo'),
    sujecion: opcion(x.sujecion, ['cano_grampa', 'viga_celosia', 'anclaje_quimico'] as const, 'cano_grampa'),
    volumenId: typeof x.volumenId === 'string' ? x.volumenId : '',
    soporte: opcion(x.soporte, ['losa', 'acero', 'estructura'] as const, 'losa'),
  };
  const avisos: string[] = [];
  if (p.alturaColgada > p.cotaSoporte - 0.5) {
    p.alturaColgada = r3(Math.max(1.5, p.cotaSoporte - 0.5));
    avisos.push(`La estructura colgada no puede llegar al suelo: altura colgada ajustada a ${fmt(p.alturaColgada)}.`);
  }
  return { params: p, avisos };
}

export function generarColgante(est: Estructura & { params: ParamsColgante }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const vol: Volumen | undefined = p.volumenId ? ctx.diseno.contexto?.volumenes?.find((v) => v.id === p.volumenId) : undefined;
  if (p.volumenId && !vol) avisos.push({ regla: 'colgado.sin_volumen', nivel: 'aviso', estructuraId: est.id, texto: `No encuentro el volumen «${p.volumenId}»: uso la cota de soporte cargada (${fmt(p.cotaSoporte)}).`, reparaciones: [{ etiqueta: 'Desvincular', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.volumenId', valor: '' } }] });
  const cotaS = vol ? r3(vol.yBase) : p.cotaSoporte;
  const yP = r3(cotaS - p.alturaColgada);
  if (yP < 0.5) avisos.push({ regla: 'colgado.al_suelo', nivel: 'error', estructuraId: est.id, texto: `La plataforma quedaría a ${fmt(yP)}: con ese soporte conviene apoyarla en el suelo.`, reparaciones: [] });
  // anillos: plataforma abajo y cada 2,00 hacia arriba, el último a ≥ 0,15 del soporte (en la fase de la plataforma)
  const topes = r3(yP + CRITERIOS.pasoRoseta * Math.floor((cotaS - 0.15 - yP) / CRITERIOS.pasoRoseta + EPS));
  const cotas: number[] = [yP];
  for (let c = r3(yP + CRITERIOS.pasoNivel); c < topes - EPS; c = r3(c + CRITERIOS.pasoNivel)) cotas.push(c);
  if (topes > yP + 0.4) cotas.push(topes);
  const plats = p.plataformas === 'cada_2m' ? cotas.filter((c) => c < topes - 1 + EPS) : [yP];
  const g = grillaRect({ vanosS: tramosDe(p.largo, est.medida, m), profundidades: tramosAncho(p.ancho, est.medida, m), cotas, yTope: Math.max(topes, r3(yP + 1)), apoyo: 'colgada', diagonales: false, barandas: false, catalogo: cat, medidas: m });
  const b = g.b;
  for (const c of plats) {
    const k = b.k(c);
    plataformaGrilla(b, g, k);
    barandasPerimetro(b, g, k);
  }
  const nd = diagonalesPerimetro(b, cat, g);
  // sin base que la trabe: diagonal en planta en los extremos y cada ≤ 3 vanos, abajo y en el anillo de arriba
  let ndp = 0;
  const kArriba = b.k(cotas[cotas.length - 1]);
  for (const k of [...new Set([b.k(yP), kArriba])]) for (const i of vanosArriostrados(g.S.length - 1, 3)) for (let j = 0; j < g.T.length - 1; j++) {
    for (const e of diagonalPlanta(b, cat, g, i, j, k, 'col')) b.elemento(e);
    ndp++;
  }
  for (const a of colgar(b.esq, { cota: cotaS, sujecion: p.sujecion, soporte: p.soporte, estructuraId: est.id, medidas: m })) avisos.push(a);
  if (topes - yP < 1 - EPS) avisos.push({ regla: 'colgado.baranda', nivel: 'aviso', estructuraId: est.id, texto: `Entre la plataforma y el soporte hay ${fmt(cotaS - yP)}: no entra la baranda de 1,00.`, reparaciones: [{ etiqueta: 'Bajar la plataforma', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.alturaColgada', valor: 2 } }] });
  reglas.push({ regla: 'colgado.armado', estructuraId: est.id, texto: `Colgada de ${vol ? `«${vol.nombre || vol.id}»` : 'un soporte'} a ${fmt(cotaS)}: ${b.esq.columnas.length} colgadores (${p.sujecion.replace('_', ' ')}), plataforma a ${fmt(yP)}, ${nd} diagonales y ${ndp} diagonales en planta. Sin bases.` });
  const L = g.S[g.S.length - 1];
  const B = g.T[g.T.length - 1];
  return {
    esqueleto: b.esq, avisos, reglas, sinReglas: ['bases'],
    metricas: metricasCaja(L, B, cotaS),
    puertos: puertosCaja('Colgante', g.S, L, B, cotaS, cotaS),
    info: { apoyo: 'suspendido', cotaSoporte: cotaS, plataforma: yP, volumenId: vol?.id ?? null },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', min: 1, max: 120, grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Ancho', tipo: 'medida', unidad: 'm', min: 0.73, max: 20, grupo: 'Medidas' },
  { ruta: 'params.cotaSoporte', etiqueta: 'Cota del soporte', tipo: 'medida', unidad: 'm', min: 2, max: 120, paso: 0.05, grupo: 'Apoyo', ayuda: 'Cara inferior de la losa o del puente. Si elegís un volumen, se toma de ahí.', visibleSi: { ruta: 'params.volumenId', igual: '' } },
  { ruta: 'params.volumenId', etiqueta: 'Colgar de', tipo: 'volumen', volumenes: ['losa', 'puente', 'edificio'], grupo: 'Apoyo', ayuda: 'La losa o el puente del que cuelga. Si no hay, «Crear uno» lo arma a la cota del soporte.' },
  { ruta: 'params.alturaColgada', etiqueta: 'Altura colgada', tipo: 'medida', unidad: 'm', min: 1.5, max: 30, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.plataformas', etiqueta: 'Plataformas', tipo: 'opcion', opciones: [{ valor: 'abajo', etiqueta: 'Solo abajo' }, { valor: 'cada_2m', etiqueta: 'Cada 2,00' }], grupo: 'Medidas' },
  { ruta: 'params.soporte', etiqueta: 'Se toma de', tipo: 'opcion', opciones: [{ valor: 'losa', etiqueta: 'Losa de hormigón (placa y bulón)' }, { valor: 'acero', etiqueta: 'Viga de acero (grampa de viga)' }, { valor: 'estructura', etiqueta: 'Otra estructura de andamio' }], grupo: 'Apoyo' },
  { ruta: 'params.sujecion', etiqueta: 'Sujeción', tipo: 'opcion', opciones: [{ valor: 'cano_grampa', etiqueta: 'Caño y grampa' }, { valor: 'viga_celosia', etiqueta: 'Colgadores desde vigas arriba' }, { valor: 'anclaje_quimico', etiqueta: 'Colgadores con anclaje químico' }], grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'colgante_puente', nombre: 'Colgante bajo puente', icono: 'colgante', descripcion: 'Plataforma colgada bajo el tablero de un puente, con barandas y diagonales.', params: { largo: 12.5, ancho: 3.5, cotaSoporte: 5, alturaColgada: 2.5, soporte: 'acero' } },
  { id: 'colgante_losa', nombre: 'Colgante de losa', icono: 'colgante', descripcion: 'Estructura colgada de una losa con caño y grampa, sin apoyo en el suelo.', params: { largo: 5, ancho: 1.5, cotaSoporte: 8, alturaColgada: 4.5, plataformas: 'cada_2m' } },
];

export const COLGANTE: Tipologia<ParamsColgante> = {
  id: 'colgante',
  version: 1,
  nombre: 'Estructura colgante',
  descripcion: 'Suspendida de una losa, un puente u otra estructura, sin apoyo en el suelo.',
  categoria: 'especial',
  sistemas: ['multi'],
  apoyos: ['colgado'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarColgante,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarColgante,
};
