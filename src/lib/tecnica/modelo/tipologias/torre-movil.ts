/**
 * Torre móvil (pedido 8b, fotos 14 y 15): ruedas con freno, diagonales en las cuatro caras, diagonal en
 * planta en la base, plataformas de descanso con trampilla (escotilla) y escalera interior, y estabilizadores.
 * Altura máxima con ruedas según H/B ⚠ (interior 3,5 : 1, exterior 3 : 1, con la B efectiva de los
 * estabilizadores): si se pasa, error con «Agregar estabilizadores» o «Bajar a X m». Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { cotasNiveles, grillaRect } from './comunes/grilla.ts';
import { escaleraInterior } from './comunes/escalera-interior.ts';
import { estabilizadores, ruedas } from './comunes/ruedas.ts';
import { puertosCaja } from './comunes/util-tipologias.ts';
import { type AvisoGen, diagonalesPerimetro, diagonalPlanta, medida, metricasCaja, opcion, profundidadDe, tramosDe } from './nuevas-comunes.ts';
import { EPS, fmt, r3 } from '../util.ts';

export interface ParamsTorreMovil extends Record<string, unknown> {
  largo: number;
  ancho: number;
  /** cota de la plataforma de trabajo superior */
  alturaPlataforma: number;
  uso: 'interior' | 'exterior';
  estabilizadores: boolean;
  brazoEstabilizador: number;
  acceso: 'escalera_interior' | 'ninguno';
  /** plataformas de descanso cada 2,00 (con trampilla) */
  descansos: boolean;
}

const DEF: ParamsTorreMovil = { largo: 2.5, ancho: 1.5, alturaPlataforma: 4, uso: 'interior', estabilizadores: false, brazoEstabilizador: 1.5, acceso: 'escalera_interior', descansos: true };

export function normalizarTorreMovil(parcial: Partial<ParamsTorreMovil>): { params: ParamsTorreMovil; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const p: ParamsTorreMovil = {
    largo: medida(x.largo, DEF.largo, 0.73, 3),
    ancho: medida(x.ancho, DEF.ancho, 0.73, 2.5),
    alturaPlataforma: medida(x.alturaPlataforma, DEF.alturaPlataforma, 1, 20),
    uso: opcion(x.uso, ['interior', 'exterior'] as const, 'interior'),
    estabilizadores: !!x.estabilizadores,
    brazoEstabilizador: medida(x.brazoEstabilizador, DEF.brazoEstabilizador, 0.5, 3),
    acceso: opcion(x.acceso, ['escalera_interior', 'ninguno'] as const, 'escalera_interior'),
    descansos: x.descansos === undefined ? true : !!x.descansos,
  };
  return { params: p, avisos: [] };
}

/** Plataforma más alta (en la grilla de rosetas) que respeta H/B con ruedas. */
export function alturaMaximaMovil(B: number, uso: 'interior' | 'exterior'): number {
  const hb = uso === 'exterior' ? CRITERIOS.hbMovilExterior : CRITERIOS.hbMovilInterior;
  const H = hb * B;
  return r3(Math.max(0.5, Math.floor((H - 1 + EPS) / CRITERIOS.pasoRoseta) * CRITERIOS.pasoRoseta));
}

export function generarTorreMovil(est: Estructura & { params: ParamsTorreMovil }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const vanosS = tramosDe(p.largo, est.medida, m);
  const prof = profundidadDe(p.ancho, est.medida, m, [...m.multi.profundidades, 1.5]);
  const cn = cotasNiveles({ altura: p.alturaPlataforma + 1, modo: p.descansos ? 'cada_nivel' : 'solo_trabajo' });
  const g = grillaRect({ vanosS, profundidades: [prof], cotas: cn.cotas, plataformas: cn.plataformas, diagonales: false, catalogo: cat, medidas: m, apoyo: 'rueda_freno' });
  const b = g.b;
  const nd = diagonalesPerimetro(b, cat, g);
  for (let i = 0; i < vanosS.length; i++) for (const e of diagonalPlanta(b, cat, g, i, 0, 0, 'tm')) b.elemento(e);
  let Bef = Math.min(g.S[g.S.length - 1], g.T[1]);
  if (p.estabilizadores) {
    Bef = estabilizadores(b.esq, p.brazoEstabilizador);
    reglas.push({ regla: 'movil.estabilizadores', estructuraId: est.id, texto: `4 estabilizadores de ${fmt(p.brazoEstabilizador)}: base efectiva ${fmt(Bef)} ⚠.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.estabilizadores', valor: false } });
  }
  const rr = ruedas(b.esq, { freno: true, exterior: p.uso === 'exterior', estructuraId: est.id, bEfectiva: Bef });
  if (rr.avisos.length) {
    const max = alturaMaximaMovil(Bef, p.uso);
    const reps: AvisoGen['reparaciones'] = [];
    if (!p.estabilizadores) reps.push({ etiqueta: 'Agregar estabilizadores', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.estabilizadores', valor: true } });
    reps.push({ etiqueta: `Bajar a ${fmt(max)} m`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.alturaPlataforma', valor: max } });
    avisos.push({ ...rr.avisos[0], reparaciones: reps });
  }
  if (p.acceso === 'escalera_interior' && cn.plataformas.length) {
    escaleraInterior(b.esq, g.panos[0][0], { desde: 0 });
    if (Math.abs(vanosS[0].medida - 2.5) > EPS) avisos.push({ regla: 'acceso.escotilla', nivel: 'info', estructuraId: est.id, texto: 'La trampilla de catálogo es de 2,50: con otro largo la escalera pasa por un tablón quitado.', reparaciones: [] });
  }
  reglas.push({ regla: 'movil.armado', estructuraId: est.id, texto: `Torre móvil ${p.uso}: ruedas con freno, ${nd} diagonales y diagonal en planta en la base. H/B = ${fmt(rr.hb, 1)} (máx. ${fmt(rr.hbMax, 1)} ⚠). Frenar las ruedas y no moverla con gente arriba. ${PREDIMENSIONADO}.` });
  const L = g.S[g.S.length - 1];
  const B = g.T[1];
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: metricasCaja(L, B, cn.yTopCol),
    puertos: puertosCaja('Torre móvil', g.S, L, B, cn.yTopCol, cn.yTopCol),
    info: { hb: rr.hb, hbMax: rr.hbMax, bEfectiva: Bef, alturaMaxima: alturaMaximaMovil(Bef, p.uso), plataformas: cn.plataformas },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', min: 0.73, max: 3, catalogo: 'vanos', grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Ancho', tipo: 'medida', unidad: 'm', min: 0.73, max: 2.5, catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.alturaPlataforma', etiqueta: 'Altura de la plataforma', tipo: 'medida', unidad: 'm', min: 1, max: 20, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.uso', etiqueta: 'Uso', tipo: 'opcion', opciones: [{ valor: 'interior', etiqueta: 'Interior (3,5 : 1)' }, { valor: 'exterior', etiqueta: 'Exterior (3 : 1)' }], grupo: 'Apoyo' },
  { ruta: 'params.estabilizadores', etiqueta: 'Estabilizadores', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.brazoEstabilizador', etiqueta: 'Brazo del estabilizador', tipo: 'medida', unidad: 'm', min: 0.5, max: 3, paso: 0.1, grupo: 'Apoyo', visibleSi: { ruta: 'params.estabilizadores', igual: true } },
  { ruta: 'params.acceso', etiqueta: 'Acceso', tipo: 'opcion', opciones: [{ valor: 'escalera_interior', etiqueta: 'Escalera interior con trampilla' }, { valor: 'ninguno', etiqueta: 'Sin escalera' }], grupo: 'Accesos' },
  { ruta: 'params.descansos', etiqueta: 'Plataformas de descanso cada 2,00', tipo: 'bool', grupo: 'Accesos' },
];

const PRESETS: Preset[] = [
  { id: 'torre_movil_interior', nombre: 'Torre móvil interior', icono: 'movil', descripcion: 'Torre de 2,50 × 1,50 con ruedas con freno, escalera interior y plataformas con trampilla.', params: {} },
  { id: 'torre_movil_exterior', nombre: 'Torre móvil exterior', icono: 'movil', descripcion: 'Torre móvil para exterior (H/B de 3 : 1). Para subir más, sumá estabilizadores.', params: { uso: 'exterior', alturaPlataforma: 3.5 } },
];

export const TORRE_MOVIL: Tipologia<ParamsTorreMovil> = {
  id: 'torre_movil',
  version: 1,
  nombre: 'Torre móvil',
  descripcion: 'Torre sobre ruedas con freno, estabilizadores, escalera interior y límite de altura por H/B.',
  categoria: 'torre',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarTorreMovil,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarTorreMovil,
};
