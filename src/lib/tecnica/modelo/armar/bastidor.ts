/**
 * armar para el sistema de bastidores: los vanos transversales son planos de bastidor, los longitudinales
 * llevan riendas H (y cruzadas D en la cara exterior). Cómputo por kit (1 bastidor + 2 riendas H + 2 D,
 * supuesto) agrupando por paño y nivel.
 */
import type { Esqueleto, V2, V3, Vano } from '../tipos.ts';
import { celdaId, cubre, type IndiceEsqueleto } from '../esqueleto/esqueleto.ts';
import { EPS, r3 } from '../util.ts';
import { armarBase, barandaCelda, type CtxArmar, type Emisor, nodoMundo } from './armar.ts';

const P3 = (p: V2, y: number): V3 => [p[0], r3(y), p[1]];
const lerp = (a: V2, b: V2, t: number): V2 => [r3(a[0] + (b[0] - a[0]) * t), r3(a[1] + (b[1] - a[1]) * t)];

function primBastidor(a: V2, b: V2, y0: number, y1: number): { a: V3; b: V3 }[] {
  return [
    { a: P3(a, y0), b: P3(a, y1) }, { a: P3(b, y0), b: P3(b, y1) },
    { a: P3(a, y1 - 0.05), b: P3(b, y1 - 0.05) }, { a: P3(a, y0 + 0.35), b: P3(b, y0 + 0.35) },
    { a: P3(a, y1 - 0.4), b: P3(lerp(a, b, 0.3), y1 - 0.05) }, { a: P3(b, y1 - 0.4), b: P3(lerp(a, b, 0.7), y1 - 0.05) },
  ];
}

export function armarBastidor(esq: Esqueleto, ix: IndiceEsqueleto, em: Emisor, ctx: CtxArmar): void {
  for (const c of esq.columnas) armarBase(c, em, esq, nodoMundo(ctx.marco, c.p), false);
  const K = esq.cotas.length;
  // paño de cada vano y transversal de arranque de cada paño (el bastidor que entra en el kit)
  const exteriorDe = new Map<string, Vano>();
  const inicioDe = new Map<string, string>(); // transversalId → panoId
  for (const p of esq.panos) {
    const vs = p.vanos.map((id) => ix.vano.get(id)).filter((v): v is Vano => !!v);
    const ext = vs.find((v) => v.cara === 'exterior') || vs.find((v) => v.cara === 'interior');
    if (!ext) continue;
    exteriorDe.set(p.id, ext);
    const tr = vs.find((v) => v.cara === 'transversal' && (v.a === ext.a || v.b === ext.a));
    if (tr && !inicioDe.has(tr.id)) inicioDe.set(tr.id, p.id);
  }
  const kitDe = (panoId: string | undefined, k: number, h: number): { codigo: string; grupo: string } | undefined => {
    if (!panoId) return undefined;
    const ext = exteriorDe.get(panoId);
    if (!ext || ext.libre) return undefined;
    const ce = esq.celdas[celdaId(ext.id, k)] || {};
    if (ce.abertura) return undefined;
    const p = esq.panos.find((x) => x.id === panoId)!;
    const tr = p.vanos.map((id) => ix.vano.get(id)).find((v) => v && v.cara === 'transversal');
    if (!tr) return undefined;
    const cod = em.codigo('modulo_kit', { ancho: tr.medida, largo: ext.medida, alto: h >= 2.5 - EPS ? 2.5 : 1.8 }, 'bastidor');
    return cod ? { codigo: cod, grupo: `${em.estId}:${panoId}@${k}` } : undefined;
  };
  const postes = new Set<string>();
  for (const v of esq.vanos) {
    const A = ix.col.get(v.a);
    const B = ix.col.get(v.b);
    if (!A || !B) continue;
    const panoV = (ix.panosDeVano.get(v.id) || [])[0]?.id;
    for (let k = 0; k < K; k++) {
      const key = celdaId(v.id, k);
      const ce = esq.celdas[key] || {};
      const c = esq.cotas[k];
      if (!(cubre(A, c) && cubre(B, c))) continue;
      const lo = k > 0 ? esq.cotas[k - 1] : null;
      const h = lo === null ? 0 : r3(c - lo);
      const arriba = esq.cotas[k + 1];
      const esTope = arriba === undefined || !(cubre(A, arriba) && cubre(B, arriba));
      if (v.cara === 'transversal') {
        if (lo !== null && cubre(A, lo) && cubre(B, lo)) {
          const kit = kitDe(inicioDe.get(v.id), k, h);
          em.add(`bas:${key}`, 'bastidor', { ancho: v.medida, alto: h >= 2.5 - EPS ? 2.5 : 1.8 }, P3(A.p, lo), P3(B.p, c), { celda: key, kit, primitivas: primBastidor(A.p, B.p, lo, c) });
        }
        const bar = ce.baranda || 0;
        if (bar && esTope && Math.min(A.yTope, B.yTope) >= c + 1 - EPS) {
          em.add(`bbar:${key}`, 'bastidor_baranda', { ancho: v.medida, alto: 1.0 }, P3(A.p, c), P3(B.p, c + 1), { celda: key, primitivas: primBastidor(A.p, B.p, c, c + 1).slice(0, 3) });
          if (ce.rodapie) barandaCelda(v, A, B, c, key, 0, true, false, em, postes);
        } else if (bar || ce.rodapie) {
          barandaCelda(v, A, B, c, key, bar, ce.rodapie, true, em, postes);
        }
        continue;
      }
      // longitudinales: riendas
      if (lo === null) continue;
      const paso = h >= 2.5 - EPS;
      const kit = kitDe(panoV, k, h);
      const libre = v.libre || !!ce.cano;
      if ((!ce.abertura || paso) && ce.horizontal !== false) {
        if (libre) em.tubo(`rh:${key}`, 'horizontal', v.medida, P3(A.p, c - 0.2), P3(B.p, c - 0.2), { forzarCano: true, celda: key });
        else em.add(`rh:${key}`, 'rienda_h', { largo: v.medida }, P3(A.p, c - 0.2), P3(B.p, c - 0.2), { celda: key, kit });
        if (ce.diagonal) {
          if (libre) {
            em.tubo(`rd:${key}:a`, 'horizontal', Math.hypot(v.medida, h - 0.4), P3(A.p, lo + 0.2), P3(B.p, c - 0.2), { forzarCano: true, celda: key });
          } else {
            em.add(`rd:${key}:a`, 'rienda_d', { largo: v.medida }, P3(A.p, lo + 0.2), P3(B.p, c - 0.2), { celda: key, kit });
            em.add(`rd:${key}:b`, 'rienda_d', { largo: v.medida }, P3(B.p, lo + 0.2), P3(A.p, c - 0.2), { celda: key, kit });
          }
        }
      }
      const bar = ce.baranda || 0;
      if (bar) {
        const alturas = bar >= 2 ? [0.5, 1.0] : [0.5];
        alturas.forEach((dy, j) => {
          if (libre) em.tubo(`b:${key}:${j}`, 'baranda', v.medida, P3(A.p, c + dy), P3(B.p, c + dy), { forzarCano: true, celda: key });
          else em.add(`b:${key}:${j}`, 'rienda_h', { largo: v.medida }, P3(A.p, c + dy), P3(B.p, c + dy), { celda: key });
        });
      }
      if (ce.rodapie ?? bar > 0) barandaCelda(v, A, B, c, key, 0, true, libre, em, postes);
    }
  }
}
