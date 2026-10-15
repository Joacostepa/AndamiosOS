/**
 * Bandeja en voladizo (pedido 8b, foto 11): volada desde la fachada, SIN patas en la vereda. Una línea de
 * postes multidireccionales anclados a la fachada (amarre en el pie y anclaje estructural en el anillo de la
 * bandeja), vigas de celosía (o ménsulas o caño y grampa) voladas desde los postes con su largo de catálogo,
 * diagonales en planta de caño y grampa bajo la bandeja, tornapuntas a 45° desde el pie, correas de caño, piso de
 * fenólico + lona y visera a 45° o 90°. Apoyo: colgado / volado. Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { ConstructorEsqueleto } from '../esqueleto/esqueleto.ts';
import { puerto } from './comunes/util-tipologias.ts';
import { type AvisoGen, canoGrampa, diagonalesEnFila, largoCatalogo, medida, opcion, tramosDe, viseraEnPuntos } from './nuevas-comunes.ts';
import { vanosArriostrados } from '../reglas/diagonales.ts';
import { fmt, r3 } from '../util.ts';

export interface ParamsBandejaVoladizo extends Record<string, unknown> {
  largo: number;
  /** cota del piso de la bandeja */
  cota: number;
  /** vuelo desde la fachada */
  vuelo: number;
  /** separación de los postes a la fachada */
  retiro: number;
  /** alto de los postes anclados (del pie de las tornapuntas a la bandeja) */
  altoPoste: number;
  soporte: 'auto' | 'viga' | 'mensula' | 'cano';
  tornapuntas: boolean;
  visera: { tipo: '90' | '45' | 'ninguna'; alto: number };
  cerramiento: 'lona' | 'chapa' | 'fenolico';
}

const DEF: ParamsBandejaVoladizo = { largo: 10, cota: 4.5, vuelo: 2.5, retiro: 0.15, altoPoste: 2, soporte: 'auto', tornapuntas: true, visera: { tipo: '45', alto: 1 }, cerramiento: 'lona' };

export function normalizarBandejaVoladizo(parcial: Partial<ParamsBandejaVoladizo>): { params: ParamsBandejaVoladizo; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const v = (x.visera && typeof x.visera === 'object' ? x.visera : {}) as Record<string, unknown>;
  const altoPoste = r3(Math.round(medida(x.altoPoste, DEF.altoPoste, 1, 3) / CRITERIOS.pasoRoseta) * CRITERIOS.pasoRoseta);
  const p: ParamsBandejaVoladizo = {
    largo: medida(x.largo, DEF.largo, 1, 200),
    cota: medida(x.cota, DEF.cota, altoPoste + 0.5, 60),
    vuelo: medida(x.vuelo, DEF.vuelo, 0.45, 3),
    retiro: medida(x.retiro, DEF.retiro, 0.05, 0.6),
    altoPoste,
    soporte: opcion(x.soporte, ['auto', 'viga', 'mensula', 'cano'] as const, 'auto'),
    tornapuntas: x.tornapuntas === undefined ? true : !!x.tornapuntas,
    visera: { tipo: opcion(v.tipo, ['90', '45', 'ninguna'] as const, '45'), alto: medida(v.alto, 1, 0.3, 2.5) },
    cerramiento: opcion(x.cerramiento, ['lona', 'chapa', 'fenolico'] as const, 'lona'),
  };
  return { params: p, avisos: [] };
}

export function generarBandejaVoladizo(est: Estructura & { params: ParamsBandejaVoladizo }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const tramos = tramosDe(p.largo, est.medida, m);
  const yB = r3(p.cota);
  const yPie = r3(p.cota - p.altoPoste);
  const b = new ConstructorEsqueleto('multi', [yPie, yB]);
  const S = [0];
  for (const t of tramos) S.push(r3(S[S.length - 1] + t.medida));
  const t0 = p.retiro;
  const cols = S.map((s, i) => b.columna(`vp${i}`, [s, t0], yPie, yB, 'colgada'));
  const fila = tramos.map((t, i) => b.vano(`vl${i}`, cols[i], cols[i + 1], 'interior', { libre: t.libre, normal: [0, -1] }));
  // amarre a la fachada en el anillo del pie (la tornapunta empuja contra el muro)
  for (const c of cols) b.nodo(c, 0, { anclaje: { retiro: t0, dir: [0, -1] } });
  diagonalesEnFila(b, cat, fila, 0);
  const maxMensula = Math.max(...m.multi.mensulas);
  const soporte = p.soporte === 'auto' ? (p.vuelo <= maxMensula + 1e-6 ? 'mensula' : 'viga') : p.soporte;
  // la viga sale del poste: el vuelo real es el largo de catálogo (no puede meter la cola en la fachada)
  let vuelo = p.vuelo;
  if (soporte === 'viga') {
    const v = largoCatalogo(p.vuelo, m.multi.vigasCelosia);
    if (!v.excede && Math.abs(v.largo - p.vuelo) > 0.005) {
      vuelo = v.largo;
      avisos.push({ regla: 'voladizo.vuelo', nivel: 'info', estructuraId: est.id, texto: `La viga de celosía sale del poste: el vuelo queda en ${fmt(vuelo)} (la de catálogo más corta que llega a ${fmt(p.vuelo)}).`, reparaciones: [{ etiqueta: `Usar ${fmt(vuelo)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.vuelo', valor: vuelo } }, { etiqueta: 'Caño y grampa a medida', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.soporte', valor: 'cano' } }] });
    }
  }
  if (soporte === 'mensula' && p.vuelo > maxMensula + 1e-6) avisos.push({ regla: 'bandeja.mensula_corta', nivel: 'error', estructuraId: est.id, texto: `No hay ménsula para volar ${fmt(p.vuelo)}.`, reparaciones: [{ etiqueta: 'Pasar a viga de celosía', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.soporte', valor: 'viga' } }] });
  const vis = viseraEnPuntos({
    puntos: S, y: yB, t0, ancho: vuelo, visera: p.visera, cerramiento: p.cerramiento, soporte, tRaiz: t0, tVerticales: [t0],
    tornapunta: p.tornapuntas ? { yPie, tPie: t0 } : null, prefijo: 'bv', medidas: m,
  });
  for (const e of vis.elementos) b.elemento(e);
  for (const t of vis.avisos) avisos.push({ regla: 'bandeja.soporte', nivel: 'aviso', estructuraId: est.id, texto: t, reparaciones: [] });
  if (!p.tornapuntas && soporte !== 'mensula') avisos.push({ regla: 'voladizo.tornapunta', nivel: 'aviso', estructuraId: est.id, texto: `Vigas voladas ${fmt(p.vuelo)} sin tornapuntas: todo el momento va a los anclajes ⚠.`, reparaciones: [{ etiqueta: 'Agregar tornapuntas', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.tornapuntas', valor: true } }] });
  // arriostramiento en planta bajo la bandeja (foto 11): caño y grampa en los extremos y cada 2 vigas
  const yPl = r3(yB - 0.5);
  let ndp = 0;
  if (soporte !== 'mensula') for (const i of vanosArriostrados(S.length - 1, 2)) {
    const [a, c] = i % 2 === 0 ? [t0, r3(t0 + vuelo)] : [r3(t0 + vuelo), t0];
    for (const e of canoGrampa(`bvdp${i}`, [S[i], yPl, a], [S[i + 1], yPl, c], { grupo: 'arriostramiento', giratoria: true, canos: m.canos })) b.elemento(e);
    ndp++;
  }
  // anclaje estructural del voladizo en el anillo de la bandeja: toma la tracción (no es un amarre)
  for (let i = 0; i < cols.length; i++) b.elemento({ id: `bvanc${i}`, familia: 'accesorio', medidas: { variante: 'anclaje_voladizo' }, a: [S[i], yB, t0], b: [S[i], yB, 0], grupo: 'anclaje', sistema: 'comun' });
  const trib = cols.length > 1 ? (S[S.length - 1] - S[0]) / (cols.length - 1) : 1;
  const q = CRITERIOS.cargaBandeja;
  const tension = r3((q * trib * vuelo * vuelo) / (2 * p.altoPoste));
  avisos.push({ regla: 'voladizo.anclaje', nivel: 'aviso', estructuraId: est.id, texto: `Bandeja volada sin patas: cada anclaje estructural del anillo de la bandeja toma ≈ ${fmt(tension, 1)} kN de tracción (carga provisoria ${fmt(q, 1)} kN/m² ⚠, ${fmt(trib)} de ancho tributario, vuelo ${fmt(vuelo)}, brazo ${fmt(p.altoPoste)}). Verificar el anclaje y la fachada o la losa. ${PREDIMENSIONADO}.`, reparaciones: [] });
  reglas.push({ regla: 'voladizo.armado', estructuraId: est.id, texto: `${cols.length} postes anclados de ${fmt(p.altoPoste)}, ${soporte === 'viga' ? 'vigas de celosía' : soporte === 'mensula' ? 'ménsulas' : 'caño y grampa'} voladas ${fmt(vuelo)}${p.tornapuntas ? ' con tornapuntas a 45°' : ''}, ${ndp} diagonales en planta, amarres abajo y ${cols.length} anclajes estructurales arriba.` });
  const L = S[S.length - 1];
  const W = (s: number, y: number, t: number): [number, number, number] => [s, y, t];
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: r3(L * vuelo), ml: r3(L), alturaReal: r3(yB + (p.visera.tipo === 'ninguna' ? 0 : p.visera.alto)), huella: [[0, 0], [L, 0], [L, t0 + vuelo], [0, t0 + vuelo]] },
    puertos: [
      puerto('fachada', 'cara', 'Voladizo · fachada', W(L, yPie, 0), W(0, yPie, 0), [0, 0, -1], S.map((s) => r3(L - s)).reverse(), p.altoPoste),
      puerto('base', 'base', 'Voladizo · bandeja', W(0, yB, t0), W(L, yB, t0), [0, 1, 0], S, yB),
    ],
    info: { apoyo: 'volado', cota: yB, vuelo, soporte, relleno: tramos, tensionAnclajeKN: tension },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', min: 1, max: 200, grupo: 'Medidas' },
  { ruta: 'params.cota', etiqueta: 'Altura de la bandeja', tipo: 'medida', unidad: 'm', min: 1.5, max: 60, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.vuelo', etiqueta: 'Vuelo desde la fachada', tipo: 'medida', unidad: 'm', min: 0.45, max: 3, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.altoPoste', etiqueta: 'Alto de los postes', tipo: 'medida', unidad: 'm', min: 1, max: 3, paso: 0.5, grupo: 'Apoyo' },
  { ruta: 'params.soporte', etiqueta: 'Soporte', tipo: 'opcion', opciones: [{ valor: 'auto', etiqueta: 'Automático' }, { valor: 'viga', etiqueta: 'Vigas de celosía' }, { valor: 'mensula', etiqueta: 'Ménsulas' }, { valor: 'cano', etiqueta: 'Caño y grampa' }], grupo: 'Apoyo' },
  { ruta: 'params.tornapuntas', etiqueta: 'Tornapuntas a 45°', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.visera.tipo', etiqueta: 'Visera', tipo: 'opcion', opciones: [{ valor: '45', etiqueta: 'Inclinada a 45°' }, { valor: '90', etiqueta: 'Vertical (90°)' }, { valor: 'ninguna', etiqueta: 'Sin visera' }], grupo: 'Protección' },
  { ruta: 'params.visera.alto', etiqueta: 'Alto de la visera', tipo: 'medida', unidad: 'm', min: 0.3, max: 2.5, paso: 0.1, grupo: 'Protección' },
  { ruta: 'params.cerramiento', etiqueta: 'Cerramiento', tipo: 'opcion', opciones: [{ valor: 'lona', etiqueta: 'Fenólico + lona' }, { valor: 'chapa', etiqueta: 'Chapa' }, { valor: 'fenolico', etiqueta: 'Fenólico' }], grupo: 'Protección' },
];

const PRESETS: Preset[] = [
  { id: 'bandeja_voladizo', nombre: 'Bandeja en voladizo', icono: 'voladizo', descripcion: 'Volada desde la fachada con vigas de celosía y tornapuntas, sin patas en la vereda.', params: {} },
];

export const BANDEJA_VOLADIZO: Tipologia<ParamsBandejaVoladizo> = {
  id: 'bandeja_voladizo',
  version: 1,
  nombre: 'Bandeja en voladizo',
  descripcion: 'Bandeja de protección volada desde la fachada (sin patas): postes anclados, vigas voladas y visera.',
  categoria: 'bandeja',
  sistemas: ['multi'],
  apoyos: ['colgado'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarBandejaVoladizo,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarBandejaVoladizo,
};
