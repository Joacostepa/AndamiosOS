/**
 * Ayudas compartidas por las tipologías nuevas (bandejas, colgantes, envolventes, patios, escaleras,
 * torres de plataforma y móviles). No es del núcleo: solo lee módulos del núcleo, no los modifica.
 * Coordenadas LOCALES de la estructura: s a lo largo, t hacia afuera, y arriba. Todo es PREDIMENSIONADO.
 */
import type { Aviso, Elemento, Esqueleto, Medidas, ModoMedida, Poligono, TramoVano, V2, V3 } from '../tipos.ts';
import type { Catalogo, MedidasCatalogo } from '../catalogo/catalogo.ts';
import { resolverCodigo } from '../catalogo/catalogo.ts';
import { CRITERIOS } from '../criterios.ts';
import { celdaId, cubre, type ConstructorEsqueleto } from '../esqueleto/esqueleto.ts';
import { canoDiagonal, canoPara } from '../medida/ajustes.ts';
import { rellenarLargo } from '../medida/rellenar.ts';
import { bandaConDiagonal, celdaDiagonal, sentidoZigzag, vanosArriostrados } from '../reglas/diagonales.ts';
import { clamp, EPS, fmt, masCercano, num, r3 } from '../util.ts';
import type { GrillaRect } from './comunes/grilla.ts';

export type AvisoGen = Omit<Aviso, 'id'>;

/** Número finito acotado (nunca tira). */
export const medida = (v: unknown, def: number, min: number, max: number): number => clamp(num(v, def), min, max);

/** Opción de una lista (o el default). */
export function opcion<T extends string>(v: unknown, lista: readonly T[], def: T): T {
  return (lista as readonly unknown[]).includes(v) ? (v as T) : def;
}

/** Vanos de un largo según el toggle de medida (catálogo o libre). */
export function tramosDe(largo: number, modo: ModoMedida, m: MedidasCatalogo): TramoVano[] {
  return rellenarLargo(largo, 'multi', { modo, medidas: m }).vanos;
}

/** Profundidad: en catálogo la más cercana; en libre la pedida (caño y grampa si no es de catálogo). */
export function profundidadDe(p: number, modo: ModoMedida, m: MedidasCatalogo, lista = m.multi.profundidades): TramoVano {
  if (modo === 'libre') return { medida: r3(p), libre: !lista.some((x) => Math.abs(x - p) < 0.0015) };
  return { medida: masCercano(lista, p), libre: false };
}

/** Anchos (t) de varios vanos: catálogo con todas las medidas de vano (para plataformas anchas). */
export function tramosAncho(ancho: number, modo: ModoMedida, m: MedidasCatalogo): TramoVano[] {
  if (ancho <= Math.max(...m.multi.profundidades) + EPS) return [profundidadDe(ancho, modo, m, [...m.multi.profundidades, ...m.multi.vanos])];
  return tramosDe(ancho, modo, m);
}

/**
 * Diagonales roseta a roseta en un vano: una por banda donde las dos columnas llegan a las dos cotas y
 * hay anillo (no `horizontal:false`), en zigzag continuo (fase alternada entre vanos vecinos).
 */
export function diagonalesEnVano(b: ConstructorEsqueleto, cat: Catalogo, vanoId: string, fase: number, o: { desde?: number; hasta?: number } = {}): number {
  const v = b.esq.vanos.find((x) => x.id === vanoId);
  if (!v) return 0;
  const A = b.col(v.a);
  const B = b.col(v.b);
  const ks = b.esq.cotas;
  let orden = 0;
  let n = 0;
  for (let k = 1; k < ks.length; k++) {
    const lo = ks[k - 1];
    const hi = ks[k];
    if (o.desde !== undefined && lo < o.desde - EPS) continue;
    if (o.hasta !== undefined && hi > o.hasta + EPS) continue;
    if (!(cubre(A, lo) && cubre(B, lo) && cubre(A, hi) && cubre(B, hi))) continue;
    const sinAnillo = b.esq.celdas[celdaId(vanoId, k)]?.horizontal === false || b.esq.celdas[celdaId(vanoId, k - 1)]?.horizontal === false;
    if (sinAnillo || b.esq.celdas[celdaId(vanoId, k)]?.abertura) {
      orden = 0;
      continue;
    }
    if (!bandaConDiagonal(hi - lo)) continue;
    b.celda(vanoId, k, celdaDiagonal(cat, hi - lo, v.medida, sentidoZigzag(orden++, fase)));
    n++;
  }
  return n;
}

/** Diagonales en una fila de vanos (cara): arriostrados los extremos y uno cada CRITERIOS.diagonalCadaVanos ⚠. */
export function diagonalesEnFila(b: ConstructorEsqueleto, cat: Catalogo, fila: string[], faseBase = 0, o: { desde?: number; hasta?: number; todos?: boolean } = {}): number {
  const idx = o.todos ? fila.map((_, i) => i) : vanosArriostrados(fila.length, undefined, (i) => !!b.esq.vanos.find((v) => v.id === fila[i])?.libre);
  let n = 0;
  idx.forEach((i, fase) => {
    n += diagonalesEnVano(b, cat, fila[i], fase + faseBase, o);
  });
  return n;
}

/** Caras perimetrales de una grilla rectangular: frente (j=0), fondo (j=nj), laterales (i=0 / i=último). */
export function carasGrilla(g: GrillaRect): { frente: string[]; fondo: string[]; izq: string[]; der: string[] } {
  const nj = g.T.length - 1;
  return { frente: g.vanosS[0], fondo: g.vanosS[nj], izq: g.vanosT[0], der: g.vanosT[g.S.length - 1] };
}

/** Diagonales en las cuatro caras de una grilla (torres, plataformas, colgantes). */
export function diagonalesPerimetro(b: ConstructorEsqueleto, cat: Catalogo, g: GrillaRect, o: { desde?: number; hasta?: number; caras?: ('frente' | 'fondo' | 'izq' | 'der')[] } = {}): number {
  const c = carasGrilla(g);
  const caras = o.caras || ['frente', 'fondo', 'izq', 'der'];
  let n = 0;
  caras.forEach((nom, i) => {
    n += diagonalesEnFila(b, cat, c[nom], i, o);
  });
  return n;
}

/** Barandas dobles (y rodapié) en el perímetro de una plataforma a la cota k. */
export function barandasPerimetro(b: ConstructorEsqueleto, g: GrillaRect, k: number, o: { frente?: boolean; fondo?: boolean; izq?: boolean; der?: boolean } = {}): void {
  const c = carasGrilla(g);
  const en = { frente: true, fondo: true, izq: true, der: true, ...o };
  for (const nom of ['frente', 'fondo', 'izq', 'der'] as const) if (en[nom]) for (const v of c[nom]) b.celda(v, k, { baranda: 2 });
}

/** Plataforma en todos los paños de una grilla a la cota k. */
export function plataformaGrilla(b: ConstructorEsqueleto, g: GrillaRect, k: number, tipo: 'tablones' | 'fenolico' = 'tablones', fenolico = false): void {
  for (const fila of g.panos) for (const p of fila) b.celdaPano(p, k, { plataforma: tipo, ...(fenolico ? { fenolico: true } : {}) });
}

/** Anclajes al tresbolillo en una línea de columnas (cada `dx` columnas y cada `dn` cotas). */
export function anclarLinea(b: ConstructorEsqueleto, cols: string[], ks: number[], dir: V2 | null, retiro: number, dx: number = CRITERIOS.anclajeDx, dn: number = CRITERIOS.anclajeDn): number {
  let n = 0;
  ks.forEach((k, j) => {
    if (j % dn !== 0 && j !== ks.length - 1) return;
    cols.forEach((c, i) => {
      if ((i + j) % dx !== 0 && i !== 0 && i !== cols.length - 1) return;
      const col = b.col(c);
      if (!cubre(col, b.esq.cotas[k])) return;
      b.nodo(c, k, { anclaje: dir ? { retiro: r3(Math.max(0.15, retiro)), dir } : { retiro: r3(Math.max(0.15, retiro)) } });
      n++;
    });
  });
  return n;
}

/** Índices de cota de las plataformas (las que están en la lista). */
export const ksDe = (b: ConstructorEsqueleto, cotas: number[]): number[] => cotas.map((c) => b.k(c)).filter((k) => k >= 0);

/** Elemento de caño y grampa (caño + 2 grampas) entre a y b, marcado como ajuste. */
export function canoGrampa(id: string, a: V3, b: V3, o: { grupo: string; giratoria?: boolean; canos: number[]; motivo?: 'manual' | 'vano_libre' | 'amarre' }): Elemento[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const largo = canoPara(Math.max(0.1, L - 2 * CRITERIOS.vueloGrampa), o.canos);
  const ajuste = { motivo: o.motivo || 'manual', medidaPedida: r3(L), medidaPieza: largo } as const;
  const fam = o.giratoria ? 'grampa_giratoria' : 'grampa_fija';
  return [
    { id, familia: 'cano', medidas: { largo }, a, b, grupo: o.grupo, sistema: 'comun', ajuste },
    { id: `${id}:g0`, familia: fam, medidas: {}, a, b: a, grupo: o.grupo, sistema: 'comun', ajuste },
    { id: `${id}:g1`, familia: fam, medidas: {}, a: b, b, grupo: o.grupo, sistema: 'comun', ajuste },
  ];
}

/** Largo de catálogo ≥ pedido (o el pedido, «sin código», con excede = true). */
export function largoCatalogo(pedido: number, lista: number[]): { largo: number; excede: boolean } {
  const l = [...lista].sort((a, b) => a - b).find((x) => x >= pedido - 0.005);
  return l === undefined ? { largo: r3(pedido), excede: true } : { largo: l, excede: false };
}

export interface OpcionesViseraPuntos {
  /** posiciones s de los soportes (normalmente las columnas de la cara exterior) */
  puntos: number[];
  /** cota de la bandeja */
  y: number;
  /** t de arranque de la bandeja (cara exterior del andamio o la fachada) */
  t0: number;
  /** vuelo de la bandeja (hacia +t) */
  ancho: number;
  visera: { tipo: '90' | '45' | 'ninguna'; alto: number };
  cerramiento: 'lona' | 'chapa' | 'fenolico';
  /** 'mensula' (hasta la mayor de catálogo), 'viga' (viga de celosía en voladizo) o 'cano' (caño y grampa) */
  soporte: 'mensula' | 'viga' | 'cano';
  /** t del extremo trasero del soporte (viga anclada a la estructura o a la fachada) */
  tRaiz?: number;
  /** t de las verticales donde se toma la viga (2 grampas por vertical: cordón superior e inferior) */
  tVerticales?: number[];
  /** puntal (tornapunta) de caño y grampa desde esta cota hasta la punta */
  tornapunta?: { yPie: number; tPie: number } | null;
  /** fenólico del piso de la bandeja (sobre correas de caño) */
  piso?: boolean;
  prefijo: string;
  medidas: MedidasCatalogo;
}

/**
 * Bandeja de protección volada con visera (pedido 2, fotos 2, 3, 6, 10 y 11): soportes en los puntos dados
 * (nodo a nodo con las columnas), correas de caño, piso de fenólico, borde de caño y visera a 90° o 45°
 * con montantes, caños longitudinales y cerramiento (lona, chapa o fenólico). Devuelve elementos LOCALES.
 */
export function viseraEnPuntos(o: OpcionesViseraPuntos): { elementos: Elemento[]; avisos: string[] } {
  const m = o.medidas;
  const els: Elemento[] = [];
  const avisos: string[] = [];
  const pf = o.prefijo;
  const pts = [...o.puntos].sort((a, b) => a - b);
  const s0 = pts[0];
  const s1 = pts[pts.length - 1];
  const y = r3(o.y);
  const tPunta = r3(o.t0 + o.ancho);
  const tRaiz = r3(o.tRaiz ?? o.t0);
  const largoSoporte = r3(tPunta - tRaiz);
  const conSoporte = o.ancho > 0.05;
  let sop: { largo: number; excede: boolean } = { largo: 0, excede: false };
  if (!conSoporte) {
    // sin vuelo: la visera arranca directo de la cara
  } else if (o.soporte === 'cano') {
    sop = { largo: largoSoporte, excede: false };
  } else if (o.soporte === 'mensula') {
    sop = largoCatalogo(o.ancho, m.multi.mensulas);
    if (sop.excede) avisos.push(`No hay ménsula de ${fmt(o.ancho)}: pasá a viga en voladizo.`);
  } else {
    sop = largoCatalogo(largoSoporte, m.multi.vigasCelosia);
    if (sop.excede) avisos.push(`No hay viga de celosía de ${fmt(largoSoporte)} en el catálogo: queda sin código.`);
  }
  for (const [i, s] of pts.entries()) {
    const raiz: V3 = [s, y, o.soporte === 'mensula' ? o.t0 : tRaiz];
    const punta: V3 = [s, y, tPunta];
    if (!conSoporte) {
      // nada
    } else if (o.soporte === 'cano') {
      els.push(...canoGrampa(`${pf}:sop${i}`, raiz, punta, { grupo: 'bandeja', canos: m.canos }));
    } else if (o.soporte === 'mensula') {
      const drop = Math.min(0.5, o.ancho * 0.7);
      els.push({ id: `${pf}:men${i}`, familia: 'mensula', medidas: { largo: sop.largo }, a: raiz, b: punta, grupo: 'bandeja', primitivas: [{ a: raiz, b: punta }, { a: [s, r3(y - drop), o.t0], b: punta }] });
    } else {
      // la viga se dibuja con su largo real de catálogo: la raíz queda a sop.largo de la punta
      const r0: V3 = [s, y, r3(tPunta - sop.largo)];
      els.push({ id: `${pf}:viga${i}`, familia: 'viga_celosia', medidas: { largo: sop.largo }, a: r0, b: punta, grupo: 'bandeja', primitivas: [{ a: r0, b: punta }, { a: [s, r3(y - 0.5), r0[2]], b: [s, r3(y - 0.5), r3(tPunta - 0.3)] }, { a: [s, r3(y - 0.5), r3(tPunta - 0.3)], b: punta }] });
      // grampas de la viga a cada vertical que la toma, en los dos cordones
      const tvs = [...new Set((o.tVerticales ?? [tRaiz, o.t0]).map(r3))].filter((t) => t >= r0[2] - EPS && t <= tPunta + EPS);
      tvs.forEach((t, j) => {
        for (const [h, dy] of [['s', 0], ['i', -0.5]] as const) {
          const q: V3 = [s, r3(y + dy), t];
          els.push({ id: `${pf}:viga${i}:g${j}${h}`, familia: 'grampa_fija', medidas: {}, a: q, b: q, grupo: 'bandeja', sistema: 'comun' });
        }
      });
    }
    if (o.tornapunta && conSoporte) els.push(...canoGrampa(`${pf}:tp${i}`, [s, r3(o.tornapunta.yPie), r3(o.tornapunta.tPie)], [s, y, r3(Math.min(tPunta, o.tornapunta.tPie + (y - o.tornapunta.yPie)))], { grupo: 'bandeja', giratoria: true, canos: m.canos }));
    if (o.visera.tipo !== 'ninguna') {
      const arriba: V3 = o.visera.tipo === '90' ? [s, r3(y + o.visera.alto), tPunta] : [s, r3(y + o.visera.alto), r3(tPunta + o.visera.alto)];
      els.push(...canoGrampa(`${pf}:mont${i}`, punta, arriba, { grupo: 'visera', giratoria: o.visera.tipo === '45', canos: m.canos }));
    }
  }
  const largo = r3(s1 - s0);
  // correas, borde y piso por tramo entre soportes
  const nCorreas = o.piso === false || !conSoporte ? 0 : Math.max(2, Math.ceil(o.ancho / 0.6 - EPS) + 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const luz = r3(b - a);
    for (let j = 0; j < nCorreas; j++) {
      const t = r3(o.t0 + (o.ancho * j) / (nCorreas - 1));
      const lc = canoPara(luz, m.canos);
      const ajuste = { motivo: 'manual', medidaPedida: luz, medidaPieza: lc } as const;
      els.push({ id: `${pf}:cor${i}_${j}`, familia: 'cano', medidas: { largo: lc }, a: [a, r3(y + 0.06), t], b: [b, r3(y + 0.06), t], grupo: 'bandeja', sistema: 'comun', ajuste });
      els.push({ id: `${pf}:cor${i}_${j}:g0`, familia: 'grampa_fija', medidas: {}, a: [a, r3(y + 0.06), t], b: [a, r3(y + 0.06), t], grupo: 'bandeja', sistema: 'comun', ajuste });
      els.push({ id: `${pf}:cor${i}_${j}:g1`, familia: 'grampa_fija', medidas: {}, a: [b, r3(y + 0.06), t], b: [b, r3(y + 0.06), t], grupo: 'bandeja', sistema: 'comun', ajuste });
    }
    if (o.visera.tipo !== 'ninguna') {
      for (const [f, nom] of [[1, 'sup'], [0.5, 'med']] as const) {
        const dy = r3(o.visera.alto * f);
        const dt = o.visera.tipo === '90' ? 0 : dy;
        els.push(...canoGrampa(`${pf}:lon${nom}${i}`, [a, r3(y + dy), r3(tPunta + dt)], [b, r3(y + dy), r3(tPunta + dt)], { grupo: 'visera', canos: m.canos }));
      }
    }
  }
  if (o.piso !== false && conSoporte && largo > 0) {
    els.push({ id: `${pf}:fen`, familia: 'fenolico', medidas: { ancho: r3(o.ancho) }, a: [s0, r3(y + 0.1), o.t0], b: [s1, r3(y + 0.1), tPunta], medida: r3(largo * o.ancho), grupo: 'bandeja', sistema: 'comun' });
  }
  if (o.visera.tipo !== 'ninguna' && largo > 0) {
    const lc = o.visera.tipo === '90' ? o.visera.alto : Math.hypot(o.visera.alto, o.visera.alto);
    const arriba = o.visera.tipo === '90' ? tPunta : r3(tPunta + o.visera.alto);
    const fam = o.cerramiento;
    els.push({ id: `${pf}:cerr`, familia: fam, medidas: {}, a: [s0, y, tPunta], b: [s1, r3(y + o.visera.alto), arriba], medida: r3(largo * lc), grupo: 'visera', sistema: 'comun' });
  }
  // lona sobre el piso de la bandeja (protección contra caída de objetos)
  if (o.piso !== false && conSoporte && o.cerramiento === 'lona' && largo > 0) {
    els.push({ id: `${pf}:lonapiso`, familia: 'lona', medidas: {}, a: [s0, r3(y + 0.12), o.t0], b: [s1, r3(y + 0.12), tPunta], medida: r3(largo * o.ancho), grupo: 'bandeja', sistema: 'comun' });
  }
  return { elementos: els, avisos };
}

/** Diagonal en planta en un paño: de catálogo si hay código; si no, caño y grampa como elemento. */
export function diagonalPlanta(b: ConstructorEsqueleto, cat: Catalogo, g: GrillaRect, i: number, j: number, k: number, prefijo: string): Elemento[] {
  const largo = r3(g.S[i + 1] - g.S[i]);
  const ancho = r3(g.T[j + 1] - g.T[j]);
  if (resolverCodigo(cat, 'diagonal_planta', { largo, ancho }, 'multi')) {
    b.celdaPano(g.panos[i][j], k, { diagonalPlanta: true });
    return [];
  }
  const y = b.esq.cotas[k];
  return canoGrampa(`${prefijo}:dpl${i}_${j}@${k}`, [g.S[i], y, g.T[j]], [g.S[i + 1], y, g.T[j + 1]], { grupo: 'arriostramiento', giratoria: true, canos: cat.medidas.canos });
}

/** Perfil de apoyo a distinto nivel: tramos (desde s, cota del suelo) ordenados. */
export interface TramoPerfil {
  s: number;
  y: number;
}

/** Escalera recta paramétrica → perfil de apoyo (peldaños y descanso). */
export interface DefEscalera {
  /** s donde empieza el primer peldaño */
  inicio: number;
  huella: number;
  contrahuella: number;
  peldanos: number;
  /** descanso intermedio después del peldaño n (0 = sin descanso) */
  descansoTras?: number;
  descansoLargo?: number;
  /** cota del pie de la escalera */
  y0?: number;
}

export function perfilDeEscalera(e: DefEscalera): TramoPerfil[] {
  const out: TramoPerfil[] = [{ s: -1e9, y: e.y0 ?? 0 }];
  let s = e.inicio;
  let y = e.y0 ?? 0;
  for (let i = 1; i <= e.peldanos; i++) {
    y = r3(y + e.contrahuella);
    out.push({ s: r3(s), y });
    s += e.huella;
    if (e.descansoTras && i === e.descansoTras) s += Math.max(0, (e.descansoLargo ?? 1.2) - e.huella);
  }
  return out;
}

/** (s) → cota del suelo según el perfil (escalonado: vale el último tramo con s ≤ punto). */
export function ySueloPerfil(perfil: TramoPerfil[], s: number): number {
  const ord = [...perfil].sort((a, b) => a.s - b.s);
  let y = ord.length ? ord[0].y : 0;
  for (const t of ord) {
    if (s >= t.s - 1e-6) y = t.y;
    else break;
  }
  return y;
}

/** Normaliza un perfil editable (lista de {s, y}). */
export function normalizarPerfil(v: unknown): TramoPerfil[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out = v.filter((x) => x && Number.isFinite(+x.s) && Number.isFinite(+x.y)).map((x) => ({ s: r3(+x.s), y: r3(clamp(+x.y, -50, 200)) }));
  return out.length ? out.sort((a, b) => a.s - b.s) : null;
}

/**
 * Cotas de anillo para columnas que arrancan a distinto nivel: todas en la fase de rosetas de la cota de
 * trabajo `P` (así cada columna tiene roseta en cada anillo). Devuelve el yBase de cada suelo y las cotas.
 */
export function cotasEscalonadas(P: number, suelos: number[], o: { paso?: number; tope?: number } = {}): { fase: number; bases: number[]; cotas: number[] } {
  const paso = CRITERIOS.pasoRoseta;
  const fase = r3(((P % paso) + paso) % paso);
  const bases = suelos.map((ys) => r3(fase + paso * Math.ceil((ys + CRITERIOS.arranqueMin - fase) / paso - 1e-6)));
  const set = new Set<number>(bases.filter((x) => x < P - EPS));
  const ymin = Math.min(...bases);
  for (let c = r3(P); c > ymin + EPS; c = r3(c - (o.paso ?? CRITERIOS.pasoNivel))) set.add(c);
  set.add(r3(P));
  if (o.tope && o.tope > P + EPS) set.add(r3(o.tope));
  return { fase, bases, cotas: [...set].map(r3).sort((a, b) => a - b) };
}

/** Diagonal de caño y grampa entre dos puntos (para arriostrar donde no hay roseta). */
export function diagonalCano(id: string, a: V3, b: V3, canos: number[], grupo = 'arriostramiento'): Elemento[] {
  const luz = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const h = Math.abs(b[1] - a[1]);
  const largo = canoDiagonal(luz, h, canos);
  const ajuste = { motivo: 'manual', medidaPedida: r3(Math.hypot(luz, h)), medidaPieza: largo } as const;
  return [
    { id, familia: 'cano', medidas: { largo }, a, b, grupo, sistema: 'comun', ajuste },
    { id: `${id}:g0`, familia: 'grampa_giratoria', medidas: {}, a, b: a, grupo, sistema: 'comun', ajuste },
    { id: `${id}:g1`, familia: 'grampa_giratoria', medidas: {}, a: b, b, grupo, sistema: 'comun', ajuste },
  ];
}

/** Huella rectangular local. */
export const huellaRect = (s0: number, t0: number, s1: number, t1: number): Poligono => [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];

/** Elemento suelto (un accesorio) en un punto. */
export const accesorio = (id: string, familia: Elemento['familia'], p: V3, grupo: string, medidas: Medidas = {}): Elemento => ({ id, familia, medidas, a: p, b: p, grupo, sistema: 'comun' });

/** Métricas de una caja (m² de una cara larga por la altura, ml del largo). */
export const metricasCaja = (L: number, B: number, H: number, huella?: Poligono) => ({ m2: r3(L * H), ml: r3(L), alturaReal: r3(H), huella: huella || huellaRect(0, 0, L, B) });

/** Esqueleto vacío seguro (no debería pasar, pero las tipologías nunca tiran). */
export function sinColumnas(esq: Esqueleto): boolean {
  return !esq.columnas.length;
}

/**
 * Las grillas sobre polígonos redondean las columnas al milímetro y en lados inclinados un vano de 0,73
 * puede quedar en 0,729: lo llevamos a la medida de catálogo (dentro de la tolerancia de validarEsqueleto)
 * para que resuelva su código. MUTA el esqueleto.
 */
export function ajustarMedidasCatalogo(esq: Esqueleto, m: MedidasCatalogo): number {
  const lista = [...m.multi.vanos, ...m.multi.profundidades];
  let n = 0;
  for (const v of esq.vanos) {
    const c = lista.find((x) => Math.abs(x - v.medida) <= 0.0025 && Math.abs(x - v.medida) > 1e-9);
    if (c !== undefined) {
      v.medida = c;
      v.libre = false;
      n++;
    }
  }
  return n;
}

/**
 * Las grillas sobre polígonos en medida libre cierran cada lado con hasta 5 mm de tolerancia y pueden dejar
 * dos verticales casi en el mismo punto en una esquina. Las fusiona (se queda con la primera), reapunta
 * vanos, paños, celdas y nodos y descarta los vanos que quedan repetidos o de largo cero. MUTA el esqueleto.
 */
export function fusionarColumnasCercanas(esq: Esqueleto, tol = 0.02): number {
  const reemplazo = new Map<string, string>();
  const cols = esq.columnas;
  for (let i = 0; i < cols.length; i++) {
    if (reemplazo.has(cols[i].id)) continue;
    for (let j = i + 1; j < cols.length; j++) {
      if (reemplazo.has(cols[j].id)) continue;
      if (Math.hypot(cols[i].p[0] - cols[j].p[0], cols[i].p[1] - cols[j].p[1]) <= tol) {
        reemplazo.set(cols[j].id, cols[i].id);
        cols[i].yBase = Math.min(cols[i].yBase, cols[j].yBase);
        cols[i].yTope = Math.max(cols[i].yTope, cols[j].yTope);
      }
    }
  }
  if (!reemplazo.size) return 0;
  const R = (id: string) => reemplazo.get(id) ?? id;
  esq.columnas = cols.filter((c) => !reemplazo.has(c.id));
  const porId = new Map(esq.columnas.map((c) => [c.id, c]));
  const vanoReemplazo = new Map<string, string | null>();
  const porPar = new Map<string, string>();
  const vanos: typeof esq.vanos = [];
  for (const v of esq.vanos) {
    const a = R(v.a);
    const b = R(v.b);
    if (a === b) {
      vanoReemplazo.set(v.id, null);
      continue;
    }
    const par = a < b ? `${a}|${b}` : `${b}|${a}`;
    const ya = porPar.get(par);
    if (ya) {
      vanoReemplazo.set(v.id, ya);
      continue;
    }
    porPar.set(par, v.id);
    const A = porId.get(a)!.p;
    const B = porId.get(b)!.p;
    vanos.push({ ...v, a, b, medida: r3(Math.hypot(B[0] - A[0], B[1] - A[1])) });
  }
  esq.vanos = vanos;
  const RV = (id: string) => (vanoReemplazo.has(id) ? vanoReemplazo.get(id)! : id);
  esq.panos = esq.panos
    .map((p) => ({ ...p, vanos: p.vanos.map(RV).filter((x): x is string => !!x), ...(p.sentido ? { sentido: RV(p.sentido) ?? undefined } : {}) }))
    .filter((p) => p.vanos.length >= 3);
  if (esq.panos.some((p) => p.sentido === undefined)) for (const p of esq.panos) if (p.sentido === undefined) delete p.sentido;
  const panosOk = new Set(esq.panos.map((p) => p.id));
  const celdas: typeof esq.celdas = {};
  for (const [k, v] of Object.entries(esq.celdas)) {
    const i = k.lastIndexOf('@');
    const id = RV(k.slice(0, i));
    if (!id) continue;
    const kk = `${id}${k.slice(i)}`;
    celdas[kk] = { ...v, ...(celdas[kk] || {}) };
  }
  esq.celdas = celdas;
  for (const k of Object.keys(esq.celdasPano)) if (!panosOk.has(k.slice(0, k.lastIndexOf('@')))) delete esq.celdasPano[k];
  const nodos: typeof esq.nodos = {};
  for (const [k, v] of Object.entries(esq.nodos)) {
    const i = k.lastIndexOf('@');
    const kk = `${R(k.slice(0, i))}${k.slice(i)}`;
    nodos[kk] = { ...v, ...(nodos[kk] || {}) };
  }
  esq.nodos = nodos;
  return reemplazo.size;
}

/**
 * Rodapié en vanos libres muy cortos (< 0,25): no hay rodapié de catálogo que entre, se corta de fenólico
 * (m², con código de placa). MUTA el esqueleto.
 */
export function rodapiesCortos(esq: Esqueleto, maxLargo = 0.25): number {
  const col = new Map(esq.columnas.map((c) => [c.id, c]));
  let n = 0;
  for (const v of esq.vanos) {
    if (v.medida >= maxLargo) continue;
    for (let k = 0; k < esq.cotas.length; k++) {
      const key = celdaId(v.id, k);
      const ce = esq.celdas[key];
      if (!ce || !(ce.baranda || 0) || ce.rodapie === false) continue;
      const A = col.get(v.a)!;
      const B = col.get(v.b)!;
      const y = r3(esq.cotas[k] + 0.08);
      esq.celdas[key] = { ...ce, rodapie: false };
      esq.elementos.push({ id: `rodfen:${key}`, familia: 'fenolico', medidas: {}, a: [A.p[0], y, A.p[1]], b: [B.p[0], r3(y + 0.15), B.p[1]], medida: r3(v.medida * 0.15), grupo: 'rodapie', sistema: 'comun' });
      n++;
    }
  }
  return n;
}

/**
 * Cierre exacto de las esquinas de una grilla sobre polígono: si la última vertical de contacto de un lado
 * quedó a menos de `tol` de la primera del lado siguiente (tolerancia del relleno libre), corre el par
 * contacto/exterior de esa punta para que coincidan; después `fusionarColumnasCercanas` las une. Así el
 * transversal sigue midiendo la profundidad exacta y el ajuste lo absorbe el último vano libre. MUTA.
 */
export function cerrarEsquinasPoligono(esq: Esqueleto, lados: { contacto: string[]; exterior: string[] }[], catalogo: number[] = [], tol = 0.02): number {
  const col = new Map(esq.columnas.map((c) => [c.id, c]));
  let n = 0;
  const ok = lados.filter((L) => L.contacto.length);
  for (let i = 0; i < lados.length; i++) {
    const L = lados[i];
    if (!L.contacto.length) continue;
    const sig = lados[(i + 1) % lados.length];
    if (!sig?.contacto.length || ok.length < 2) continue;
    const c = col.get(L.contacto[L.contacto.length - 1]);
    const e = col.get(L.exterior[L.exterior.length - 1]);
    const d = col.get(sig.contacto[0]);
    if (!c || !e || !d || c === d) continue;
    const dx = d.p[0] - c.p[0];
    const dz = d.p[1] - c.p[1];
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-9 || dist > tol) continue;
    c.p = [r3(c.p[0] + dx), r3(c.p[1] + dz)];
    e.p = [r3(e.p[0] + dx), r3(e.p[1] + dz)];
    n++;
  }
  if (n) for (const v of esq.vanos) {
    const A = col.get(v.a)!.p;
    const B = col.get(v.b)!.p;
    const nueva = r3(Math.hypot(B[0] - A[0], B[1] - A[1]));
    if (Math.abs(nueva - v.medida) > 0.0005) {
      v.medida = nueva;
      // el vano que absorbió el ajuste deja de ser de catálogo: va con caño y grampa
      if (!(catalogo || []).some((x) => Math.abs(x - nueva) < 0.0015)) v.libre = true;
    }
  }
  return n;
}

/**
 * Incorpora un esqueleto armado en otro marco (p. ej. una tira lateral armada con grillaRect a lo largo de s)
 * al constructor principal, transformando las posiciones. Las columnas que caen en el mismo punto se
 * comparten y los vanos repetidos se unifican (como en una esquina). Devuelve el mapa de ids.
 */
export function incorporar(b: ConstructorEsqueleto, otro: Esqueleto, T: (p: V2) => V2, rotar: (n: V2) => V2): { col: Map<string, string>; vano: Map<string, string>; pano: Map<string, string> } {
  const mc = new Map<string, string>();
  const mv = new Map<string, string>();
  const mp = new Map<string, string>();
  b.setCotas([...b.esq.cotas, ...otro.cotas]);
  const kDe = (k: number) => b.k(otro.cotas[k]);
  for (const c of otro.columnas) mc.set(c.id, b.columna(c.id, T(c.p), c.yBase, c.yTope, c.apoyo, c.ySuelo !== undefined ? { ySuelo: c.ySuelo } : {}));
  for (const v of otro.vanos) mv.set(v.id, b.vano(v.id, mc.get(v.a)!, mc.get(v.b)!, v.cara, { libre: v.libre, ...(v.normal ? { normal: rotar(v.normal) } : {}) }));
  for (const p of otro.panos) mp.set(p.id, b.pano(p.id, p.vanos.map((x) => mv.get(x)!), { libre: p.libre, ...(p.sentido ? { sentido: mv.get(p.sentido) } : {}) }));
  for (const [k, v] of Object.entries(otro.celdas)) {
    const i = k.lastIndexOf('@');
    b.celda(mv.get(k.slice(0, i))!, kDe(Number(k.slice(i + 1))), v);
  }
  for (const [k, v] of Object.entries(otro.celdasPano)) {
    const i = k.lastIndexOf('@');
    b.celdaPano(mp.get(k.slice(0, i))!, kDe(Number(k.slice(i + 1))), v);
  }
  for (const [k, v] of Object.entries(otro.nodos)) {
    const i = k.lastIndexOf('@');
    const nx = { ...v };
    if (nx.anclaje && typeof nx.anclaje === 'object' && nx.anclaje.dir) nx.anclaje = { ...nx.anclaje, dir: rotar(nx.anclaje.dir) };
    b.nodo(mc.get(k.slice(0, i))!, kDe(Number(k.slice(i + 1))), nx);
  }
  const T3 = (q: V3): V3 => {
    const p = T([q[0], q[2]]);
    return [p[0], q[1], p[1]];
  };
  for (const e of otro.elementos) b.elemento({ ...e, a: T3(e.a), b: T3(e.b), ...(e.primitivas ? { primitivas: e.primitivas.map((x) => ({ a: T3(x.a), b: T3(x.b) })) } : {}) });
  return { col: mc, vano: mv, pano: mp };
}
