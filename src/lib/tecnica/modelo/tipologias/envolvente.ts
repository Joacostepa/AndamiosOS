/**
 * Envolvente (pedido 5, foto 5): andamio que rodea un volumen de planta poligonal o circular (cúpula,
 * tanque, columna) con un anillo cerrado.
 * - 'ortogonal' (default, como arma ABA en la foto 5): anillo rectangular alrededor del volumen con lados de
 *   vanos de catálogo, verticales compartidas en las esquinas (sin cuadros extra ni caño y grampa) y
 *   ménsulas hacia adentro donde la curva queda lejos del anillo.
 * - 'poligonal': cada lado del polígono es un tramo, las esquinas se cierran con cuadros y el cierre es
 *   exacto con caño y grampa (medida libre). Opción: torre central apoyada sobre vigas de
 * celosía que cruzan el anillo (el linternón de una cúpula). Anclajes al volumen. Todo es PREDIMENSIONADO.
 */
import type { Elemento, Estructura, Poligono, Regla, TramoVano, V2, V3 } from '../tipos.ts';
import type { MedidasCatalogo } from '../catalogo/catalogo.ts';
import { CRITERIOS } from '../criterios.ts';
import { ConstructorEsqueleto } from '../esqueleto/esqueleto.ts';
import { rellenarLargo } from '../medida/rellenar.ts';
import { bandaConDiagonal, celdaDiagonal, sentidoZigzag, vanosArriostrados } from '../reglas/diagonales.ts';
import type { Campo, CtxGenerar, Generado, Preset, Tipologia } from './registro.ts';
import { cotasNiveles, grillaPoligono, grillaRect } from './comunes/grilla.ts';
import { antihorario, poligonoCirculo } from './comunes/poligono.ts';
import { primViga, puerto, type PuertoLocal } from './comunes/util-tipologias.ts';
import { ajustarMedidasCatalogo, anclarLinea, profundidadDe, cerrarEsquinasPoligono, fusionarColumnasCercanas, rodapiesCortos, type AvisoGen, barandasPerimetro, diagonalesPerimetro, ksDe, largoCatalogo, medida, opcion, plataformaGrilla } from './nuevas-comunes.ts';
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
  /** 'ortogonal': anillo rectangular con ménsulas hacia la curva; 'poligonal': un tramo por lado */
  trazado: 'ortogonal' | 'poligonal';
}

const DEF: ParamsEnvolvente = { planta: { tipo: 'circulo', centro: [0, 0], radio: 3, lados: 8 }, offset: 0.3, profundidad: 0.73, altura: 10, modoPlataforma: 'cada_2m', cierreExacto: true, anclada: true, torreCentral: null, trazado: 'ortogonal' };

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
    trazado: opcion(x.trazado, ['ortogonal', 'poligonal'] as const, 'ortogonal'),
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

/** Lado de catálogo: la combinación de vanos de catálogo más corta que cubre `L` (nunca menos). */
export function ladoCatalogo(L: number, m: MedidasCatalogo): TramoVano[] {
  for (let extra = 0; extra < 3; extra = r3(extra + 0.05)) {
    const r = rellenarLargo(L + extra, 'multi', { modo: 'catalogo', medidas: m });
    if (r.total >= L - 0.005) return r.vanos;
  }
  return rellenarLargo(L + 3, 'multi', { modo: 'catalogo', medidas: m }).vanos;
}

/** Distancia de un punto al borde de un polígono. */
function distAlBorde(P: Poligono, q: V2): number {
  let d = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2));
    d = Math.min(d, Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dz)));
  }
  return d;
}

interface AnilloOrtogonal {
  b: ConstructorEsqueleto;
  /** columnas de la línea interior (contacto con el volumen) */
  contacto: string[];
  /** s de las dos líneas interiores (para las vigas de la torre central) */
  sIn: [number, number];
  perimetro: number;
  lados: { a: V2; z: V2; afuera: V2; cols: number[] }[];
  mensulas: number;
}

/**
 * Anillo rectangular (foto 5): lados de vanos de catálogo alrededor de la caja del volumen + separación,
 * profundidad de catálogo, una vertical por nodo (las esquinas se comparten), diagonales en zigzag en las
 * caras exteriores y ménsulas hacia adentro en los niveles con plataforma donde la curva queda lejos.
 */
function anilloOrtogonal(o: { P: Poligono; offset: number; prof: number; cotas: number[]; plataformas: number[]; catalogo: CtxGenerar['catalogo']; m: MedidasCatalogo }): AnilloOrtogonal {
  const { P, m } = o;
  const xs = P.map((q) => q[0]);
  const zs = P.map((q) => q[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const ws = ladoCatalogo(x1 - x0 + 2 * o.offset, m);
  const wt = ladoCatalogo(z1 - z0 + 2 * o.offset, m);
  const Wi = sum(ws.map((t) => t.medida));
  const Di = sum(wt.map((t) => t.medida));
  const pr = o.prof;
  const S = [r3((x0 + x1) / 2 - Wi / 2 - pr)];
  for (const v of [pr, ...ws.map((t) => t.medida), pr]) S.push(r3(S[S.length - 1] + v));
  const T = [r3((z0 + z1) / 2 - Di / 2 - pr)];
  for (const v of [pr, ...wt.map((t) => t.medida), pr]) T.push(r3(T[T.length - 1] + v));
  const nS = S.length;
  const nT = T.length;
  const b = new ConstructorEsqueleto('multi', o.cotas);
  const cotas = [...o.cotas].sort((a, c) => a - c);
  const yBase = cotas[0];
  const plats = o.plataformas.map(r3);
  const yTope = r3(cotas[cotas.length - 1] + (plats.includes(r3(cotas[cotas.length - 1])) ? 1 : 0));
  const anilloPano = (i: number, j: number) => i === 0 || i === nS - 2 || j === 0 || j === nT - 2;
  const pano = (i: number, j: number) => i >= 0 && j >= 0 && i <= nS - 2 && j <= nT - 2 && anilloPano(i, j);
  const hueco = (i: number, j: number) => i >= 0 && j >= 0 && i <= nS - 2 && j <= nT - 2 && !anilloPano(i, j);
  const col: (string | null)[][] = [];
  for (let i = 0; i < nS; i++) {
    col[i] = [];
    for (let j = 0; j < nT; j++) {
      const usa = pano(i - 1, j - 1) || pano(i, j - 1) || pano(i - 1, j) || pano(i, j);
      col[i][j] = usa ? b.columna(`gc${i}_${j}`, [S[i], T[j]], yBase, yTope, 'base_regulable') : null;
    }
  }
  const cx = (S[0] + S[nS - 1]) / 2;
  const cz = (T[0] + T[nT - 1]) / 2;
  const vS: Record<string, string> = {};
  const vT: Record<string, string> = {};
  const caraDe = (pa: boolean, pb: boolean, ha: boolean, hb: boolean, borde: boolean): 'exterior' | 'interior' | 'interna' => (borde ? 'exterior' : (pa && hb) || (pb && ha) ? 'interior' : 'interna');
  for (let j = 0; j < nT; j++) for (let i = 0; i < nS - 1; i++) {
    const abajo = pano(i, j - 1);
    const arriba = pano(i, j);
    if (!abajo && !arriba) continue;
    const borde = j === 0 || j === nT - 1;
    const cara = caraDe(abajo, arriba, hueco(i, j - 1), hueco(i, j), borde);
    const normal: V2 | undefined = cara === 'exterior' ? [0, j === 0 ? -1 : 1] : cara === 'interior' ? [0, abajo ? 1 : -1] : undefined;
    const tramo = i === 0 || i === nS - 2 ? null : ws[i - 1];
    vS[`${i}_${j}`] = b.vano(`gs${j}_${i}`, col[i][j]!, col[i + 1][j]!, cara, { libre: !!tramo?.libre, normal });
  }
  for (let i = 0; i < nS; i++) for (let j = 0; j < nT - 1; j++) {
    const izq = pano(i - 1, j);
    const der = pano(i, j);
    if (!izq && !der) continue;
    const borde = i === 0 || i === nS - 1;
    const cara0 = caraDe(izq, der, hueco(i - 1, j), hueco(i, j), borde);
    const cara = cara0 === 'interna' ? 'transversal' : cara0;
    const normal: V2 | undefined = cara === 'exterior' ? [i === 0 ? -1 : 1, 0] : cara === 'interior' ? [izq ? 1 : -1, 0] : undefined;
    const tramo = j === 0 || j === nT - 2 ? null : wt[j - 1];
    vT[`${i}_${j}`] = b.vano(`gt${i}_${j}`, col[i][j]!, col[i][j + 1]!, cara, { libre: !!tramo?.libre, normal });
  }
  const panos: string[] = [];
  for (let i = 0; i < nS - 1; i++) for (let j = 0; j < nT - 1; j++) {
    if (!pano(i, j)) continue;
    panos.push(b.pano(`gp${i}_${j}`, [vS[`${i}_${j}`], vT[`${i + 1}_${j}`], vS[`${i}_${j + 1}`], vT[`${i}_${j}`]], { sentido: j === 0 || j === nT - 2 ? vS[`${i}_${j}`] : vT[`${i}_${j}`] }));
  }
  const exteriores = b.esq.vanos.filter((v) => v.cara === 'exterior');
  const interiores = b.esq.vanos.filter((v) => v.cara === 'interior');
  // plataformas, barandas exteriores y, hacia el volumen, ménsulas donde la curva queda lejos
  const brazos = [...m.multi.mensulas].sort((a, c) => a - c);
  let mensulas = 0;
  for (const c of plats) {
    const k = b.k(c);
    if (k < 0) continue;
    for (const pid of panos) b.celdaPano(pid, k, { plataforma: 'tablones' });
    for (const v of exteriores) b.celda(v.id, k, { baranda: 2 });
    for (const v of interiores) {
      const A = b.col(v.a);
      const B = b.col(v.b);
      const medio: V2 = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2];
      const hueco0 = Math.min(distAlBorde(P, A.p), distAlBorde(P, B.p), distAlBorde(P, medio));
      const brazo = [...brazos].reverse().find((x) => x <= hueco0 - 0.05 + EPS);
      if (brazo && hueco0 > CRITERIOS.retiroLibre + EPS) {
        for (const X of [A, B]) {
          const prev = b.esq.nodos[`${X.id}@${k}`]?.mensula;
          if (!prev || prev.brazo > brazo) b.nodo(X.id, k, { mensula: { dir: 'fachada', brazo, baranda: false } });
        }
        mensulas++;
      }
      const resto = brazo ? hueco0 - brazo : hueco0;
      if (resto > CRITERIOS.retiroLibre + EPS) b.celda(v.id, k, { baranda: 2 });
    }
  }
  // diagonales: zigzag en los vanos arriostrados de cada cara exterior (los lados del rectángulo)
  const ks = b.esq.cotas;
  const filas: string[][] = [
    Array.from({ length: nS - 1 }, (_, i) => vS[`${i}_0`]),
    Array.from({ length: nT - 1 }, (_, j) => vT[`${nS - 1}_${j}`]),
    Array.from({ length: nS - 1 }, (_, i) => vS[`${nS - 2 - i}_${nT - 1}`]),
    Array.from({ length: nT - 1 }, (_, j) => vT[`0_${nT - 2 - j}`]),
  ];
  filas.forEach((fila, f) => {
    vanosArriostrados(fila.length).forEach((i, fase) => {
      const v = b.esq.vanos.find((x) => x.id === fila[i])!;
      let orden = 0;
      for (let k = 1; k < ks.length; k++) if (bandaConDiagonal(ks[k] - ks[k - 1])) b.celda(v.id, k, celdaDiagonal(o.catalogo, ks[k] - ks[k - 1], v.medida, sentidoZigzag(orden++, fase + f)));
    });
  });
  const contacto: string[] = [];
  for (let i = 1; i < nS - 1; i++) for (let j = 1; j < nT - 1; j++) if (col[i][j] && (i === 1 || i === nS - 2 || j === 1 || j === nT - 2)) contacto.push(col[i][j]!);
  const esquinas: V2[] = [[S[0], T[0]], [S[nS - 1], T[0]], [S[nS - 1], T[nT - 1]], [S[0], T[nT - 1]]];
  const lados = esquinas.map((a, i) => {
    const z = esquinas[(i + 1) % 4];
    const medio: V2 = [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2];
    const L = Math.hypot(medio[0] - cx, medio[1] - cz) || 1;
    const afuera: V2 = [r3((medio[0] - cx) / L), r3((medio[1] - cz) / L)];
    const largo = Math.hypot(z[0] - a[0], z[1] - a[1]);
    const nodos = i % 2 === 0 ? S : T;
    const rel = nodos.map((x) => r3(Math.abs(x - nodos[i < 2 ? 0 : nodos.length - 1])));
    return { a, z, afuera, cols: (i < 2 ? rel : [...rel].reverse()).filter((x) => x <= largo + EPS) };
  });
  return { b, contacto, sIn: [S[1], S[nS - 2]], perimetro: r3(2 * (S[nS - 1] - S[0]) + 2 * (T[nT - 1] - T[0])), lados, mensulas };
}

export function generarEnvolvente(est: Estructura & { params: ParamsEnvolvente }, ctx: CtxGenerar): Generado {
  const p = est.params;
  const m = ctx.catalogo.medidas;
  const cat = ctx.catalogo;
  const avisos: AvisoGen[] = [];
  const reglas: Omit<Regla, 'id'>[] = [];
  const P = plantaLocal(est, ctx, avisos);
  const cn = cotasNiveles({ altura: p.altura, modo: p.modoPlataforma });
  const orto = p.trazado === 'ortogonal';
  let b: ConstructorEsqueleto;
  let luzVigas: (z: number) => [number, number] | null;
  let ladosPuerto: { a: V2; z: V2; afuera: V2; cols: number[] }[] = [];
  let perimetro = 0;
  let gp: ReturnType<typeof grillaPoligono> | null = null;
  if (orto) {
    const prof = profundidadDe(p.profundidad, 'catalogo', m);
    const an = anilloOrtogonal({ P, offset: p.offset, prof: prof.medida, cotas: cn.cotas, plataformas: cn.plataformas, catalogo: cat, m });
    b = an.b;
    luzVigas = () => an.sIn;
    ladosPuerto = an.lados;
    perimetro = an.perimetro;
    reglas.push({ regla: 'envolvente.armado', estructuraId: est.id, texto: `Anillo rectangular de catálogo alrededor del volumen (como en obra): esquinas con vertical compartida${an.mensulas ? `, ${an.mensulas} tramos con ménsulas hacia la curva` : ''}.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.trazado', valor: 'poligonal' } });
    if (p.anclada) {
      let n = 0;
      const ks = ksDe(b, cn.plataformas);
      ks.forEach((k, j) => {
        if (j % CRITERIOS.anclajeDn !== 0 && j !== ks.length - 1) return;
        an.contacto.forEach((cid, i) => {
          if ((i + j) % CRITERIOS.anclajeDx !== 0) return;
          const C = b.col(cid);
          const retiro = distAlBorde(P, C.p);
          if (retiro > 1.5) return;
          b.nodo(cid, k, { anclaje: { retiro: r3(Math.max(0.15, retiro)) } });
          n++;
        });
      });
      if (n) reglas.push({ regla: 'envolvente.anclajes', estructuraId: est.id, texto: `${n} anclajes al volumen al tresbolillo.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
    }
  } else {
    const modo = est.medida === 'libre' || p.cierreExacto ? 'libre' : 'catalogo';
    gp = grillaPoligono({ poligono: P, offset: p.offset, profundidad: p.profundidad, cotas: cn.cotas, cerrada: true, plataformas: cn.plataformas, modo, catalogo: cat, medidas: m, prefijo: 'g' });
    b = gp.b;
    cerrarEsquinasPoligono(b.esq, gp.lados, [...m.multi.vanos, ...m.multi.profundidades]);
    ajustarMedidasCatalogo(b.esq, m);
    if (modo === 'catalogo') avisos.push({ regla: 'envolvente.cierre', nivel: 'aviso', estructuraId: est.id, texto: 'Envolvente con vanos de catálogo: las esquinas pueden no cerrar exacto.', reparaciones: [{ etiqueta: 'Cerrar exacto con caño y grampa', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.cierreExacto', valor: true } }] });
    const libres = b.esq.vanos.filter((v) => v.libre).length;
    reglas.push({ regla: 'envolvente.armado', estructuraId: est.id, texto: `Anillo cerrado de ${gp.lados.length} lados a ${fmt(p.offset)} del volumen, ${fmt(p.profundidad)} de profundidad${libres ? `, ${libres} vanos de ajuste con caño y grampa` : ''}.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.trazado', valor: 'ortogonal' } });
    if (p.anclada) {
      const n = anclarLinea(b, gp.contacto, ksDe(b, cn.plataformas), null, p.offset);
      reglas.push({ regla: 'envolvente.anclajes', estructuraId: est.id, texto: `${n} anclajes al volumen al tresbolillo.`, deshacer: { tipo: 'param', estructuraId: est.id, ruta: 'params.anclada', valor: false } });
    }
    luzVigas = (z) => {
      const cu = cuerdaX(P, z);
      return cu ? [r3(cu[0] - p.offset), r3(cu[1] + p.offset)] : null;
    };
    perimetro = r3(sum(gp.lados.flatMap((L) => L.tramos.map((t) => t.medida))));
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
      const cu = luzVigas(z);
      if (!cu) continue;
      const [xa, xb] = cu;
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
  const puertos: PuertoLocal[] = [];
  if (gp) {
    const col = new Map(b.esq.columnas.map((c) => [c.id, c]));
    gp.lados.forEach((L) => {
      if (L.exterior.length < 2) return;
      const a = col.get(L.exterior[0])!.p;
      const z = col.get(L.exterior[L.exterior.length - 1])!.p;
      const largo = Math.hypot(z[0] - a[0], z[1] - a[1]);
      const n: V2 = [-(z[1] - a[1]) / (largo || 1), (z[0] - a[0]) / (largo || 1)];
      const [cx, cz] = centroide(P);
      const afuera = (a[0] - cx) * n[0] + (a[1] - cz) * n[1] > 0 ? n : ([-n[0], -n[1]] as V2);
      let acc = 0;
      const cols = [0, ...L.tramos.map((t) => (acc = r3(acc + t.medida)))];
      ladosPuerto.push({ a, z, afuera, cols });
    });
    const fusionadas = fusionarColumnasCercanas(b.esq);
    if (fusionadas) reglas.push({ regla: 'envolvente.esquinas', estructuraId: est.id, texto: `${fusionadas} verticales de esquina compartidas entre lados.` });
    rodapiesCortos(b.esq);
  }
  ladosPuerto.forEach((L, i) => puertos.push(puerto(`l${i}`, 'cara', `Envolvente · lado ${i + 1}`, [L.a[0], 0, L.a[1]], [L.z[0], 0, L.z[1]], [L.afuera[0], 0, L.afuera[1]], L.cols, cn.alturaReal)));
  const ext = envolvente(b.esq.columnas.map((c) => c.p));
  return {
    esqueleto: b.esq, avisos, reglas,
    metricas: { m2: r3(perimetro * cn.alturaReal), ml: perimetro, alturaReal: yTop, huella: ext.length >= 3 ? ext : P },
    puertos,
    info: { lados: gp ? gp.lados.length : 4, perimetro, poligono: P, trazado: p.trazado },
  };
}

const CAMPOS: Campo[] = [
  { ruta: 'params.planta', etiqueta: 'Planta', tipo: 'poligono', grupo: 'Medidas', ayuda: 'Círculo (centro, radio, lados), polígono o un volumen del contexto.' },
  { ruta: 'params.altura', etiqueta: 'Altura', tipo: 'medida', unidad: 'm', min: 2.5, max: 80, paso: 0.5, grupo: 'Medidas' },
  { ruta: 'params.offset', etiqueta: 'Separación al volumen', tipo: 'medida', unidad: 'm', min: 0.05, max: 3, paso: 0.05, grupo: 'Medidas' },
  { ruta: 'params.profundidad', etiqueta: 'Profundidad', tipo: 'medida', unidad: 'm', catalogo: 'profundidades', grupo: 'Medidas' },
  { ruta: 'params.modoPlataforma', etiqueta: 'Plataformas', tipo: 'opcion', opciones: [{ valor: 'cada_2m', etiqueta: 'Cada 2,00' }, { valor: 'cada_nivel', etiqueta: 'Cada nivel' }, { valor: 'solo_trabajo', etiqueta: 'Solo arriba' }], grupo: 'Medidas' },
  { ruta: 'params.trazado', etiqueta: 'Trazado', tipo: 'opcion', opciones: [{ valor: 'ortogonal', etiqueta: 'Anillo rectangular + ménsulas (como en obra)' }, { valor: 'poligonal', etiqueta: 'Un tramo por lado del polígono' }], grupo: 'Medidas' },
  { ruta: 'params.cierreExacto', etiqueta: 'Cierre exacto (caño y grampa)', tipo: 'bool', grupo: 'Avanzado', visibleSi: { ruta: 'params.trazado', igual: 'poligonal' } },
  { ruta: 'params.anclada', etiqueta: 'Anclada al volumen', tipo: 'bool', grupo: 'Apoyo' },
  { ruta: 'params.torreCentral.largo', etiqueta: 'Torre central · largo', tipo: 'medida', unidad: 'm', catalogo: 'vanos', grupo: 'Accesos' },
  { ruta: 'params.torreCentral.hasta', etiqueta: 'Torre central · hasta', tipo: 'medida', unidad: 'm', grupo: 'Accesos' },
];

const PRESETS: Preset[] = [
  { id: 'envolvente_cupula', nombre: 'Envolvente de cúpula', icono: 'envolvente', descripcion: 'Anillo rectangular alrededor de una cúpula, ménsulas hacia la curva y torre central sobre vigas para el linternón.', params: { planta: { tipo: 'circulo', centro: [0, 0], radio: 3.5, lados: 8 }, altura: 10, offset: 0.2, torreCentral: { largo: 2.5, ancho: 2.5, desde: 0, hasta: 14 } } },
  { id: 'envolvente_tanque', nombre: 'Envolvente de tanque', icono: 'envolvente', descripcion: 'Anillo rectangular alrededor de un tanque cilíndrico con ménsulas hacia la curva, plataformas cada 2,00.', params: { planta: { tipo: 'circulo', centro: [0, 0], radio: 2.5, lados: 12 }, altura: 8 } },
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
