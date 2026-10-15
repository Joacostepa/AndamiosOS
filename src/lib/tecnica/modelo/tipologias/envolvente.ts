/**
 * Envolvente (pedido 5, foto 5): andamio que rodea un volumen de planta poligonal o circular (cúpula,
 * tanque, columna) con un anillo cerrado: cada lado se parte en vanos, las esquinas se cierran con cuadros
 * y el cierre es exacto con caño y grampa (medida libre). Opción: torre central apoyada sobre vigas de
 * celosía que cruzan el anillo (el linternón de una cúpula). Anclajes al volumen. Todo es PREDIMENSIONADO.
 */
import type { Elemento, Estructura, Poligono, Regla, V2, V3 } from '../tipos.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { cotasNiveles, grillaPoligono, grillaRect } from './comunes/grilla.ts';
import { antihorario, poligonoCirculo } from './comunes/poligono.ts';
import { primViga, puerto, type PuertoLocal } from './comunes/util-tipologias.ts';
import { ajustarMedidasCatalogo, anclarLinea, cerrarEsquinasPoligono, fusionarColumnasCercanas, rodapiesCortos, type AvisoGen, barandasPerimetro, diagonalesPerimetro, ksDe, largoCatalogo, medida, opcion, plataformaGrilla } from './nuevas-comunes.ts';
import { aLocal, centroide, envolvente, EPS, fmt, marco, r3, sum } from '../util.ts';

export type PlantaEnvolvente =
  | { tipo: 'circulo'; centro: V2; radio: number; lados: number }
  | { tipo: 'poligono'; puntos: V2[] }
  | { tipo: 'volumen'; volumenId: string };

export interface TorreCentral {
  largo: number;
  ancho: number;
  /** cota de las vigas donde apoya (0 = el último nivel de la envolvente) */
  desde: number;
  /** cota de la plataforma más alta de la torre */
  hasta: number;
}

export interface ParamsEnvolvente extends Record<string, unknown> {
  planta: PlantaEnvolvente;
  /** separación del volumen a la línea de verticales interiores */
  offset: number;
  profundidad: number;
  altura: number;
  modoPlataforma: 'cada_2m' | 'cada_nivel' | 'solo_trabajo';
  cierreExacto: boolean;
  anclada: boolean;
  torreCentral: TorreCentral | null;
}

const DEF: ParamsEnvolvente = { planta: { tipo: 'circulo', centro: [0, 0], radio: 3, lados: 8 }, offset: 0.3, profundidad: 0.73, altura: 10, modoPlataforma: 'cada_2m', cierreExacto: true, anclada: true, torreCentral: null };

function normalizarPlanta(v: unknown): PlantaEnvolvente {
  const x = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  if (x.tipo === 'poligono' && Array.isArray(x.puntos)) {
    const pts = (x.puntos as unknown[]).filter((q): q is V2 => Array.isArray(q) && q.length === 2 && q.every((n) => Number.isFinite(n))).map((q) => [r3(q[0]), r3(q[1])] as V2);
    if (pts.length >= 3) return { tipo: 'poligono', puntos: pts };
  }
  if (x.tipo === 'volumen' && typeof x.volumenId === 'string' && x.volumenId) return { tipo: 'volumen', volumenId: x.volumenId };
  const c = Array.isArray(x.centro) && x.centro.length === 2 && x.centro.every((n) => Number.isFinite(n)) ? (x.centro as V2) : [0, 0];
  return { tipo: 'circulo', centro: [r3(c[0]), r3(c[1])], radio: medida(x.radio, 3, 0.3, 40), lados: Math.round(medida(x.lados, 8, 4, 24)) };
}

export function normalizarEnvolvente(parcial: Partial<ParamsEnvolvente>): { params: ParamsEnvolvente; avisos: string[] } {
  const x = (parcial || {}) as Record<string, unknown>;
  const altura = medida(x.altura, DEF.altura, 2.5, 80);
  const t = x.torreCentral && typeof x.torreCentral === 'object' ? (x.torreCentral as Record<string, unknown>) : null;
  const p: ParamsEnvolvente = {
    planta: normalizarPlanta(x.planta),
    offset: medida(x.offset, DEF.offset, 0.05, 3),
    profundidad: medida(x.profundidad, DEF.profundidad, 0.5, 2.5),
    altura,
    modoPlataforma: opcion(x.modoPlataforma, ['cada_2m', 'cada_nivel', 'solo_trabajo'] as const, 'cada_2m'),
    cierreExacto: x.cierreExacto === undefined ? true : !!x.cierreExacto,
    anclada: x.anclada === undefined ? true : !!x.anclada,
    torreCentral: t ? { largo: medida(t.largo, 2.5, 0.73, 5), ancho: medida(t.ancho, 2.5, 0.73, 5), desde: medida(t.desde, 0, 0, 120), hasta: medida(t.hasta, altura + 4, 2, 150) } : null,
  };
  return { params: p, avisos: [] };
}

/** Planta en coordenadas locales de la estructura. */
function plantaLocal(est: Estructura & { params: ParamsEnvolvente }, ctx: CtxGenerar, avisos: AvisoGen[]): Poligono {
  const pl = est.params.planta;
  if (pl.tipo === 'poligono') return antihorario(pl.puntos);
  if (pl.tipo === 'volumen') {
    const vol = ctx.diseno.contexto?.volumenes?.find((v) => v.id === pl.volumenId);
    if (vol && vol.planta.length >= 3) {
      const mk = marco(est.origen, est.rumbo);
      return antihorario(vol.planta.map((q) => aLocal(mk, q)));
    }
    avisos.push({ regla: 'envolvente.sin_volumen', nivel: 'aviso', estructuraId: est.id, texto: `No encuentro el volumen «${pl.volumenId}»: dibujé un círculo de 3,00.`, reparaciones: [] });
    return poligonoCirculo([0, 0], 3, 8);
  }
  return poligonoCirculo(pl.centro, pl.radio, pl.lados);
}

/** Extremos [x0, x1] de la recta z = z0 dentro del polígono. */
function cuerdaX(P: Poligono, z0: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    if ((a[1] - z0) * (b[1] - z0) > 0 || Math.abs(a[1] - b[1]) < EPS) continue;
    xs.push(a[0] + ((z0 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  if (xs.length < 2) return null;
  return [Math.min(...xs), Math.max(...xs)];
}

export function generarEnvolvente(est: Estructura & { params: ParamsEnvolvente }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const P = plantaLocal(est, ctx, avisos);
  const cn = cotasNiveles({ altura: p.altura, modo: p.modoPlataforma });
  const modo = est.medida === 'libre' || p.cierreExacto ? 'libre' : 'catalogo';
  const gp = grillaPoligono({ poligono: P, offset: p.offset, profundidad: p.profundidad, cotas: cn.cotas, cerrada: true, plataformas: cn.plataformas, modo, catalogo: cat, medidas: m, prefijo: 'g' });
  const b = gp.b;
  cerrarEsquinasPoligono(b.esq, gp.lados, [...m.multi.vanos, ...m.multi.profundidades]);
  ajustarMedidasCatalogo(b.esq, m);
  if (modo === 'catalogo') avisos.push({ regla: 'envolvente.cierre', nivel: 'aviso', estructuraId: est.id, texto: 'Envolvente con vanos de catálogo: las esquinas pueden no cerrar exacto.', reparaciones: [{ etiqueta: 'Cerrar exacto con caño y grampa', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.cierreExacto', valor: true } }] });
  const libres = b.esq.vanos.filter((v) => v.libre).length;
  reglas.push({ regla: 'envolvente.armado', estructuraId: est.id, texto: `Anillo cerrado de ${gp.lados.length} lados a ${fmt(p.offset)} del volumen, ${fmt(p.profundidad)} de profundidad${libres ? `, ${libres} vanos de ajuste con caño y grampa` : ''}.` });
  if (p.anclada) {
    const n = anclarLinea(b, gp.contacto, ksDe(b, cn.plataformas), null, p.offset);
    reglas.push({ regla: 'envolvente.anclajes', estructuraId: est.id, texto: `${n} anclajes al volumen al tresbolillo.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
  }
  const els: Elemento[] = [];
  let yTop = cn.yTopCol;
  if (p.torreCentral) {
    const tc = p.torreCentral;
    const anillos = b.esq.cotas.filter((c) => c <= cn.plataformas[cn.plataformas.length - 1] + EPS);
    const pedido = tc.desde > 0 ? tc.desde : anillos[anillos.length - 1];
    const desde = [...anillos].reverse().find((c) => c <= pedido + EPS) ?? anillos[anillos.length - 1];
    if (tc.desde > 0 && Math.abs(desde - tc.desde) > 0.01) avisos.push({ regla: 'envolvente.torre_cota', nivel: 'info', estructuraId: est.id, texto: `La torre central apoya a ${fmt(desde)} (anillo de la envolvente más cercano por debajo de ${fmt(tc.desde)}).`, reparaciones: [] });
    const cotasT = anillos.filter((c) => c >= desde - EPS);
    let c = cotasT[cotasT.length - 1];
    while (c + 2 <= tc.hasta + EPS) {
      c = r3(c + 2);
      cotasT.push(c);
    }
    if (cotasT.length < 2) cotasT.push(r3(desde + 2));
    const [cx, cz] = centroide(P);
    const s0 = r3(cx - tc.largo / 2);
    const t0 = r3(cz - tc.ancho / 2);
    const yTopT = r3(cotasT[cotasT.length - 1] + 1);
    const gt = grillaRect({ vanosS: [tc.largo], profundidades: [tc.ancho], cotas: cotasT, origen: [s0, t0], prefijo: 'tc', apoyo: 'sobre', yTope: yTopT, diagonales: false, barandas: false, catalogo: cat, medidas: m, en: b });
    const sobre = cotasT.filter((y) => y > cn.yTopCol - 1 + EPS);
    for (const y of sobre) {
      const k = b.k(y);
      plataformaGrilla(b, gt, k);
      barandasPerimetro(b, gt, k);
    }
    diagonalesPerimetro(b, cat, gt, { desde });
    // vigas de celosía que cruzan el anillo bajo las patas de la torre
    for (const [j, z] of [t0, r3(t0 + tc.ancho)].entries()) {
      const cu = cuerdaX(P, z);
      if (!cu) continue;
      const xa = r3(cu[0] - p.offset);
      const xb = r3(cu[1] + p.offset);
      const luz = r3(xb - xa);
      const v = largoCatalogo(luz, m.multi.vigasCelosia);
      const a: V3 = [xa, desde, z];
      const bb: V3 = [xb, desde, z];
      els.push({ id: `tcv${j}`, familia: 'viga_celosia', medidas: { largo: v.largo }, a, b: bb, primitivas: primViga(a, bb, 0.5), grupo: 'torre_central' });
      for (const [i, q] of [a, bb].entries()) els.push({ id: `tcv${j}:g${i}`, familia: 'grampa_fija', medidas: {}, a: q, b: q, grupo: 'torre_central', sistema: 'comun' });
      if (v.excede) avisos.push({ regla: 'envolvente.viga', nivel: 'aviso', estructuraId: est.id, texto: `La viga bajo la torre central cruza ${fmt(luz)}: no hay viga de celosía de catálogo tan larga.`, reparaciones: [] });
    }
    avisos.push({ regla: 'envolvente.torre_apoyo', nivel: 'aviso', estructuraId: est.id, texto: `Torre central apoyada sobre vigas a ${fmt(desde)}: verificar las vigas y el anillo. Predimensionado.`, reparaciones: [] });
    reglas.push({ regla: 'envolvente.torre', estructuraId: est.id, texto: `Torre central de ${fmt(tc.largo)} × ${fmt(tc.ancho)} hasta ${fmt(cotasT[cotasT.length - 1])}, sobre 2 vigas de celosía.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.torreCentral', valor: null } });
    yTop = Math.max(yTop, yTopT);
  }
  for (const e of els) b.elemento(e);
  // puertos: la cara exterior de cada lado
  const col = new Map(b.esq.columnas.map((c) => [c.id, c]));
  const puertos: PuertoLocal[] = [];
  gp.lados.forEach((L, i) => {
    if (L.exterior.length < 2) return;
    const a = col.get(L.exterior[0])!.p;
    const z = col.get(L.exterior[L.exterior.length - 1])!.p;
    const largo = Math.hypot(z[0] - a[0], z[1] - a[1]);
    const n: V2 = [-(z[1] - a[1]) / (largo || 1), (z[0] - a[0]) / (largo || 1)];
    const [cx, cz] = centroide(P);
    const afuera = (a[0] - cx) * n[0] + (a[1] - cz) * n[1] > 0 ? n : ([-n[0], -n[1]] as V2);
    let acc = 0;
    const cols = [0, ...L.tramos.map((t) => (acc = r3(acc + t.medida)))];
    puertos.push(puerto(`l${i}`, 'cara', `Envolvente · lado ${i + 1}`, [a[0], 0, a[1]], [z[0], 0, z[1]], [afuera[0], 0, afuera[1]], cols, cn.alturaReal));
  });
  const fusionadas = fusionarColumnasCercanas(b.esq);
  if (fusionadas) reglas.push({ regla: 'envolvente.esquinas', estructuraId: est.id, texto: `${fusionadas} verticales de esquina compartidas entre lados.` });
  rodapiesCortos(b.esq);
  const perimetro = r3(sum(gp.lados.flatMap((L) => L.tramos.map((t) => t.medida))));
  const ext = envolvente(b.esq.columnas.map((c) => c.p));
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: r3(perimetro * cn.alturaReal), ml: perimetro, alturaReal: yTop, huella: ext.length >= 3 ? ext : P },
    puertos,
    info: { lados: gp.lados.length, perimetro, poligono: P },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.planta', etiqueta: 'Planta', tipo: 'poligono', grupo: 'Medidas', ayuda: 'Círculo (centro, radio, lados), polígono o un volumen del contexto.' },
  { ruta: 'params.altura', etiqueta: 'Altura', tipo: 'medida', unidad: 'm', min: 2.5, max: 80, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.offset', etiqueta: 'Separación al volumen', tipo: 'medida', unidad: 'm', min: 0.05, max: 3, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.modoPlataforma', etiqueta: 'Plataformas', tipo: 'opcion', opciones: [{ valor: 'cada_2m', etiqueta: 'Cada 2,00' }, { valor: 'cada_nivel', etiqueta: 'Cada nivel' }, { valor: 'solo_trabajo', etiqueta: 'Solo arriba' }], grupo: 'Medidas' },
  { ruta: 'params.cierreExacto', etiqueta: 'Cierre exacto (caño y grampa)', tipo: 'bool', grupo: 'Avanzado' },
  { ruta: 'params.anclada', etiqueta: 'Anclada al volumen', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.torreCentral.largo', etiqueta: 'Torre central · largo', tipo: 'medida', unidad: 'm', catalogo: 'vanos', grupo: 'Accesos' },
  { ruta: 'params.torreCentral.hasta', etiqueta: 'Torre central · hasta', tipo: 'medida', unidad: 'm', grupo: 'Accesos' },
];

const PRESETS: Preset[] = [
  { id: 'envolvente_cupula', nombre: 'Envolvente de cúpula', icono: 'envolvente', descripcion: 'Anillo octogonal alrededor de una cúpula con torre central sobre vigas para el linternón.', params: { planta: { tipo: 'circulo', centro: [0, 0], radio: 3.5, lados: 8 }, altura: 10, torreCentral: { largo: 2.5, ancho: 2.5, desde: 0, hasta: 14 } } },
  { id: 'envolvente_tanque', nombre: 'Envolvente de tanque', icono: 'envolvente', descripcion: 'Anillo de 12 lados alrededor de un tanque cilíndrico, plataformas cada 2,00.', params: { planta: { tipo: 'circulo', centro: [0, 0], radio: 2.5, lados: 12 }, altura: 8 } },
  { id: 'envolvente_columna', nombre: 'Envolvente de columna', icono: 'envolvente', descripcion: 'Andamio cuadrado alrededor de una columna o pilar.', params: { planta: { tipo: 'poligono', puntos: [[0, 0], [0.6, 0], [0.6, 0.6], [0, 0.6]] }, altura: 6, offset: 0.2, modoPlataforma: 'cada_nivel' } },
];

export const ENVOLVENTE: Tipologia<ParamsEnvolvente> = {
  id: 'envolvente',
  version: 1,
  nombre: 'Envolvente',
  descripcion: 'Anillo cerrado alrededor de un volumen de planta poligonal o circular, con torre central opcional.',
  categoria: 'especial',
  sistemas: ['multi'],
  apoyos: ['suelo'],
  porDefecto: () => structuredClone(DEF),
  normalizar: normalizarEnvolvente,
  campos: CAMPOS,
  presets: PRESETS,
  generar: generarEnvolvente,
};
