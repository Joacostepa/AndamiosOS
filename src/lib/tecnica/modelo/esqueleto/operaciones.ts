/**
 * Operaciones de la estructura libre (§3.6). Puras: devuelven un esqueleto nuevo y avisos de texto.
 * Los ids nunca se renumeran: lo que se agrega toma el próximo id libre.
 */
import type { CeldaCara, CeldaPano, Columna, Esqueleto, NodoExtra, OpEsqueleto, Pano, V2, Vano } from '../tipos.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../catalogo/catalogo.ts';
import { celdaId, cubre, indexar, normalVano, panoCeldaId, partirClave, proximoId } from './esqueleto.ts';
import { clone, dist2, EPS, enLista, mm, r3 } from '../util.ts';

export interface ResultadoOp {
  esqueleto: Esqueleto;
  avisos: string[];
}

function merge<T extends object>(base: T | undefined, valor: Partial<T> | null): T | null {
  if (valor === null) return null;
  const out = { ...(base || {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(valor)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : null;
}

function setClave<T extends object>(rec: Record<string, T>, clave: string, valor: Partial<T> | null): void {
  const r = merge(rec[clave], valor);
  if (r) rec[clave] = r;
  else delete rec[clave];
}

class Editor {
  esq: Esqueleto;
  m: MedidasCatalogo;
  constructor(esq: Esqueleto, m: MedidasCatalogo) {
    this.esq = esq;
    this.m = m;
  }
  colEn(p: V2): Columna | undefined {
    return this.esq.columnas.find((c) => mm(c.p[0]) === mm(p[0]) && mm(c.p[1]) === mm(p[1]));
  }
  columna(p: V2, molde: Partial<Columna>): Columna {
    const ya = this.colEn(p);
    if (ya) return ya;
    const c: Columna = { id: proximoId(this.esq.columnas.map((x) => x.id), 'c'), p: [r3(p[0]), r3(p[1])], yBase: molde.yBase ?? this.esq.cotas[0] ?? 0.25, yTope: molde.yTope ?? 2, apoyo: molde.apoyo ?? 'base_regulable' };
    if (molde.ySuelo !== undefined) c.ySuelo = molde.ySuelo;
    this.esq.columnas.push(c);
    return c;
  }
  esLibre(medida: number, cara: Vano['cara']): boolean {
    const lista = cara === 'transversal' ? [...this.m.multi.profundidades, ...this.m.multi.vanos] : [...this.m.multi.vanos, ...this.m.multi.profundidades];
    return !enLista(lista, medida);
  }
  vano(a: string, b: string, cara: Vano['cara'], libre?: boolean, normal?: V2): Vano {
    const ya = this.esq.vanos.find((v) => (v.a === a && v.b === b) || (v.a === b && v.b === a));
    if (ya) return ya;
    const pa = this.esq.columnas.find((c) => c.id === a)!.p;
    const pb = this.esq.columnas.find((c) => c.id === b)!.p;
    const medida = r3(dist2(pa, pb));
    const v: Vano = { id: proximoId(this.esq.vanos.map((x) => x.id), 'v'), a, b, cara, medida, libre: libre ?? this.esLibre(medida, cara) };
    if (normal) v.normal = normal;
    this.esq.vanos.push(v);
    return v;
  }
  pano(vanos: string[], libre: boolean, sentido?: string): Pano {
    const ya = this.esq.panos.find((p) => p.vanos.length === vanos.length && vanos.every((v) => p.vanos.includes(v)));
    if (ya) return ya;
    const p: Pano = { id: proximoId(this.esq.panos.map((x) => x.id), 'p'), vanos, libre };
    if (sentido) p.sentido = sentido;
    this.esq.panos.push(p);
    return p;
  }
  remapK(desde: number, delta: number): void {
    const re = <T>(rec: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [key, v] of Object.entries(rec)) {
        const { id, k } = partirClave(key);
        if (k >= desde) {
          if (delta < 0 && k === desde) continue;
          out[`${id}@${k + delta}`] = v;
        } else out[key] = v;
      }
      return out;
    };
    this.esq.celdas = re(this.esq.celdas);
    this.esq.celdasPano = re(this.esq.celdasPano);
    this.esq.nodos = re(this.esq.nodos);
  }
}

const DIRS: Record<'der' | 'izq' | 'afuera' | 'adentro', V2> = { der: [1, 0], izq: [-1, 0], afuera: [0, 1], adentro: [0, -1] };

export function aplicarOpEsqueleto(esq0: Esqueleto, op: OpEsqueleto, medidas: MedidasCatalogo = medidasPorDefecto()): ResultadoOp {
  const esq = clone(esq0);
  const ed = new Editor(esq, medidas);
  const avisos: string[] = [];
  const ix = indexar(esq);
  switch (op.op) {
    case 'agregarVano': {
      const medida = r3(op.medida);
      if (!(medida > 0.05)) {
        avisos.push('La medida del vano tiene que ser mayor que 0,05.');
        break;
      }
      const zona = (molde: Columna): Partial<Columna> => {
        const yb = op.desdeK !== undefined ? esq.cotas[op.desdeK] ?? molde.yBase : molde.yBase;
        const yt = op.hastaK !== undefined ? Math.min(molde.yTope, r3((esq.cotas[op.hastaK] ?? molde.yTope) + 1)) : molde.yTope;
        const elevada = op.desdeK !== undefined && op.desdeK > 0;
        return { yBase: yb, yTope: yt, apoyo: elevada ? 'ninguno' : molde.apoyo, ySuelo: molde.ySuelo };
      };
      if (op.desde.columnaId) {
        const C = ix.col.get(op.desde.columnaId);
        if (!C) { avisos.push(`No existe la columna ${op.desde.columnaId}.`); break; }
        const d = DIRS[op.hacia];
        const N = ed.columna([C.p[0] + d[0] * medida, C.p[1] + d[1] * medida], zona(C));
        ed.vano(C.id, N.id, 'exterior', op.libre);
        break;
      }
      const V = op.desde.vanoId ? ix.vano.get(op.desde.vanoId) : undefined;
      if (!V) { avisos.push('Elegí un vano o una columna desde donde crecer.'); break; }
      const A = ix.col.get(V.a)!;
      const B = ix.col.get(V.b)!;
      const L = dist2(A.p, B.p) || 1;
      const d: V2 = [(B.p[0] - A.p[0]) / L, (B.p[1] - A.p[1]) / L];
      const panosV = ix.panosDeVano.get(V.id) || [];
      if (op.hacia === 'afuera' || op.hacia === 'adentro') {
        const n = normalVano(V, ix);
        const s = op.hacia === 'afuera' ? 1 : -1;
        const delta: V2 = [n[0] * s * medida, n[1] * s * medida];
        const A2 = ed.columna([A.p[0] + delta[0], A.p[1] + delta[1]], zona(A));
        const B2 = ed.columna([B.p[0] + delta[0], B.p[1] + delta[1]], zona(B));
        const tA = ed.vano(A.id, A2.id, 'transversal', op.libre);
        const tB = ed.vano(B.id, B2.id, 'transversal', op.libre);
        const caraNueva: Vano['cara'] = V.cara === 'interna' || V.cara === 'transversal' ? 'exterior' : V.cara;
        const V2n = ed.vano(A2.id, B2.id, caraNueva, V.libre, s > 0 ? n : [-n[0], -n[1]]);
        ed.pano([V.id, tB.id, V2n.id, tA.id], V.libre || tA.libre, V.id);
        // la cara vieja queda adentro: barandas y cerramientos pasan a la nueva
        if (s > 0 && (V.cara === 'exterior' || V.cara === 'interior')) {
          for (const [key, ce] of Object.entries({ ...esq.celdas })) {
            const { id, k } = partirClave(key);
            if (id !== V.id) continue;
            const mover: Partial<CeldaCara> = {};
            if (ce.baranda) mover.baranda = ce.baranda;
            if (ce.cerramiento) mover.cerramiento = ce.cerramiento;
            if (Object.keys(mover).length) {
              setClave(esq.celdas, celdaId(V2n.id, k), mover);
              setClave(esq.celdas, key, { baranda: null, cerramiento: null, rodapie: null } as unknown as Partial<CeldaCara>);
            }
          }
          V.cara = 'interna';
          delete V.normal;
        }
        const pNuevo = esq.panos[esq.panos.length - 1];
        if (panosV[0]) copiarPlataformas(esq, panosV[0].id, pNuevo.id);
        break;
      }
      // der / izq: se extiende la tira por la transversal del extremo
      const E = op.hacia === 'der' ? B : A;
      const sgn = op.hacia === 'der' ? 1 : -1;
      const delta: V2 = [d[0] * sgn * medida, d[1] * sgn * medida];
      const P = panosV[0];
      const T = P ? P.vanos.map((id) => ix.vano.get(id)!).find((w) => w.id !== V.id && (w.a === E.id || w.b === E.id)) : undefined;
      if (!P || !T) {
        const N = ed.columna([E.p[0] + delta[0], E.p[1] + delta[1]], zona(E));
        ed.vano(E.id, N.id, V.cara, op.libre);
        break;
      }
      const F = ix.col.get(T.a === E.id ? T.b : T.a)!;
      const E2 = ed.columna([E.p[0] + delta[0], E.p[1] + delta[1]], zona(E));
      const F2 = ed.columna([F.p[0] + delta[0], F.p[1] + delta[1]], zona(F));
      const opuesto = P.vanos.map((id) => ix.vano.get(id)!).find((w) => w.id !== V.id && w.id !== T.id && (w.a === F.id || w.b === F.id));
      const vE = ed.vano(E.id, E2.id, V.cara, op.libre, V.normal);
      const vF = ed.vano(F.id, F2.id, opuesto?.cara ?? 'interior', op.libre, opuesto?.normal);
      const T2 = ed.vano(E2.id, F2.id, T.cara, T.libre, T.normal ? [T.normal[0], T.normal[1]] : undefined);
      const pn = ed.pano([vE.id, T2.id, vF.id, T.id], !!op.libre || vE.libre, vE.id);
      copiarPlataformas(esq, P.id, pn.id);
      // barandas: las caras siguen; la transversal del extremo pasa a la nueva punta
      for (const [key, ce] of Object.entries({ ...esq.celdas })) {
        const { id, k } = partirClave(key);
        if (id === V.id && ce.baranda) setClave(esq.celdas, celdaId(vE.id, k), { baranda: ce.baranda });
        if (opuesto && id === opuesto.id && ce.baranda) setClave(esq.celdas, celdaId(vF.id, k), { baranda: ce.baranda });
        if (id === T.id && ce.baranda) {
          setClave(esq.celdas, celdaId(T2.id, k), { baranda: ce.baranda });
          setClave(esq.celdas, key, { baranda: null, rodapie: null } as unknown as Partial<CeldaCara>);
        }
        if (id === V.id && ce.cerramiento) setClave(esq.celdas, celdaId(vE.id, k), { cerramiento: ce.cerramiento });
      }
      break;
    }
    case 'quitarVano': {
      const V = ix.vano.get(op.vanoId);
      if (!V) { avisos.push(`No existe el vano ${op.vanoId}.`); break; }
      const panos = new Set((ix.panosDeVano.get(V.id) || []).map((p) => p.id));
      esq.vanos = esq.vanos.filter((v) => v.id !== V.id);
      esq.panos = esq.panos.filter((p) => !panos.has(p.id));
      for (const key of Object.keys(esq.celdas)) if (partirClave(key).id === V.id) delete esq.celdas[key];
      for (const key of Object.keys(esq.celdasPano)) if (panos.has(partirClave(key).id)) delete esq.celdasPano[key];
      const usadas = new Set(esq.vanos.flatMap((v) => [v.a, v.b]));
      const huerfanas = new Set(esq.columnas.filter((c) => !usadas.has(c.id)).map((c) => c.id));
      esq.columnas = esq.columnas.filter((c) => !huerfanas.has(c.id));
      for (const key of Object.keys(esq.nodos)) if (huerfanas.has(partirClave(key).id)) delete esq.nodos[key];
      break;
    }
    case 'medidaVano': {
      const V = ix.vano.get(op.vanoId);
      if (!V) { avisos.push(`No existe el vano ${op.vanoId}.`); break; }
      const A = ix.col.get(V.a)!;
      const B = ix.col.get(V.b)!;
      const L = dist2(A.p, B.p) || 1;
      const d: V2 = [(B.p[0] - A.p[0]) / L, (B.p[1] - A.p[1]) / L];
      const delta = r3(op.medida - L);
      const proj = (p: V2) => (p[0] - A.p[0]) * d[0] + (p[1] - A.p[1]) * d[1];
      const corte = proj(B.p) - EPS;
      for (const c of esq.columnas) if (proj(c.p) >= corte) c.p = [r3(c.p[0] + d[0] * delta), r3(c.p[1] + d[1] * delta)];
      for (const e of esq.elementos) {
        if (proj([e.a[0], e.a[2]]) >= corte && proj([e.b[0], e.b[2]]) >= corte) {
          e.a = [r3(e.a[0] + d[0] * delta), e.a[1], r3(e.a[2] + d[1] * delta)];
          e.b = [r3(e.b[0] + d[0] * delta), e.b[1], r3(e.b[2] + d[1] * delta)];
        }
      }
      const pos = new Map(esq.columnas.map((c) => [c.id, c.p]));
      for (const v of esq.vanos) {
        const nueva = r3(dist2(pos.get(v.a)!, pos.get(v.b)!));
        if (Math.abs(nueva - v.medida) > 0.0005) {
          v.medida = nueva;
          v.libre = ed.esLibre(nueva, v.cara);
        }
      }
      if (op.libre !== undefined) V.libre = op.libre || ed.esLibre(V.medida, V.cara);
      for (const p of esq.panos) p.libre = p.vanos.some((id) => esq.vanos.find((v) => v.id === id)?.libre);
      break;
    }
    case 'agregarNivel': {
      const cota = r3(op.cota);
      if (esq.cotas.some((c) => Math.abs(c - cota) < 0.0015)) { avisos.push(`Ya hay un nivel a ${cota}.`); break; }
      const k = esq.cotas.filter((c) => c < cota).length;
      const arriba = k === esq.cotas.length;
      ed.remapK(k, 1);
      esq.cotas.splice(k, 0, cota);
      const objetivo = new Set(op.columnas && op.columnas.length ? op.columnas : esq.columnas.map((c) => c.id));
      if (arriba) {
        const kOld = k - 1;
        for (const c of esq.columnas) if (objetivo.has(c.id) && c.yTope >= esq.cotas[kOld] - EPS) c.yTope = Math.max(c.yTope, r3(cota + 1));
        const ixn = indexar(esq);
        for (const p of esq.panos) {
          const cols = new Set(p.vanos.flatMap((id) => { const v = ixn.vano.get(id); return v ? [v.a, v.b] : []; }));
          if (![...cols].every((c) => objetivo.has(c))) continue;
          const pl = esq.celdasPano[panoCeldaId(p.id, kOld)];
          if (pl?.plataforma) setClave(esq.celdasPano, panoCeldaId(p.id, k), { plataforma: pl.plataforma === 'escotilla' ? 'tablones' : pl.plataforma });
          for (const vid of p.vanos) {
            const ce = esq.celdas[celdaId(vid, kOld)];
            if (ce?.baranda) {
              setClave(esq.celdas, celdaId(vid, k), { baranda: ce.baranda });
              setClave(esq.celdas, celdaId(vid, kOld), { baranda: null, rodapie: null } as unknown as Partial<CeldaCara>);
            }
          }
        }
      } else if (op.columnas && op.columnas.length) {
        for (const v of esq.vanos) if (!(objetivo.has(v.a) && objetivo.has(v.b))) setClave(esq.celdas, celdaId(v.id, k), { horizontal: false });
      }
      break;
    }
    case 'quitarNivel': {
      const k = op.k;
      if (!(k >= 0 && k < esq.cotas.length)) { avisos.push('Ese nivel no existe.'); break; }
      if (op.columnas && op.columnas.length) {
        const objetivo = new Set(op.columnas);
        for (const v of esq.vanos) if (objetivo.has(v.a) || objetivo.has(v.b)) setClave(esq.celdas, celdaId(v.id, k), { horizontal: false, baranda: null, diagonal: null } as unknown as Partial<CeldaCara>);
        for (const p of esq.panos) {
          const cols = p.vanos.flatMap((id) => { const v = ix.vano.get(id); return v ? [v.a, v.b] : []; });
          if (cols.some((c) => objetivo.has(c))) delete esq.celdasPano[panoCeldaId(p.id, k)];
        }
        const top = k === esq.cotas.length - 1 || esq.columnas.filter((c) => objetivo.has(c.id)).every((c) => !cubre(c, esq.cotas[k + 1] ?? Infinity));
        if (top && k > 0) for (const c of esq.columnas) if (objetivo.has(c.id)) c.yTope = Math.min(c.yTope, r3(esq.cotas[k - 1] + 1));
        break;
      }
      const yk = esq.cotas[k];
      ed.remapK(k, -1);
      esq.cotas.splice(k, 1);
      if (!esq.cotas.length) { avisos.push('No se puede quitar el único nivel.'); return { esqueleto: esq0, avisos }; }
      const max = esq.cotas[esq.cotas.length - 1];
      if (yk > max) for (const c of esq.columnas) c.yTope = Math.min(c.yTope, r3(max + 1));
      break;
    }
    case 'celda':
      setClave(esq.celdas, op.clave, op.valor as Partial<CeldaCara> | null);
      break;
    case 'pano':
      setClave(esq.celdasPano, op.clave, op.valor as Partial<CeldaPano> | null);
      break;
    case 'nodo':
      setClave(esq.nodos, op.clave, op.valor as Partial<NodoExtra> | null);
      break;
    case 'columna': {
      const c = esq.columnas.find((x) => x.id === op.columnaId);
      if (!c) { avisos.push(`No existe la columna ${op.columnaId}.`); break; }
      if (op.yBase !== undefined) c.yBase = r3(op.yBase);
      if (op.yTope !== undefined) c.yTope = r3(op.yTope);
      if (op.apoyo !== undefined) c.apoyo = op.apoyo;
      if (op.ySuelo !== undefined) c.ySuelo = r3(op.ySuelo);
      if (c.yTope <= c.yBase) avisos.push(`La columna ${c.id} quedó con el tope por debajo del arranque.`);
      break;
    }
    case 'agregarElemento': {
      const id = esq.elementos.some((e) => e.id === op.elemento.id) ? proximoId(esq.elementos.map((e) => e.id), 'el') : op.elemento.id;
      esq.elementos.push({ ...clone(op.elemento), id });
      break;
    }
    case 'quitarElemento':
      esq.elementos = esq.elementos.filter((e) => e.id !== op.id && e.grupo !== op.id);
      break;
    case 'moverElemento': {
      const e = esq.elementos.find((x) => x.id === op.id);
      if (!e) { avisos.push(`No existe el elemento ${op.id}.`); break; }
      const mv = (q: [number, number, number]): [number, number, number] => [r3(q[0] + op.delta[0]), r3(q[1] + op.delta[1]), r3(q[2] + op.delta[2])];
      e.a = mv(e.a);
      e.b = mv(e.b);
      if (e.primitivas) e.primitivas = e.primitivas.map((p) => ({ a: mv(p.a), b: mv(p.b) }));
      break;
    }
  }
  return { esqueleto: esq, avisos };
}

function copiarPlataformas(esq: Esqueleto, desde: string, hacia: string): void {
  for (const [key, ce] of Object.entries({ ...esq.celdasPano })) {
    const { id, k } = partirClave(key);
    if (id !== desde || !ce.plataforma) continue;
    esq.celdasPano[panoCeldaId(hacia, k)] = { plataforma: ce.plataforma === 'escotilla' ? 'tablones' : ce.plataforma, ...(ce.fenolico ? { fenolico: true } : {}) };
  }
}
