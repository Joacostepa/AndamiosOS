/**
 * Esqueleto: creación y consulta. Toda estructura se resuelve en un esqueleto común (columnas, vanos,
 * cotas, paños y celdas) que `armar` convierte en piezas (arquitectura §3.4).
 */
import type { CeldaCara, CeldaPano, Columna, Elemento, Esqueleto, NodoExtra, Pano, Sistema, V2, Vano } from '../tipos.ts';
import { EPS, mm, r3, dist2, centroide } from '../util.ts';

export const celdaId = (vanoId: string, k: number): string => `${vanoId}@${k}`;
export const panoCeldaId = (panoId: string, k: number): string => `${panoId}@${k}`;
export const nodoId = (columnaId: string, k: number): string => `${columnaId}@${k}`;

export function partirClave(clave: string): { id: string; k: number } {
  const i = clave.lastIndexOf('@');
  return { id: clave.slice(0, i), k: Number(clave.slice(i + 1)) };
}

export function esqueletoVacio(sistema: Sistema): Esqueleto {
  return { sistema, columnas: [], vanos: [], panos: [], cotas: [], celdas: {}, celdasPano: {}, nodos: {}, elementos: [] };
}

/** Índices de consulta (no se guardan: se arman al vuelo). */
export interface IndiceEsqueleto {
  col: Map<string, Columna>;
  vano: Map<string, Vano>;
  pano: Map<string, Pano>;
  /** vanos que tocan cada columna */
  vanosDeCol: Map<string, Vano[]>;
  /** paños que contienen cada vano */
  panosDeVano: Map<string, Pano[]>;
}

export function indexar(esq: Esqueleto): IndiceEsqueleto {
  const col = new Map(esq.columnas.map((c) => [c.id, c]));
  const vano = new Map(esq.vanos.map((v) => [v.id, v]));
  const pano = new Map(esq.panos.map((p) => [p.id, p]));
  const vanosDeCol = new Map<string, Vano[]>();
  for (const v of esq.vanos) for (const c of [v.a, v.b]) {
    const l = vanosDeCol.get(c);
    if (l) l.push(v);
    else vanosDeCol.set(c, [v]);
  }
  const panosDeVano = new Map<string, Pano[]>();
  for (const p of esq.panos) for (const v of p.vanos) {
    const l = panosDeVano.get(v);
    if (l) l.push(p);
    else panosDeVano.set(v, [p]);
  }
  return { col, vano, pano, vanosDeCol, panosDeVano };
}

/** Índice de una cota (tolerancia 1 mm); −1 si no está. */
export function cotaK(esq: Esqueleto, y: number): number {
  for (let k = 0; k < esq.cotas.length; k++) if (Math.abs(esq.cotas[k] - y) <= 0.0015) return k;
  return -1;
}

/** ¿La columna llega a la cota y? */
export const cubre = (c: Columna, y: number): boolean => y >= c.yBase - EPS && y <= c.yTope + EPS;

/** ¿La cota cae en una roseta de la columna? (las verticales mantienen la fase del arranque) */
export function enRoseta(c: Columna, y: number, paso = 0.5): boolean {
  const q = (y - c.yBase) / paso;
  return Math.abs(q - Math.round(q)) * paso < 0.002;
}

/** Normal hacia afuera de un vano de cara (la guardada o la que se aleja del paño vecino). */
export function normalVano(v: Vano, ix: IndiceEsqueleto): V2 {
  if (v.normal) return v.normal;
  const a = ix.col.get(v.a)!.p;
  const b = ix.col.get(v.b)!.p;
  const L = dist2(a, b) || 1;
  let n: V2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const panos = ix.panosDeVano.get(v.id) || [];
  if (panos.length) {
    const pts = panos[0].vanos.flatMap((id) => {
      const vv = ix.vano.get(id);
      return vv ? [ix.col.get(vv.a)!.p, ix.col.get(vv.b)!.p] : [];
    });
    const c = centroide(pts);
    const m: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((c[0] - m[0]) * n[0] + (c[1] - m[1]) * n[1] > 0) n = [-n[0], -n[1]];
  }
  return [r3(n[0]), r3(n[1])];
}

/** Columnas de un paño en orden de recorrido. */
export function columnasPano(p: Pano, ix: IndiceEsqueleto): string[] {
  const vs = p.vanos.map((id) => ix.vano.get(id)).filter((v): v is Vano => !!v);
  if (!vs.length) return [];
  const orden = [vs[0].a, vs[0].b];
  const usados = new Set([vs[0].id]);
  while (orden.length < vs.length + 1) {
    const ult = orden[orden.length - 1];
    const sig = vs.find((v) => !usados.has(v.id) && (v.a === ult || v.b === ult));
    if (!sig) break;
    usados.add(sig.id);
    orden.push(sig.a === ult ? sig.b : sig.a);
  }
  if (orden.length > 1 && orden[0] === orden[orden.length - 1]) orden.pop();
  return orden;
}

/**
 * Constructor incremental de esqueletos. Deduplica columnas por posición (al mm) y vanos por par de
 * columnas: así las esquinas comparten verticales por construcción.
 */
export class ConstructorEsqueleto {
  esq: Esqueleto;
  private porPos = new Map<string, string>();
  private porPar = new Map<string, string>();
  private ixCol = new Map<string, Columna>();

  constructor(sistema: Sistema, cotas: number[] = []) {
    this.esq = esqueletoVacio(sistema);
    this.esq.cotas = [...cotas].sort((a, b) => a - b).map(r3);
  }

  setCotas(cotas: number[]): void {
    const u = [...new Set(cotas.map(r3))].sort((a, b) => a - b);
    this.esq.cotas = u;
  }

  k(y: number): number {
    return cotaK(this.esq, y);
  }

  colEn(p: V2): Columna | undefined {
    const id = this.porPos.get(`${mm(p[0])}|${mm(p[1])}`);
    return id ? this.ixCol.get(id) : undefined;
  }

  /** Agrega (o devuelve la existente en esa posición) una columna. Al fusionar, se queda con el rango mayor. */
  columna(id: string, p: V2, yBase: number, yTope: number, apoyo: Columna['apoyo'], extra: Partial<Columna> = {}): string {
    const key = `${mm(p[0])}|${mm(p[1])}`;
    const ya = this.porPos.get(key);
    if (ya) {
      const c = this.ixCol.get(ya)!;
      if (yBase < c.yBase - EPS) {
        c.yBase = r3(yBase);
        c.apoyo = apoyo;
      }
      c.yTope = r3(Math.max(c.yTope, yTope));
      return ya;
    }
    const c: Columna = { id, p: [r3(p[0]), r3(p[1])], yBase: r3(yBase), yTope: r3(yTope), apoyo, ...extra };
    this.esq.columnas.push(c);
    this.porPos.set(key, id);
    this.ixCol.set(id, c);
    return id;
  }

  col(id: string): Columna {
    return this.ixCol.get(id)!;
  }

  vanoEntre(a: string, b: string): Vano | undefined {
    const id = this.porPar.get(a < b ? `${a}|${b}` : `${b}|${a}`);
    return id ? this.esq.vanos.find((v) => v.id === id) : undefined;
  }

  /** Agrega un vano (o devuelve el existente entre las mismas columnas). */
  vano(id: string, a: string, b: string, cara: Vano['cara'], extra: { libre?: boolean; normal?: V2 } = {}): string {
    const par = a < b ? `${a}|${b}` : `${b}|${a}`;
    const ya = this.porPar.get(par);
    if (ya) return ya;
    const pa = this.ixCol.get(a)!.p;
    const pb = this.ixCol.get(b)!.p;
    const v: Vano = { id, a, b, cara, medida: r3(dist2(pa, pb)), libre: !!extra.libre };
    if (extra.normal) v.normal = [r3(extra.normal[0]), r3(extra.normal[1])];
    this.esq.vanos.push(v);
    this.porPar.set(par, id);
    return id;
  }

  pano(id: string, vanos: string[], extra: { libre?: boolean; sentido?: string } = {}): string {
    const ya = this.esq.panos.find((p) => p.vanos.length === vanos.length && vanos.every((v) => p.vanos.includes(v)));
    if (ya) return ya.id;
    const p: Pano = { id, vanos, libre: !!extra.libre };
    if (extra.sentido) p.sentido = extra.sentido;
    this.esq.panos.push(p);
    return id;
  }

  celda(vanoId: string, k: number, valor: Partial<CeldaCara>): void {
    if (k < 0) return;
    const key = celdaId(vanoId, k);
    this.esq.celdas[key] = { ...(this.esq.celdas[key] || {}), ...valor };
  }

  celdaPano(panoId: string, k: number, valor: Partial<CeldaPano>): void {
    if (k < 0) return;
    const key = panoCeldaId(panoId, k);
    this.esq.celdasPano[key] = { ...(this.esq.celdasPano[key] || {}), ...valor };
  }

  nodo(columnaId: string, k: number, valor: Partial<NodoExtra>): void {
    if (k < 0) return;
    const key = nodoId(columnaId, k);
    this.esq.nodos[key] = { ...(this.esq.nodos[key] || {}), ...valor };
  }

  elemento(e: Elemento): void {
    let id = e.id;
    if (this.esq.elementos.some((x) => x.id === id)) {
      let n = 2;
      while (this.esq.elementos.some((x) => x.id === `${id}~${n}`)) n++;
      id = `${id}~${n}`;
    }
    this.esq.elementos.push({ ...e, id });
  }
}

/** Próximo id libre con un prefijo ('c', 'v', 'p', 'el'…). */
export function proximoId(ids: Iterable<string>, prefijo: string): string {
  let n = -1;
  const re = new RegExp(`^${prefijo}(\\d+)$`);
  for (const id of ids) {
    const m = re.exec(id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefijo}${n + 1}`;
}
