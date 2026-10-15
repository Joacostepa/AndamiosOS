/**
 * Torre de plataforma (pedido 6, fotos 7 y 9): torre de trabajo de n × m vanos con plataformas amplias,
 * diagonales en zigzag en las cuatro caras, diagonal en planta en el arranque y escalera interior con
 * escotillas. Preset «en azotea»: apoya sobre la losa (cota de la azotea o de un volumen del contexto).
 * Se puede embeber en otra estructura (unión «embebida») o unir por cara a una fachada.
 * No reemplaza a la torre del núcleo (escalera y acceso): la complementa. Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla, Volumen } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { cotasNiveles, grillaRect } from './comunes/grilla.ts';
import { escaleraInterior } from './comunes/escalera-interior.ts';
import { puertosCaja } from './comunes/util-tipologias.ts';
import { anclarLinea, type AvisoGen, diagonalesPerimetro, diagonalPlanta, ksDe, medida, metricasCaja, opcion, tramosAncho, tramosDe } from './nuevas-comunes.ts';
import { EPS, fmt, r3 } from '../util.ts';

export interface ParamsTorrePlataforma extends Record<string, unknown> {
  largo: number;
  ancho: number;
  /** altura total sobre el apoyo (último nivel de trabajo a H − 1,00) */
  altura: number;
  plataformas: 'cada_nivel' | 'cada_2m' | 'solo_trabajo';
  acceso: 'escalera_interior' | 'zanca' | 'ninguno';
  /** cota del apoyo (0 = suelo; azotea = cota de la losa) */
  cotaApoyo: number;
  /** volumen del contexto sobre el que apoya (toma su cota superior) */
  volumenId: string;
  anclada: boolean;
  retiroAnclaje: number;
}

const DEF: ParamsTorrePlataforma = { largo: 7.5, ancho: 5, altura: 6, plataformas: 'cada_2m', acceso: 'escalera_interior', cotaApoyo: 0, volumenId: '', anclada: false, retiroAnclaje: 0.3 };

export function normalizarTorrePlataforma(parcial: Partial<ParamsTorrePlataforma>): { params: ParamsTorrePlataforma; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const p: ParamsTorrePlataforma = {
    largo: medida(x.largo, DEF.largo, 0.73, 30),
    ancho: medida(x.ancho, DEF.ancho, 0.73, 30),
    altura: medida(x.altura, DEF.altura, 2.5, 60),
    plataformas: opcion(x.plataformas, ['cada_nivel', 'cada_2m', 'solo_trabajo'] as const, 'cada_2m'),
    acceso: opcion(x.acceso, ['escalera_interior', 'zanca', 'ninguno'] as const, 'escalera_interior'),
    cotaApoyo: medida(x.cotaApoyo, 0, 0, 200),
    volumenId: typeof x.volumenId === 'string' ? x.volumenId : '',
    anclada: !!x.anclada,
    retiroAnclaje: medida(x.retiroAnclaje, DEF.retiroAnclaje, 0.1, 2),
  };
  return { params: p, avisos: [] };
}

export function generarTorrePlataforma(est: Estructura & { params: ParamsTorrePlataforma }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const rel = ctx.relaciones;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const vol: Volumen | undefined = p.volumenId ? ctx.diseno.contexto?.volumenes?.find((v) => v.id === p.volumenId) : undefined;
  if (p.volumenId && !vol) avisos.push({ regla: 'torre.sin_volumen', nivel: 'aviso', estructuraId: est.id, texto: `No encuentro el volumen «${p.volumenId}»: apoyo a ${fmt(p.cotaApoyo)}.`, reparaciones: [{ etiqueta: 'Desvincular', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.volumenId', valor: '' } }] });
  const base = r3(vol ? vol.yTope : p.cotaApoyo);
  const sop = rel.soportes[0];
  // unida a una fachada en el suelo: hereda altura y fase de rosetas
  const hereda = base < EPS && rel.alturaHeredada !== undefined;
  const H = hereda ? rel.alturaHeredada! : p.altura;
  const cn = cotasNiveles({ altura: H, modo: p.plataformas, base: sop ? sop.yTope : base, arranque: hereda ? rel.arrHeredado : undefined });
  const vanosS = tramosDe(p.largo, est.medida, m);
  const vanosT = tramosAncho(p.ancho, est.medida, m);
  const g = grillaRect({ vanosS, profundidades: vanosT, cotas: cn.cotas, plataformas: cn.plataformas, diagonales: false, catalogo: cat, medidas: m, apoyo: sop ? 'sobre' : 'base_regulable' });
  const b = g.b;
  const ySuelo = sop ? sop.yTope : base;
  for (const c of b.esq.columnas) c.ySuelo = ySuelo;
  const nd = diagonalesPerimetro(b, cat, g);
  for (const e of diagonalPlanta(b, cat, g, 0, 0, 0, 'tp')) b.elemento(e);
  if (vanosS.length > 1 || vanosT.length > 1) for (const e of diagonalPlanta(b, cat, g, vanosS.length - 1, vanosT.length - 1, 0, 'tp')) b.elemento(e);
  // acceso: en el paño de 2,50 más cercano a la esquina (la escotilla de catálogo es de 2,50)
  if (p.acceso !== 'ninguno' && cn.plataformas.length) {
    let pi = 0;
    for (let i = 0; i < vanosS.length; i++) if (Math.abs(vanosS[i].medida - 2.5) < EPS) { pi = i; break; }
    if (Math.abs(vanosS[pi].medida - 2.5) > EPS) avisos.push({ regla: 'acceso.escotilla', nivel: 'aviso', estructuraId: est.id, texto: 'No hay un vano de 2,50 para la escotilla de catálogo: la escalera queda con tablones comunes.', reparaciones: [] });
    escaleraInterior(b.esq, g.panos[pi][0], { tipo: p.acceso === 'zanca' ? 'zanca' : 'escalera_interior', desde: ySuelo });
    reglas.push({ regla: 'torre.acceso', estructuraId: est.id, texto: `Acceso por ${p.acceso === 'zanca' ? 'zancas' : 'escalera interior'} con escotillas en el vano ${pi + 1}.` });
  }
  const L = g.S[g.S.length - 1];
  const B = g.T[g.T.length - 1];
  const Hrel = r3(cn.yTopCol - ySuelo);
  if (p.anclada) {
    const n = anclarLinea(b, g.col.map((c) => c[0]), ksDe(b, cn.plataformas), [0, -1], p.retiroAnclaje);
    reglas.push({ regla: 'torre.anclajes', estructuraId: est.id, texto: `${n} anclajes en la cara del frente.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
  } else if (!rel.unidaA.length && Hrel / Math.min(L, B) > CRITERIOS.hbMax + EPS) {
    const Bmin = r3(Hrel / CRITERIOS.hbMax);
    avisos.push({
      regla: 'esbeltez.hb', nivel: 'aviso', estructuraId: est.id,
      texto: `${est.nombre}: H/B = ${fmt(Hrel / Math.min(L, B), 1)} > ${CRITERIOS.hbMax} sin anclar (H ${fmt(Hrel)}, B ${fmt(Math.min(L, B))}). ${PREDIMENSIONADO}.`,
      reparaciones: [{ etiqueta: 'Anclar', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: true } }, { etiqueta: `Ensanchar a ${fmt(Bmin)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: L < B ? 'params.largo' : 'params.ancho', valor: Bmin } }],
    });
  }
  if (ySuelo > 0.5 && !sop) {
    b.esq.terreno = 'losa';
    avisos.push({ regla: 'azotea.losa', nivel: 'aviso', estructuraId: est.id, texto: `Torre sobre losa a ${fmt(ySuelo)}: verificá la carga sobre la losa. Las bases van sobre tablones de reparto (incluidos en el cómputo). ${PREDIMENSIONADO}.`, reparaciones: [] });
  }
  reglas.push({ regla: 'torre.plataforma', estructuraId: est.id, texto: `Torre de ${fmt(L)} × ${fmt(B)} con ${cn.plataformas.length} plataforma${cn.plataformas.length === 1 ? '' : 's'} y ${nd} diagonales en las 4 caras.` });
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: metricasCaja(L, B, Hrel),
    puertos: puertosCaja('Torre', g.S, L, B, Hrel, cn.yTopCol),
    info: { ARR: cn.ARR, yTope: cn.yTopCol, base: ySuelo, plataformas: cn.plataformas, largo: L, prof: B },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', min: 0.73, max: 30, catalogo: 'vanos', grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Ancho', tipo: 'medida', unidad: 'm', min: 0.73, max: 30, catalogo: 'vanos', grupo: 'Medidas' },
  { ruta: 'params.altura', etiqueta: 'Altura', tipo: 'medida', unidad: 'm', min: 2.5, max: 60, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.plataformas', etiqueta: 'Plataformas', tipo: 'opcion', opciones: [{ valor: 'cada_2m', etiqueta: 'Cada 2,00' }, { valor: 'cada_nivel', etiqueta: 'Cada nivel' }, { valor: 'solo_trabajo', etiqueta: 'Solo arriba' }], grupo: 'Medidas' },
  { ruta: 'params.acceso', etiqueta: 'Acceso', tipo: 'opcion', opciones: [{ valor: 'escalera_interior', etiqueta: 'Escalera interior' }, { valor: 'zanca', etiqueta: 'Zancas' }, { valor: 'ninguno', etiqueta: 'Sin acceso' }], grupo: 'Accesos' },
  { ruta: 'params.cotaApoyo', etiqueta: 'Cota del apoyo', tipo: 'medida', unidad: 'm', min: 0, max: 200, paso: 0.05, grupo: 'Apoyo', ayuda: 'Azotea o losa donde apoya la torre (0 = suelo).' },
  { ruta: 'params.volumenId', etiqueta: 'Sobre el volumen', tipo: 'volumen', volumenes: ['edificio', 'losa'], grupo: 'Apoyo', ayuda: 'La azotea o losa donde apoya. Si no hay, «Crear uno» arma el edificio a la cota de apoyo.' },
  { ruta: 'params.anclada', etiqueta: 'Anclada', tipo: 'bool', grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'torre_plataforma', nombre: 'Torre de plataforma', icono: 'torre', descripcion: 'Torre de 3 × 2 vanos de 2,50 con plataformas cada 2,00 y escalera interior.', params: {} },
  { id: 'torre_azotea', nombre: 'Torre en azotea', icono: 'torre', descripcion: 'Torre de 2,50 × 1,09 sobre la losa de la azotea con escalera interior y plataforma arriba.', params: { largo: 2.5, ancho: 1.09, altura: 5, plataformas: 'solo_trabajo', cotaApoyo: 12, anclada: true } },
];

export const TORRE_PLATAFORMA: Tipologia<ParamsTorrePlataforma> = {
  id: 'torre_plataforma',
  version: 1,
  nombre: 'Torre de plataforma',
  descripcion: 'Torre de trabajo de varios vanos con plataformas amplias; también en azotea o embebida en otra estructura.',
  categoria: 'torre',
  sistemas: ['multi'],
  apoyos: ['suelo', 'sobre_estructura'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarTorrePlataforma,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarTorrePlataforma,
};
