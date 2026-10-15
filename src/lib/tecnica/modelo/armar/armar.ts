/**
 * armar(esqueleto) → piezas. Un único lugar convierte el grafo estructural en piezas de catálogo:
 * columnas (bases, collarín, pila de verticales), anillos, barandas, rodapiés, diagonales roseta a roseta,
 * cerramientos, plataformas, ménsulas, anclajes, estabilizadores y elementos especiales.
 * Lo que no es de catálogo (vano libre o cota fuera de roseta) sale en caño y grampa, marcado como ajuste.
 */
import type { Aviso, Columna, Esqueleto, Familia, Medidas, Pieza, Sistema, SistemaPieza, V2, V3, Vano, Accion } from '../tipos.ts';
import { type Catalogo, infoDe, resolverCodigo } from '../catalogo/catalogo.ts';
import { CRITERIOS } from '../criterios.ts';
import { canoDiagonal, canoPara, tablonParaLibre } from '../medida/ajustes.ts';
import { pilaVerticales } from '../medida/alturas.ts';
import { celdaId, columnasPano, cubre, enRoseta, indexar, type IndiceEsqueleto, normalVano, panoCeldaId, nodoId } from '../esqueleto/esqueleto.ts';
import { EPS, enLista, fmt, type Marco, mm, r3, dist2 } from '../util.ts';
import { armarBastidor } from './bastidor.ts';

export interface CtxArmar {
  catalogo: Catalogo;
  estructuraId: string;
  marco: Marco;
  /** false en la estructura libre: las reparaciones son operaciones de esqueleto. */
  regenerable: boolean;
  escalonarEmpalmes?: boolean;
}

export interface Armado {
  piezas: Pieza[];
  avisos: Omit<Aviso, 'id'>[];
}

type Extra = {
  celda?: string;
  nodo?: string;
  elemento?: string;
  kit?: { codigo: string; grupo: string };
  medida?: number;
  ajuste?: Pieza['ajuste'];
  primitivas?: { a: V3; b: V3 }[];
  sistema?: SistemaPieza;
};

/** Emisor de piezas: resuelve código y peso desde el catálogo y pasa de local a mundo. */
export class Emisor {
  piezas: Pieza[] = [];
  avisos: Omit<Aviso, 'id'>[] = [];
  private ids = new Set<string>();
  cat: Catalogo;
  estId: string;
  sistema: Sistema;
  W: Marco['W'];
  canos: number[];

  constructor(cat: Catalogo, estId: string, sistema: Sistema, m: Marco) {
    this.cat = cat;
    this.estId = estId;
    this.sistema = sistema;
    this.W = m.W;
    this.canos = cat.medidas.canos;
  }

  codigo(familia: Familia, medidas: Medidas, sistema?: SistemaPieza): string | null {
    return resolverCodigo(this.cat, familia, medidas, sistema || this.sistema);
  }

  /** a y b en LOCAL (s, y, t). */
  add(local: string, familia: Familia, medidas: Medidas, a: V3, b: V3, x: Extra = {}, codigoFijo?: string | null): Pieza {
    let id = `${this.estId}:${local}`;
    if (this.ids.has(id)) {
      let k = 2;
      while (this.ids.has(`${id}~${k}`)) k++;
      id = `${id}~${k}`;
    }
    this.ids.add(id);
    const codigo = codigoFijo !== undefined ? codigoFijo : this.codigo(familia, medidas, x.sistema);
    const it = infoDe(this.cat, codigo);
    const med: Medidas = {};
    if (medidas.largo !== undefined) med.largo = r3(medidas.largo);
    if (medidas.alto !== undefined) med.alto = r3(medidas.alto);
    if (medidas.ancho !== undefined) med.ancho = r3(medidas.ancho);
    if (medidas.variante !== undefined) med.variante = medidas.variante;
    const p: Pieza = {
      id, familia, medidas: med, codigo, peso_kg: it ? it.peso_kg : null,
      a: this.W(a[0], a[1], a[2]), b: this.W(b[0], b[1], b[2]), estructuraId: this.estId, owner: this.estId,
    };
    if (x.celda) p.celda = x.celda;
    if (x.nodo) p.nodo = x.nodo;
    if (x.elemento) p.elemento = x.elemento;
    if (x.kit) p.kit = x.kit;
    if (x.medida !== undefined) p.medida = r3(x.medida);
    if (x.ajuste) p.ajuste = x.ajuste;
    if (x.primitivas) p.primitivas = x.primitivas.map((q) => ({ a: this.W(q.a[0], q.a[1], q.a[2]), b: this.W(q.b[0], q.b[1], q.b[2]) }));
    this.piezas.push(p);
    return p;
  }

  /**
   * Tubo horizontal de largo `largo` entre a y b: pieza de catálogo de `familia` o, si se fuerza o no hay
   * código y `canoSiNoHay`, caño + 2 grampas fijas (ajuste).
   */
  tubo(local: string, familia: Familia, largo: number, a: V3, b: V3, o: { forzarCano?: boolean; canoSiNoHay?: boolean; motivo?: NonNullable<Pieza['ajuste']>['motivo']; celda?: string; sistema?: SistemaPieza }): void {
    const cod = o.forzarCano ? null : this.codigo(familia, { largo }, o.sistema);
    if (cod || (!o.forzarCano && !o.canoSiNoHay)) {
      this.add(local, familia, { largo }, a, b, { celda: o.celda, sistema: o.sistema }, cod);
      return;
    }
    const l = canoPara(largo, this.canos);
    const aj = { motivo: o.motivo || 'vano_libre', medidaPedida: r3(largo), medidaPieza: l } as const;
    this.add(local, 'cano', { largo: l }, a, b, { celda: o.celda, ajuste: aj, sistema: 'comun' });
    const g = (p: V3, q: V3): V3 => {
      const L = Math.hypot(q[0] - p[0], q[2] - p[2]) || 1;
      const d = Math.min(0.05, L / 4);
      return [r3(p[0] + ((q[0] - p[0]) * d) / L), p[1], r3(p[2] + ((q[2] - p[2]) * d) / L)];
    };
    this.add(`${local}:g0`, 'grampa_fija', {}, g(a, b), g(a, b), { celda: o.celda, ajuste: aj, sistema: 'comun' });
    this.add(`${local}:g1`, 'grampa_fija', {}, g(b, a), g(b, a), { celda: o.celda, ajuste: aj, sistema: 'comun' });
  }
}

export const nTablones = (ancho: number): number => Math.max(1, Math.round(ancho / CRITERIOS.anchoTablon));
const P3 = (p: V2, y: number): V3 => [p[0], r3(y), p[1]];
const mas = (p: V2, n: V2, d: number): V2 => [r3(p[0] + n[0] * d), r3(p[1] + n[1] * d)];

/** Clave de nodo en planta de mundo (para fusionar columnas compartidas entre estructuras). */
export function nodoMundo(m: Marco, p: V2): string {
  const q = m.P(p);
  return `${mm(q[0])}|${mm(q[1])}`;
}

export function armar(esq: Esqueleto, ctx: CtxArmar): Armado {
  const em = new Emisor(ctx.catalogo, ctx.estructuraId, esq.sistema, ctx.marco);
  const ix = indexar(esq);
  if (esq.sistema === 'bastidor') armarBastidor(esq, ix, em, ctx);
  else armarMulti(esq, ix, em, ctx);
  armarPanos(esq, ix, em);
  armarNodos(esq, ix, em);
  armarElementos(esq, em);
  return { piezas: em.piezas, avisos: em.avisos };
}

// ───────────── columnas ─────────────
export function armarBase(c: Columna, em: Emisor, esq: Esqueleto, nodo: string, collarin: boolean): void {
  const y0 = c.ySuelo ?? 0;
  const tag = `c:${c.id}`;
  if (c.apoyo === 'base_regulable' || c.apoyo === 'base_fija') {
    const fam: Familia = c.apoyo;
    em.add(`${tag}:base`, fam, c.movil ? { variante: 'movil' } : {}, P3(c.p, y0), P3(c.p, c.yBase), { nodo, sistema: 'comun' });
    if (c.apoyo === 'base_regulable' && c.yBase - y0 > CRITERIOS.tornillonMax + EPS) {
      em.avisos.push({ regla: 'apoyo.tornillon', nivel: 'aviso', texto: `La columna ${c.id} arranca a ${fmt(c.yBase - y0)} m del apoyo: el tornillón no llega (máx. ${fmt(CRITERIOS.tornillonMax)} ⚠). Sumá un suplemento.`, estructuraId: em.estId, reparaciones: [] });
    }
  } else if (c.apoyo === 'rueda' || c.apoyo === 'rueda_freno') {
    em.add(`${tag}:rueda`, c.apoyo, {}, P3(c.p, y0), P3(c.p, c.yBase), { nodo, sistema: 'comun' });
  } else return;
  if (collarin) em.add(`${tag}:coll`, 'collarin', {}, P3(c.p, c.yBase), P3(c.p, c.yBase + 0.33), { nodo });
  // tierra o losa: tablón de reparto (madera) bajo cada base
  if (esq.terreno === 'tierra' || esq.terreno === 'losa') em.add(`${tag}:mad`, 'accesorio', { variante: 'madera_base' }, P3(c.p, y0 - 0.1), P3(c.p, y0), { nodo, sistema: 'comun' });
}

function armarMulti(esq: Esqueleto, ix: IndiceEsqueleto, em: Emisor, ctx: CtxArmar): void {
  esq.columnas.forEach((c, i) => {
    const nodo = nodoMundo(ctx.marco, c.p);
    armarBase(c, em, esq, nodo, true);
    let y = c.yBase;
    pilaVerticales(c.yTope - c.yBase, i, !!ctx.escalonarEmpalmes).forEach((l, k) => {
      em.add(`c:${c.id}:v${k}`, 'vertical', { largo: l, variante: 'CE' }, P3(c.p, y), P3(c.p, y + l), { nodo });
      y = r3(y + l);
    });
  });
  const postes = new Set<string>();
  const sinCodigoDiag = new Map<string, { h: number; v: number; celdas: string[] }>();
  const sinNodo: string[] = [];
  const K = esq.cotas.length;
  for (const v of esq.vanos) {
    const A = ix.col.get(v.a);
    const B = ix.col.get(v.b);
    if (!A || !B) continue;
    for (let k = 0; k < K; k++) {
      const key = celdaId(v.id, k);
      const ce = esq.celdas[key] || {};
      const c = esq.cotas[k];
      const ok = cubre(A, c) && cubre(B, c);
      const forzar = v.libre || !!ce.cano;
      const fueraRoseta = ok && (!enRoseta(A, c) || !enRoseta(B, c));
      if (ok && ce.horizontal !== false && !ce.abertura) {
        em.tubo(`h:${key}`, 'horizontal', v.medida, P3(A.p, c), P3(B.p, c), { forzarCano: forzar || fueraRoseta, canoSiNoHay: false, motivo: fueraRoseta && !forzar ? 'altura_libre' : 'vano_libre', celda: key });
      }
      if (ok) barandaCelda(v, A, B, c, key, ce.baranda || 0, ce.rodapie, forzar, em, postes);
      if (k >= 1 && ce.diagonal && !ce.abertura) {
        const lo = esq.cotas[k - 1];
        if (!(cubre(A, lo) && cubre(B, lo) && ok)) {
          sinNodo.push(key);
        } else {
          const [p0, p1] = ce.diagonal === 'sube' ? [A.p, B.p] : [B.p, A.p];
          const h = r3(c - lo);
          const fr = !enRoseta(A, lo) || !enRoseta(B, lo) || fueraRoseta;
          if (forzar || fr || ce.diagonalCano) {
            const l = canoDiagonal(v.medida, h, em.canos);
            const aj = { motivo: fr && !forzar ? 'altura_libre' : ce.diagonalCano && !forzar ? 'manual' : 'vano_libre', medidaPedida: r3(Math.hypot(v.medida, h)), medidaPieza: l } as const;
            em.add(`d:${key}`, 'cano', { largo: l }, P3(p0, lo), P3(p1, c), { celda: key, ajuste: aj, sistema: 'comun' });
            em.add(`d:${key}:g0`, 'grampa_giratoria', {}, P3(p0, lo), P3(p0, lo), { celda: key, ajuste: aj, sistema: 'comun' });
            em.add(`d:${key}:g1`, 'grampa_giratoria', {}, P3(p1, c), P3(p1, c), { celda: key, ajuste: aj, sistema: 'comun' });
          } else {
            const pz = em.add(`d:${key}`, 'diagonal', { alto: h, largo: v.medida }, P3(p0, lo), P3(p1, c), { celda: key });
            if (!pz.codigo) {
              const g = `${mm(h)}x${mm(v.medida)}`;
              const e = sinCodigoDiag.get(g) || { h, v: v.medida, celdas: [] };
              e.celdas.push(key);
              sinCodigoDiag.set(g, e);
            }
          }
        }
      }
      if (k >= 1 && ce.cerramiento && ok) cerramiento(esq, ix, v, A, B, k, key, ce.cerramiento, em);
    }
  }
  for (const e of sinCodigoDiag.values()) {
    const accion: Accion = ctx.regenerable
      ? { tipo: 'overrides', estructuraId: em.estId, celdas: e.celdas, valor: { diagonalCano: true } }
      : { tipo: 'lote', acciones: e.celdas.map((clave) => ({ tipo: 'esqueleto', estructuraId: em.estId, op: { op: 'celda', clave, valor: { diagonalCano: true } } }) as Accion) };
    em.avisos.push({
      regla: 'diag.sin_codigo', nivel: 'aviso', estructuraId: em.estId, celda: e.celdas[0],
      texto: `Diagonal de ${fmt(e.h)} × ${fmt(e.v)} sin código (${e.celdas.length}): ¿usás caño y grampa?`,
      reparaciones: [{ etiqueta: 'Pasar a caño y grampa', accion }],
    });
  }
  if (sinNodo.length) em.avisos.push({ regla: 'diag.sin_nodo', nivel: 'aviso', estructuraId: em.estId, celda: sinNodo[0], texto: `${sinNodo.length} diagonal${sinNodo.length > 1 ? 'es no llegan' : ' no llega'} a una roseta: no se dibuja${sinNodo.length > 1 ? 'n' : ''}.`, reparaciones: [] });
}

/** Barandas (0,50 / 1,00) y rodapié sobre la cota c de un vano. Postes si la columna no llega. */
export function barandaCelda(v: Vano, A: Columna, B: Columna, c: number, key: string, baranda: number, rodapie: boolean | undefined, forzar: boolean, em: Emisor, postes: Set<string>, familia: Familia = 'baranda'): void {
  const alturas = baranda >= 2 ? [0.5, 1.0] : baranda === 1 ? [0.5] : [];
  alturas.forEach((dy, j) => em.tubo(`b:${key}:${j}`, familia, v.medida, P3(A.p, c + dy), P3(B.p, c + dy), { forzarCano: forzar, canoSiNoHay: true, celda: key }));
  if (alturas.length) {
    const hMax = alturas[alturas.length - 1];
    for (const X of [A, B]) {
      if (X.yTope >= c + hMax - EPS) continue;
      const pk = `${X.id}@${mm(c)}`;
      if (postes.has(pk)) continue;
      postes.add(pk);
      em.add(`poste:${pk}`, 'vertical', { largo: 1.0, variante: 'SE' }, P3(X.p, c), P3(X.p, c + 1), { celda: key });
    }
  }
  if (rodapie ?? alturas.length > 0) rodapieEn(`r:${key}`, v.medida, P3(A.p, c + 0.08), P3(B.p, c + 0.08), key, forzar, em);
}

export function rodapieEn(local: string, largo: number, a: V3, b: V3, celda: string | undefined, libre: boolean, em: Emisor): void {
  const cod = libre ? null : em.codigo('rodapie', { largo });
  if (!cod) {
    // vano libre o largo sin código: el rodapié de catálogo siguiente si el solape entra
    const lista = em.cat.mapa.filter((e) => e.familia === 'rodapie' && e.largo !== null && (e.sistema === em.sistema || e.sistema === 'comun')).map((e) => e.largo as number);
    const t = tablonParaLibre(largo, lista);
    if (t) {
      em.add(local, 'rodapie', { largo: t.largo }, a, b, { celda, ajuste: { motivo: 'vano_libre', medidaPedida: r3(largo), medidaPieza: t.largo } });
      return;
    }
  }
  em.add(local, 'rodapie', { largo }, a, b, { celda }, cod);
}

function cerramiento(esq: Esqueleto, ix: IndiceEsqueleto, v: Vano, A: Columna, B: Columna, k: number, key: string, tipo: NonNullable<import('../tipos.ts').CeldaCara['cerramiento']>, em: Emisor): void {
  const y0 = esq.cotas[k - 1];
  let y1 = esq.cotas[k];
  const arriba = esq.cotas[k + 1];
  if (arriba === undefined || !(cubre(A, arriba) && cubre(B, arriba))) y1 = Math.max(y1, Math.min(A.yTope, B.yTope));
  const n = normalVano(v, ix);
  const off = 0.04;
  const area = r3(v.medida * (y1 - y0));
  const fam: Familia = tipo === 'fenolico' ? 'fenolico' : tipo;
  em.add(`cub:${key}`, fam, {}, P3(mas(A.p, n, off), y0), P3(mas(B.p, n, off), y1), { celda: key, medida: area, sistema: 'comun' });
}

// ───────────── paños: plataformas ─────────────
export interface GeoPano {
  /** vano paralelo a los tablones */
  S: Vano;
  a: V2;
  b: V2;
  /** dirección (unitaria) desde S hacia el lado opuesto */
  nIn: V2;
  largo: number;
  ancho: number;
}

export function geoPano(p: import('../tipos.ts').Pano, ix: IndiceEsqueleto): GeoPano | null {
  const vs = p.vanos.map((id) => ix.vano.get(id)).filter((v): v is Vano => !!v);
  if (vs.length !== 4) return null;
  let S = p.sentido ? vs.find((v) => v.id === p.sentido) : undefined;
  if (!S) {
    const caras = vs.filter((v) => v.cara === 'exterior' || v.cara === 'interior');
    const pool = caras.length ? caras : vs;
    S = [...pool].sort((x, y) => y.medida - x.medida)[0];
    // si hay una cara exterior/interior y otra transversal de igual largo, gana la cara
    const ext = caras.find((v) => Math.abs(v.medida - S!.medida) < EPS);
    if (ext) S = ext;
  }
  const a = ix.col.get(S.a)!.p;
  const b = ix.col.get(S.b)!.p;
  const op = vs.find((v) => v.id !== S!.id && v.a !== S!.a && v.a !== S!.b && v.b !== S!.a && v.b !== S!.b);
  if (!op) return null;
  const q = ix.col.get(op.a)!.p;
  const L = dist2(a, b) || 1;
  const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n: V2 = [-u[1], u[0]];
  const d = (q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1];
  if (d < 0) n = [-n[0], -n[1]];
  return { S, a, b, nIn: n, largo: r3(L), ancho: r3(Math.abs(d)) };
}

function armarPanos(esq: Esqueleto, ix: IndiceEsqueleto, em: Emisor): void {
  const multi = em.cat.medidas.multi;
  const bast = em.cat.medidas.bastidor;
  const anchosCat = esq.sistema === 'bastidor' ? bast.anchos : [...multi.profundidades, ...multi.vanos];
  const largosTablon = em.cat.mapa.filter((e) => e.familia === 'tablon' && e.largo !== null).map((e) => e.largo as number);
  const volados: string[] = [];
  for (const p of esq.panos) {
    const g = geoPano(p, ix);
    const cols = columnasPano(p, ix).map((id) => ix.col.get(id)!);
    for (let k = 0; k < esq.cotas.length; k++) {
      const key = panoCeldaId(p.id, k);
      const ce = esq.celdasPano[key];
      if (!ce) continue;
      const c = esq.cotas[k];
      if (!cols.every((x) => cubre(x, c))) continue;
      if (!g) {
        if (ce.plataforma) {
          const pts = cols.map((x) => x.p);
          let area = 0;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
          em.add(`fen:${key}`, 'fenolico', {}, P3(pts[0], c + 0.04), P3(pts[Math.floor(pts.length / 2)], c + 0.04), { celda: key, medida: r3(Math.abs(area / 2)), sistema: 'comun' });
        }
        continue;
      }
      const { a, b, nIn, largo, ancho } = g;
      const libreLargo = g.S.libre || p.libre;
      if (ce.plataforma === 'tablones' || ce.plataforma === 'escotilla') {
        const anchoCat = !p.libre && enLista(anchosCat, ancho);
        let nt = nTablones(ancho);
        let resto = 0;
        if (!anchoCat) {
          nt = Math.max(1, Math.floor((ancho + 0.02) / CRITERIOS.anchoTablon));
          resto = r3(ancho - nt * CRITERIOS.anchoTablon);
        }
        let largoTab = largo;
        let ajuste: Pieza['ajuste'] | undefined;
        let codTab = libreLargo ? null : em.codigo('tablon', { largo });
        if (!codTab) {
          const t = tablonParaLibre(largo, largosTablon);
          if (t) {
            largoTab = t.largo;
            ajuste = { motivo: 'vano_libre', medidaPedida: largo, medidaPieza: t.largo };
            codTab = em.codigo('tablon', { largo: t.largo });
            if (t.solape > 0.005) volados.push(key);
          }
        }
        if (!codTab && libreLargo) {
          em.add(`fen:${key}`, 'fenolico', {}, P3(a, c + 0.04), P3(mas(b, nIn, ancho), c + 0.04), { celda: key, medida: r3(largo * ancho), ajuste: { motivo: 'vano_libre', medidaPedida: largo, medidaPieza: largo }, sistema: 'comun' });
        } else {
          for (let j = 0; j < nt; j++) {
            const off = r3(((j + 0.5) * (ancho - resto)) / nt);
            const esc = ce.plataforma === 'escotilla' && j === 0 ? em.codigo('tablon_escotilla', { largo: largoTab }) : null;
            const fam: Familia = esc ? 'tablon_escotilla' : 'tablon';
            em.add(`t:${key}:${j}`, fam, { largo: largoTab }, P3(mas(a, nIn, off), c), P3(mas(b, nIn, off), c), { celda: key, ajuste }, esc || (fam === 'tablon' ? codTab : undefined));
          }
          if (resto > 0.05) {
            const off = r3(ancho - resto);
            em.add(`rel:${key}`, 'fenolico', {}, P3(mas(a, nIn, off), c + 0.04), P3(mas(b, nIn, ancho), c + 0.04), { celda: key, medida: r3(largo * resto), ajuste: { motivo: 'profundidad_libre', medidaPedida: ancho, medidaPieza: r3(nt * CRITERIOS.anchoTablon) }, sistema: 'comun' });
          }
        }
      }
      if (ce.plataforma === 'fenolico' || ce.fenolico) {
        em.add(`fen:${key}`, 'fenolico', { ancho }, P3(a, c + 0.04), P3(mas(b, nIn, ancho), c + 0.04), { celda: key, medida: r3(largo * ancho), sistema: 'comun' });
      }
      if (ce.diagonalPlanta) em.add(`dpl:${key}`, 'diagonal_planta', { largo, ancho }, P3(a, c), P3(mas(b, nIn, ancho), c), { celda: key });
    }
  }
  if (volados.length) em.avisos.push({ regla: 'plataforma.tablon_volado', nivel: 'aviso', estructuraId: em.estId, celda: volados[0], texto: `${volados.length} plataforma${volados.length > 1 ? 's' : ''} en vano libre con tablón de catálogo más largo (tablón volado ⚠): verificá el apoyo.`, reparaciones: [] });
}

// ───────────── nodos: ménsulas, anclajes, estabilizadores ─────────────
function armarNodos(esq: Esqueleto, ix: IndiceEsqueleto, em: Emisor): void {
  const hechas = new Set<string>();
  const postes = new Set<string>();
  // ménsulas por vano: las dos columnas del vano con ménsula en la misma dirección
  for (const v of esq.vanos) {
    const A = ix.col.get(v.a);
    const B = ix.col.get(v.b);
    if (!A || !B) continue;
    const n = normalVano(v, ix);
    for (let k = 0; k < esq.cotas.length; k++) {
      const mA = esq.nodos[nodoId(A.id, k)]?.mensula;
      const mB = esq.nodos[nodoId(B.id, k)]?.mensula;
      if (!mA || !mB || mA.dir !== mB.dir) continue;
      if ((mA.dir === 'fachada') !== (v.cara === 'interior')) continue;
      const c = esq.cotas[k];
      const brazo = Math.min(mA.brazo, mB.brazo);
      const key = celdaId(v.id, k);
      for (const [X, mX] of [[A, mA], [B, mB]] as const) {
        const hk = `${X.id}@${k}@${mX.dir}@${mm(n[0])},${mm(n[1])}`;
        if (hechas.has(hk)) continue;
        hechas.add(hk);
        const tip = mas(X.p, n, mX.brazo);
        const drop = Math.min(0.5, mX.brazo * 0.7);
        em.add(`men:${hk}`, 'mensula', { largo: mX.brazo }, P3(X.p, c), P3(tip, c), { celda: key, nodo: nodoId(X.id, k), primitivas: [{ a: P3(X.p, c), b: P3(tip, c) }, { a: P3(X.p, c - drop), b: P3(tip, c) }] });
      }
      const nt = nTablones(brazo);
      for (let j = 0; j < nt; j++) {
        const off = r3(((j + 0.5) * brazo) / nt);
        em.add(`tm:${key}:${j}`, 'tablon', { largo: v.medida }, P3(mas(A.p, n, off), c), P3(mas(B.p, n, off), c), { celda: key }, v.libre ? null : undefined);
      }
      if (mA.baranda !== false && mB.baranda !== false) {
        const tA = mas(A.p, n, brazo);
        const tB = mas(B.p, n, brazo);
        [0.5, 1.0].forEach((dy, j) => em.tubo(`bm:${key}:${j}`, 'baranda', v.medida, P3(tA, c + dy), P3(tB, c + dy), { forzarCano: v.libre, canoSiNoHay: true, celda: key }));
        rodapieEn(`rm:${key}`, v.medida, P3(tA, c + 0.08), P3(tB, c + 0.08), key, v.libre, em);
        for (const t of [tA, tB]) {
          const pk = `${mm(t[0])}|${mm(t[1])}@${mm(c)}`;
          if (postes.has(pk)) continue;
          postes.add(pk);
          em.add(`pm:${pk}`, 'vertical', { largo: 1.0, variante: 'SE' }, P3(t, c), P3(t, c + 1), { celda: key });
        }
      }
      {
        // laterales: si en la punta de la tira hay baranda transversal, se extiende hasta la punta de la ménsula
        for (const X of [A, B]) {
          const lat = (ix.vanosDeCol.get(X.id) || []).find((w) => w.id !== v.id && w.cara !== v.cara && (esq.celdas[celdaId(w.id, k)]?.baranda || 0) > 0 && Math.abs(colinealidad(w, v, ix)) < 0.2);
          if (!lat) continue;
          const lk = `${X.id}@${k}@lat`;
          if (hechas.has(lk)) continue;
          hechas.add(lk);
          const t = mas(X.p, n, brazo);
          [0.5, 1.0].forEach((dy, j) => em.tubo(`bml:${lk}:${j}`, 'baranda', brazo, P3(X.p, c + dy), P3(t, c + dy), { canoSiNoHay: true, celda: key }));
          rodapieEn(`rml:${lk}`, brazo, P3(X.p, c + 0.08), P3(t, c + 0.08), key, false, em);
        }
      }
    }
  }
  // anclajes y estabilizadores
  for (const [key, nx] of Object.entries(esq.nodos)) {
    const i = key.lastIndexOf('@');
    const C = ix.col.get(key.slice(0, i));
    const k = Number(key.slice(i + 1));
    if (!C || !(k >= 0 && k < esq.cotas.length)) continue;
    const c = esq.cotas[k];
    if (nx.anclaje && cubre(C, c)) {
      const retiro = typeof nx.anclaje === 'object' ? nx.anclaje.retiro : 0.2;
      const dir = (typeof nx.anclaje === 'object' && nx.anclaje.dir) || dirMuro(C, ix);
      const muro = mas(C.p, dir, Math.max(0.15, retiro));
      em.add(`anc:${key}`, 'anclaje', {}, P3(C.p, c), P3(muro, c), { nodo: key, sistema: 'comun' });
      if (retiro > CRITERIOS.retiroAmarreCorto + EPS) {
        const l = canoPara(retiro, em.canos);
        const aj = { motivo: 'amarre', medidaPedida: r3(retiro), medidaPieza: l } as const;
        const q = P3(C.p, c);
        const w = P3(mas(C.p, dir, retiro), c);
        em.add(`anc:${key}:cano`, 'cano', { largo: l }, q, w, { nodo: key, ajuste: aj, sistema: 'comun' });
        em.add(`anc:${key}:g0`, 'grampa_fija', {}, q, q, { nodo: key, ajuste: aj, sistema: 'comun' });
        em.add(`anc:${key}:g1`, 'grampa_fija', {}, w, w, { nodo: key, ajuste: aj, sistema: 'comun' });
      }
    }
    if (nx.estabilizador && cubre(C, c)) {
      const d = dirAfuera(C, esq);
      const pie = mas(C.p, d, nx.estabilizador.brazo);
      em.add(`est:${key}`, 'estabilizador', { largo: nx.estabilizador.brazo }, P3(C.p, c), P3(pie, C.ySuelo ?? 0), { nodo: key, sistema: 'comun' });
    }
  }
}

function colinealidad(w: Vano, v: Vano, ix: IndiceEsqueleto): number {
  const d = (x: Vano): V2 => {
    const a = ix.col.get(x.a)!.p;
    const b = ix.col.get(x.b)!.p;
    const L = dist2(a, b) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  const p = d(w);
  const q = d(v);
  return p[0] * q[0] + p[1] * q[1];
}

/** Dirección hacia el muro: la normal del vano interior de la columna (o la opuesta a la exterior). */
export function dirMuro(C: Columna, ix: IndiceEsqueleto): V2 {
  const vs = ix.vanosDeCol.get(C.id) || [];
  const int = vs.find((v) => v.cara === 'interior');
  if (int) return normalVano(int, ix);
  const ext = vs.find((v) => v.cara === 'exterior');
  if (ext) {
    const n = normalVano(ext, ix);
    return [-n[0], -n[1]];
  }
  return [0, -1];
}

function dirAfuera(C: Columna, esq: Esqueleto): V2 {
  const cx = esq.columnas.reduce((s, x) => s + x.p[0], 0) / esq.columnas.length;
  const cz = esq.columnas.reduce((s, x) => s + x.p[1], 0) / esq.columnas.length;
  const dx = C.p[0] - cx;
  const dz = C.p[1] - cz;
  const L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
}

// ───────────── elementos ─────────────
function armarElementos(esq: Esqueleto, em: Emisor): void {
  for (const e of esq.elementos) {
    let kit: Pieza['kit'];
    if (e.kit) {
      const cod = e.kit.codigo ?? (e.kit.medidas ? em.codigo('modulo_kit', e.kit.medidas, 'bastidor') : null);
      if (cod) kit = { codigo: cod, grupo: `${em.estId}:${e.kit.grupo}` };
    }
    em.add(`el:${e.id}`, e.familia, e.medidas, e.a, e.b, { elemento: e.id, primitivas: e.primitivas, ajuste: e.ajuste, medida: e.medida ?? e.rinde, sistema: e.sistema, kit });
  }
}
