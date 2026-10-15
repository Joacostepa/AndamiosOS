/**
 * Bandeja de protección (pedido 2, fotos 3 y 6): tira de andamio multidireccional hasta la cota de la bandeja
 * y, arriba, la bandeja volada hacia la calle con ménsulas (hasta 1,09) o vigas de celosía en voladizo
 * (bandeja amplia), correas de caño, piso de fenólico + lona y visera vertical (90°) o inclinada (45°)
 * con lona, chapa o fenólico. Medida libre: vanos y profundidad de cualquier medida (caño y grampa).
 * Todo es PREDIMENSIONADO.
 */
import type { Estructura, Regla } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { cotasNiveles, grillaRect } from './comunes/grilla.ts';
import { avisoEsbeltez, puertosCaja } from './comunes/util-tipologias.ts';
import { anclarLinea, type AvisoGen, ksDe, medida, metricasCaja, opcion, profundidadDe, tramosDe, viseraEnPuntos } from './nuevas-comunes.ts';
import { fmt, r3 } from '../util.ts';

export interface ParamsBandeja extends Record<string, unknown> {
  largo: number;
  /** cota de la bandeja (piso) sobre el suelo */
  cota: number;
  /** profundidad de la tira de andamio que la sostiene */
  profundidad: number;
  retiro: number;
  /** vuelo de la bandeja hacia la calle */
  ancho: number;
  soporte: 'auto' | 'mensula' | 'viga';
  visera: { tipo: '90' | '45' | 'ninguna'; alto: number };
  cerramiento: 'lona' | 'chapa' | 'fenolico';
  anclada: boolean;
  pataDeGallo?: boolean;
}

const DEF: ParamsBandeja = { largo: 10, cota: 3, profundidad: 0.73, retiro: 0.2, ancho: 1.09, soporte: 'auto', visera: { tipo: '45', alto: 1 }, cerramiento: 'lona', anclada: true };

export function normalizarBandeja(parcial: Partial<ParamsBandeja>): { params: ParamsBandeja; avisos: string[] } {
  const avisos: string[] = [];
  const x = (parcial || {}) as Record<string, unknown>;
  const v = (x.visera && typeof x.visera === 'object' ? x.visera : {}) as Record<string, unknown>;
  const p: ParamsBandeja = {
    largo: medida(x.largo, DEF.largo, 1, 200),
    cota: medida(x.cota, DEF.cota, 2, 40),
    profundidad: medida(x.profundidad, DEF.profundidad, 0.3, 2.5),
    retiro: medida(x.retiro, DEF.retiro, 0, 2),
    ancho: medida(x.ancho, DEF.ancho, 0.5, 3),
    soporte: opcion(x.soporte, ['auto', 'mensula', 'viga'] as const, 'auto'),
    visera: { tipo: opcion(v.tipo, ['90', '45', 'ninguna'] as const, '45'), alto: medida(v.alto, 1, 0.3, 2.5) },
    cerramiento: opcion(x.cerramiento, ['lona', 'chapa', 'fenolico'] as const, 'lona'),
    anclada: x.anclada === undefined ? true : !!x.anclada,
  };
  if (x.ancho !== undefined && p.ancho !== x.ancho) avisos.push(`Vuelo de la bandeja ajustado a ${fmt(p.ancho)} (entre 0,50 y 3,00).`);
  if (x.cota !== undefined && p.cota !== x.cota) avisos.push(`Cota de la bandeja ajustada a ${fmt(p.cota)}.`);
  return { params: p, avisos };
}

export function generarBandeja(est: Estructura & { params: ParamsBandeja }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const tramos = tramosDe(p.largo, est.medida, m);
  const prof = profundidadDe(p.profundidad, est.medida, m);
  const cn = cotasNiveles({ altura: p.cota + 1, modo: 'solo_trabajo', topeExacto: true });
  const yB = cn.plataformas[cn.plataformas.length - 1] ?? cn.cotas[cn.cotas.length - 1];
  if (Math.abs(yB - p.cota) > 0.01) avisos.push({ regla: 'bandeja.cota', nivel: 'info', estructuraId: est.id, texto: `La bandeja queda a ${fmt(yB)} (roseta más cercana a ${fmt(p.cota)}).`, reparaciones: [] });
  const g = grillaRect({
    vanosS: tramos, profundidades: [prof], cotas: cn.cotas, plataformas: [yB], yTope: r3(yB + 1),
    barandaEn: { interior: p.retiro > CRITERIOS.retiroLibre, exterior: false, laterales: true },
    catalogo: ctx.catalogo, medidas: m,
  });
  const b = g.b;
  const kB = b.k(yB);
  for (const fila of g.panos) for (const pid of fila) b.celdaPano(pid, kB, { fenolico: true });
  const maxMensula = Math.max(...m.multi.mensulas);
  const soporte = p.soporte === 'auto' ? (p.ancho <= maxMensula + 1e-6 ? 'mensula' : 'viga') : p.soporte;
  if (soporte === 'mensula' && p.ancho > maxMensula + 1e-6) {
    avisos.push({ regla: 'bandeja.mensula_corta', nivel: 'error', estructuraId: est.id, texto: `No hay ménsula para volar ${fmt(p.ancho)} (la mayor es ${fmt(maxMensula)}).`, reparaciones: [{ etiqueta: 'Pasar a viga en voladizo', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.soporte', valor: 'viga' } }, { etiqueta: `Volar ${fmt(maxMensula)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.ancho', valor: maxMensula } }] });
  }
  const T = prof.medida;
  // viga de celosía: tomada de las DOS verticales (interior y exterior) y volada hasta la punta. La raíz va en
  // la vertical interior o, como mucho, entre el andamio y la fachada (retiro − 0,05). Si ningún largo de
  // catálogo cae en ese rango, se usa la mayor viga que entra y el vuelo real se avisa (con reparación).
  let tRaiz = T;
  let vuelo = p.ancho;
  if (soporte === 'viga') {
    const fondo = -Math.max(0, p.retiro - 0.05);
    const tP = T + p.ancho;
    const lista = [...m.multi.vigasCelosia].sort((a, c) => a - c);
    const justa = lista.find((v) => v >= tP - 0.005 && tP - v >= fondo - 0.005);
    if (justa !== undefined) tRaiz = r3(tP - justa);
    else {
      const entra = [...lista].reverse().find((v) => v <= tP - fondo + 0.005 && v > T + 0.3);
      if (entra !== undefined) {
        vuelo = r3(entra - T);
        tRaiz = 0;
        avisos.push({ regla: 'bandeja.viga_largo', nivel: 'aviso', estructuraId: est.id, texto: `Con la viga de celosía de ${fmt(entra)} tomada de las dos verticales el vuelo es ${fmt(vuelo)} (pediste ${fmt(p.ancho)}): no hay viga de catálogo que llegue sin chocar la fachada.`, reparaciones: [{ etiqueta: `Volar ${fmt(vuelo)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.ancho', valor: vuelo } }] });
      } else {
        avisos.push({ regla: 'bandeja.viga_choca', nivel: 'error', estructuraId: est.id, texto: `No hay viga de celosía de catálogo para volar ${fmt(p.ancho)} tomada de las dos verticales.`, reparaciones: [{ etiqueta: 'Pasar a ménsulas', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.soporte', valor: 'mensula' } }] });
        tRaiz = 0;
      }
    }
  }
  const kAbajo = kB - 1 >= 0 ? kB - 1 : -1;
  const yPie = kAbajo >= 0 ? b.esq.cotas[kAbajo] : null;
  const vis = viseraEnPuntos({
    puntos: g.S, y: yB, t0: T, ancho: vuelo, visera: p.visera, cerramiento: p.cerramiento,
    soporte: soporte === 'viga' ? 'viga' : 'mensula', tRaiz, tVerticales: [0, T],
    tornapunta: soporte === 'viga' && vuelo > 1.5 && yPie !== null && yB - yPie >= 1 ? { yPie, tPie: T } : null,
    prefijo: 'band', medidas: m,
  });
  for (const e of vis.elementos) b.elemento(e);
  for (const t of vis.avisos) avisos.push({ regla: 'bandeja.soporte', nivel: 'aviso', estructuraId: est.id, texto: t, reparaciones: [] });
  reglas.push({ regla: 'bandeja.armado', estructuraId: est.id, texto: `Bandeja a ${fmt(yB)} con vuelo de ${fmt(vuelo)} sobre ${soporte === 'viga' ? 'vigas de celosía tomadas de las dos verticales' : 'ménsulas'}, piso de fenólico${p.cerramiento === 'lona' ? ' + lona' : ''} y ${p.visera.tipo === 'ninguna' ? 'sin visera' : `visera a ${p.visera.tipo}° de ${fmt(p.visera.alto)}`}.` });
  // anclajes a la fachada (la bandeja vuelca hacia la calle)
  if (p.anclada) {
    const n = anclarLinea(b, g.col.map((c) => c[0]), ksDe(b, cn.cotas.filter((c) => c > cn.cotas[0] + 1)), [0, -1], p.retiro);
    reglas.push({ regla: 'bandeja.anclajes', estructuraId: est.id, texto: `${n} anclajes a la fachada al tresbolillo.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
  } else {
    const H = yB + 1;
    if (H / T > CRITERIOS.hbMax) avisos.push(avisoEsbeltez(est, H, T, 'params.anclada'));
    if (p.ancho > T) avisos.push({ regla: 'bandeja.vuelco', nivel: 'error', estructuraId: est.id, texto: `Bandeja sin anclar: vuela ${fmt(p.ancho)} sobre una base de ${fmt(T)}. Verificá el vuelco. ${PREDIMENSIONADO}.`, reparaciones: [{ etiqueta: 'Anclar a la fachada', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: true } }] });
  }
  const L = g.S[g.S.length - 1];
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: metricasCaja(L, T + vuelo, yB + 1),
    puertos: puertosCaja('Bandeja', g.S, L, T, yB + 1, r3(yB + 1)),
    info: { cota: yB, vuelo, soporte, visera: p.visera, yTope: r3(yB + 1), relleno: tramos },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.largo', etiqueta: 'Largo', tipo: 'medida', unidad: 'm', min: 1, max: 200, grupo: 'Medidas' },
  { ruta: 'params.cota', etiqueta: 'Altura de la bandeja', tipo: 'medida', unidad: 'm', min: 2, max: 40, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad del andamio', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.retiro', etiqueta: 'Retiro a la fachada', tipo: 'medida', unidad: 'm', min: 0, max: 2, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.ancho', etiqueta: 'Vuelo de la bandeja', tipo: 'medida', unidad: 'm', min: 0.5, max: 3, paso: 0.05, grupo: 'Protección', ayuda: 'Hasta 1,09 con ménsulas; más ancha, con vigas de celosía en voladizo.' },
  { ruta: 'params.soporte', etiqueta: 'Soporte', tipo: 'opcion', opciones: [{ valor: 'auto', etiqueta: 'Automático' }, { valor: 'mensula', etiqueta: 'Ménsulas' }, { valor: 'viga', etiqueta: 'Vigas de celosía' }], grupo: 'Protección' },
  { ruta: 'params.visera.tipo', etiqueta: 'Visera', tipo: 'opcion', opciones: [{ valor: '45', etiqueta: 'Inclinada a 45°' }, { valor: '90', etiqueta: 'Vertical (90°)' }, { valor: 'ninguna', etiqueta: 'Sin visera' }], grupo: 'Protección' },
  { ruta: 'params.visera.alto', etiqueta: 'Alto de la visera', tipo: 'medida', unidad: 'm', min: 0.3, max: 2.5, paso: 0.1, grupo: 'Protección', visibleSi: { ruta: 'params.visera.tipo', distinto: 'ninguna' } },
  { ruta: 'params.cerramiento', etiqueta: 'Cerramiento', tipo: 'opcion', opciones: [{ valor: 'lona', etiqueta: 'Fenólico + lona' }, { valor: 'chapa', etiqueta: 'Chapa' }, { valor: 'fenolico', etiqueta: 'Fenólico' }], grupo: 'Protección' },
  { ruta: 'params.anclada', etiqueta: 'Anclada a la fachada', tipo: 'bool', grupo: 'Apoyo' },
];

const PRESETS: Preset[] = [
  { id: 'bandeja_45', nombre: 'Bandeja con visera a 45°', icono: 'bandeja', descripcion: 'Bandeja de protección de 1,09 sobre ménsulas con visera inclinada y lona.', params: { visera: { tipo: '45', alto: 1 }, ancho: 1.09 } },
  { id: 'bandeja_90', nombre: 'Bandeja con visera a 90°', icono: 'bandeja', descripcion: 'Bandeja de protección cerrada con visera vertical.', params: { visera: { tipo: '90', alto: 1 }, ancho: 1.09 } },
  { id: 'bandeja_amplia', nombre: 'Bandeja amplia', icono: 'bandeja', descripcion: 'Bandeja de 1,75 volada con vigas de celosía de 2,50 tomadas de las dos verticales, piso de fenólico y visera a 45°.', params: { ancho: 1.75, soporte: 'viga', cota: 4, visera: { tipo: '45', alto: 1.2 } } },
];

export const BANDEJA: Tipologia<ParamsBandeja> = {
  id: 'bandeja',
  version: 1,
  nombre: 'Bandeja de protección',
  descripcion: 'Bandeja volada sobre andamio con visera a 90° o 45°, ménsulas o vigas en voladizo, fenólico y lona.',
  categoria: 'bandeja',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarBandeja,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarBandeja,
};
