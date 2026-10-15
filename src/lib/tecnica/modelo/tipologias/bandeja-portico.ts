/**
 * Bandeja de protección con pórtico peatonal (pedido 3, fotos 2, 6 y 10): dos líneas de verticales a lo
 * largo de la vereda (contra la fachada y sobre el cordón), paso peatonal libre entre ellas (sin travesaños
 * por debajo del gálibo), vigas de celosía a lo largo de las dos líneas bajo el piso, bandeja de fenólico
 * arriba y visera a 45° o 90° hacia la calle con lona. Esferas de seguridad en las verticales.
 * Reglas de vía pública ⚠: gálibo ≥ 2,50 y paso ≥ 1,20. Todo es PREDIMENSIONADO.
 */
import type { Elemento, Estructura, Regla } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { conIntermedios } from '../medida/alturas.ts';
import { grillaRect } from './comunes/grilla.ts';
import { primViga, puertosCaja } from './comunes/util-tipologias.ts';
import { accesorio, anclarLinea, type AvisoGen, diagonalesEnFila, diagonalPlanta, medida, metricasCaja, opcion, profundidadDe, tramosDe, viseraEnPuntos } from './nuevas-comunes.ts';
import { EPS, fmt, r3 } from '../util.ts';

export interface ParamsBandejaPortico extends Record<string, unknown> {
  largo: number;
  /** ancho del paso peatonal (entre la línea de fachada y la del cordón) */
  paso: number;
  /** altura libre bajo el pórtico */
  galibo: number;
  retiro: number;
  vigasCelosia: boolean;
  /** vuelo extra de la bandeja más allá del cordón (0 = la visera arranca de la línea del cordón) */
  vuelo: number;
  visera: { tipo: '90' | '45' | 'ninguna'; alto: number };
  cerramiento: 'lona' | 'chapa' | 'fenolico';
  anclada: boolean;
  esferas: boolean;
}

const DEF: ParamsBandejaPortico = { largo: 12.5, paso: 1.5, galibo: 2.5, retiro: 0.1, vigasCelosia: true, vuelo: 0, visera: { tipo: '45', alto: 1 }, cerramiento: 'lona', anclada: true, esferas: true };

export function normalizarBandejaPortico(parcial: Partial<ParamsBandejaPortico>): { params: ParamsBandejaPortico; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const v = (x.visera && typeof x.visera === 'object' ? x.visera : {}) as Record<string, unknown>;
  const p: ParamsBandejaPortico = {
    largo: medida(x.largo, DEF.largo, 1.5, 200),
    paso: medida(x.paso, DEF.paso, 0.73, 4),
    galibo: medida(x.galibo, DEF.galibo, 2, 6),
    retiro: medida(x.retiro, DEF.retiro, 0, 1.5),
    vigasCelosia: x.vigasCelosia === undefined ? true : !!x.vigasCelosia,
    vuelo: medida(x.vuelo, 0, 0, 1.09),
    visera: { tipo: opcion(v.tipo, ['90', '45', 'ninguna'] as const, '45'), alto: medida(v.alto, 1, 0.3, 2.5) },
    cerramiento: opcion(x.cerramiento, ['lona', 'chapa', 'fenolico'] as const, 'lona'),
    anclada: x.anclada === undefined ? true : !!x.anclada,
    esferas: x.esferas === undefined ? true : !!x.esferas,
  };
  return { params: p, avisos: [] };
}

export function generarBandejaPortico(est: Estructura & { params: ParamsBandejaPortico }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const tramos = tramosDe(p.largo, est.medida, m);
  const paso = profundidadDe(p.paso, est.medida, m, [...m.multi.profundidades, ...m.multi.vanos]);
  const ARR = 0.25;
  const altoViga = p.vigasCelosia ? 0.5 : 0;
  // piso de la bandeja: primera roseta que deja el gálibo libre bajo la viga (o bajo el travesaño)
  const yD = r3(ARR + CRITERIOS.pasoRoseta * Math.ceil((p.galibo + altoViga - ARR) / CRITERIOS.pasoRoseta - EPS));
  const { cotas } = conIntermedios([ARR, yD]);
  const yTope = r3(yD + 1);
  const g = grillaRect({ vanosS: tramos, profundidades: [paso], cotas, plataformas: [yD], yTope, barandaEn: { interior: false, exterior: false, laterales: true }, diagonales: false, catalogo: cat, medidas: m });
  const b = g.b;
  const kD = b.k(yD);
  // paso libre: sin travesaños por debajo del piso (ni en el arranque)
  for (const fila of g.vanosT) for (const vid of fila) for (let k = 0; k < kD; k++) b.celda(vid, k, { horizontal: false });
  for (const fila of g.panos) for (const pid of fila) b.celdaPano(pid, kD, { fenolico: true });
  // diagonales en las dos líneas (cordón y fachada), roseta a roseta, sin tocar el paso
  const nj = g.T.length - 1;
  const nd = diagonalesEnFila(b, cat, g.vanosS[nj], 0) + diagonalesEnFila(b, cat, g.vanosS[0], 1);
  // diagonal en planta en los paños extremos del piso
  const extra: Elemento[] = [...diagonalPlanta(b, cat, g, 0, 0, kD, 'bp'), ...(tramos.length > 1 ? diagonalPlanta(b, cat, g, tramos.length - 1, 0, kD, 'bp') : [])];
  // vigas de celosía a lo largo de las dos líneas, bajo el piso (cordón superior en la roseta del piso)
  let vigas = 0;
  if (p.vigasCelosia) {
    for (const j of [0, nj]) for (let i = 0; i < tramos.length; i++) {
      const luz = r3(g.S[i + 1] - g.S[i]);
      if (!m.multi.vigasCelosia.some((l) => Math.abs(l - luz) < 0.0015)) continue;
      const a: [number, number, number] = [g.S[i], yD, g.T[j]];
      const c: [number, number, number] = [g.S[i + 1], yD, g.T[j]];
      extra.push({ id: `bp:viga${j}_${i}`, familia: 'viga_celosia', medidas: { largo: luz }, a, b: c, primitivas: primViga(a, c, altoViga), grupo: 'portico' });
      vigas++;
    }
    if (!vigas) avisos.push({ regla: 'portico.sin_viga', nivel: 'info', estructuraId: est.id, texto: 'Ningún vano coincide con una viga de celosía de catálogo: el pórtico queda con travesaños.', reparaciones: [] });
  }
  // visera hacia la calle desde la línea del cordón
  const vis = viseraEnPuntos({ puntos: g.S, y: yD, t0: paso.medida, ancho: p.vuelo, visera: p.visera, cerramiento: p.cerramiento, soporte: 'mensula', prefijo: 'bpv', medidas: m });
  extra.push(...vis.elementos);
  // esferas de seguridad (2 por vertical a la altura del peatón)
  if (p.esferas) for (const fila of g.col) for (const c of fila) {
    const q = b.col(c).p;
    for (const [i, y] of [0.5, 1.2].entries()) extra.push(accesorio(`esf:${c}:${i}`, 'esfera', [q[0], y, q[1]], 'seguridad'));
  }
  for (const e of extra) b.elemento(e);
  if (p.anclada) {
    const n = anclarLinea(b, g.col.map((c) => c[0]), [kD], [0, -1], p.retiro, 2, 1);
    reglas.push({ regla: 'portico.anclajes', estructuraId: est.id, texto: `${n} anclajes a la fachada a la altura del piso.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
  }
  reglas.push({ regla: 'portico.paso_libre', estructuraId: est.id, texto: `Paso peatonal de ${fmt(paso.medida)} con gálibo ${fmt(yD - altoViga)}: sin travesaños por debajo del piso. ${nd} diagonales en las líneas de fachada y cordón.` });
  // vía pública ⚠
  if (paso.medida < CRITERIOS.pasoPeatonal - EPS) avisos.push({ regla: 'via.paso', nivel: 'error', estructuraId: est.id, texto: `Paso peatonal de ${fmt(paso.medida)}: el mínimo es ${fmt(CRITERIOS.pasoPeatonal)} ⚠.`, reparaciones: [{ etiqueta: `Ensanchar a ${fmt(1.5)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.paso', valor: 1.5 } }] });
  if (p.galibo < CRITERIOS.galiboPeatonal - EPS) avisos.push({ regla: 'via.galibo', nivel: 'error', estructuraId: est.id, texto: `Gálibo de ${fmt(p.galibo)}: el mínimo peatonal es ${fmt(CRITERIOS.galiboPeatonal)} ⚠.`, reparaciones: [{ etiqueta: `Subir a ${fmt(CRITERIOS.galiboPeatonal)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.galibo', valor: CRITERIOS.galiboPeatonal } }] });
  const L = g.S[g.S.length - 1];
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: metricasCaja(L, paso.medida + p.vuelo, yTope),
    puertos: puertosCaja('Pórtico con bandeja', g.S, L, paso.medida, yTope, yD),
    info: { galibo: r3(yD - altoViga), piso: yD, paso: paso.medida, yTope: yD, relleno: tramos },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo sobre la vereda', tipo: 'medida', unidad: 'm', min: 1.5, max: 200, grupo: 'Medidas' },
  { ruta: 'params.paso', etiqueta: 'Ancho del paso', tipo: 'medida', unidad: 'm', min: 0.73, max: 4, catalogo: 'vanos', grupo: 'Medidas' },
  { ruta: 'params.galibo', etiqueta: 'Gálibo', tipo: 'medida', unidad: 'm', min: 2, max: 6, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.vigasCelosia', etiqueta: 'Vigas de celosía', tipo: 'bool', grupo: 'Medidas' },
  { ruta: 'params.vuelo', etiqueta: 'Vuelo sobre la calle', tipo: 'medida', unidad: 'm', min: 0, max: 1.09, paso: 0.05, catalogo: 'mensulas', grupo: 'Protección' },
  { ruta: 'params.visera.tipo', etiqueta: 'Visera', tipo: 'opcion', opciones: [{ valor: '45', etiqueta: 'Inclinada a 45°' }, { valor: '90', etiqueta: 'Vertical (90°)' }, { valor: 'ninguna', etiqueta: 'Sin visera' }], grupo: 'Protección' },
  { ruta: 'params.visera.alto', etiqueta: 'Alto de la visera', tipo: 'medida', unidad: 'm', min: 0.3, max: 2.5, paso: 0.1, grupo: 'Protección' },
  { ruta: 'params.cerramiento', etiqueta: 'Cerramiento', tipo: 'opcion', opciones: [{ valor: 'lona', etiqueta: 'Fenólico + lona' }, { valor: 'chapa', etiqueta: 'Chapa' }, { valor: 'fenolico', etiqueta: 'Fenólico' }], grupo: 'Protección' },
  { ruta: 'params.esferas', etiqueta: 'Esferas de seguridad', tipo: 'bool', grupo: 'Protección' },
  { ruta: 'params.anclada', etiqueta: 'Anclada a la fachada', tipo: 'bool', grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'bandeja_portico_peatonal', nombre: 'Pórtico peatonal con bandeja', icono: 'portico', descripcion: 'Pórtico a lo largo de la vereda con vigas de celosía, piso de fenólico y visera a 45° con lona.', params: {} },
];

export const BANDEJA_PORTICO: Tipologia<ParamsBandejaPortico> = {
  id: 'bandeja_portico',
  version: 1,
  nombre: 'Pórtico con bandeja',
  descripcion: 'Pórtico peatonal sobre la vereda con vigas de celosía y bandeja de protección arriba.',
  categoria: 'bandeja',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarBandejaPortico,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarBandejaPortico,
};
