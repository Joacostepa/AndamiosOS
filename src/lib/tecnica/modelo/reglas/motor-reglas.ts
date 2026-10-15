/**
 * Reglas en modo SUGERENCIAS (estructura libre): no cambian el esqueleto, solo emiten avisos con
 * reparaciones (acciones de esqueleto). En las plantillas las reglas las aplica cada tipología al generar.
 */
import type { Accion, Aviso, Esqueleto, OpEsqueleto, Vano } from '../tipos.ts';
import { CRITERIOS } from '../criterios.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { celdaId, cubre, indexar, panoCeldaId } from '../esqueleto/esqueleto.ts';
import { bandaConDiagonal, sentidoZigzag, vanosArriostrados } from './diagonales.ts';
import { EPS, fmt, r3 } from '../util.ts';

const op = (estructuraId: string, o: OpEsqueleto): Accion => ({ tipo: 'esqueleto', estructuraId, op: o });
const lote = (acciones: Accion[]): Accion => (acciones.length === 1 ? acciones[0] : { tipo: 'lote', acciones });

/** Cadenas de vanos de cara exterior conectados (en orden). */
function cadenas(esq: Esqueleto): Vano[][] {
  const ext = esq.vanos.filter((v) => v.cara === 'exterior');
  const usados = new Set<string>();
  const out: Vano[][] = [];
  const porCol = new Map<string, Vano[]>();
  for (const v of ext) for (const c of [v.a, v.b]) porCol.set(c, [...(porCol.get(c) || []), v]);
  for (const v0 of ext) {
    if (usados.has(v0.id)) continue;
    const cad = [v0];
    usados.add(v0.id);
    for (const sentido of ['b', 'a'] as const) {
      let actual = v0;
      let punta = sentido === 'b' ? v0.b : v0.a;
      for (;;) {
        const sig = (porCol.get(punta) || []).find((w) => w.id !== actual.id && !usados.has(w.id));
        if (!sig) break;
        usados.add(sig.id);
        if (sentido === 'b') cad.push(sig);
        else cad.unshift(sig);
        punta = sig.a === punta ? sig.b : sig.a;
        actual = sig;
      }
    }
    out.push(cad);
  }
  return out;
}

export function revisarEsqueleto(esq: Esqueleto, estructuraId: string): Omit<Aviso, 'id'>[] {
  const avisos: Omit<Aviso, 'id'>[] = [];
  const ix = indexar(esq);
  const K = esq.cotas.length;
  const cubreV = (v: Vano, y: number) => {
    const A = ix.col.get(v.a);
    const B = ix.col.get(v.b);
    return !!A && !!B && cubre(A, y) && cubre(B, y);
  };
  // 1. diagonales: en cada tramo de cara exterior, cada banda tiene que tener diagonales
  for (const cad of cadenas(esq)) {
    const acciones: Accion[] = [];
    const arr = vanosArriostrados(cad.length);
    const bandas: number[] = [];
    for (let k = 1; k < K; k++) {
      if (!bandaConDiagonal(esq.cotas[k] - esq.cotas[k - 1])) continue;
      const enBanda = cad.filter((v) => cubreV(v, esq.cotas[k]) && cubreV(v, esq.cotas[k - 1]));
      if (!enBanda.length) continue;
      const tiene = enBanda.some((v) => esq.celdas[celdaId(v.id, k)]?.diagonal);
      if (tiene) continue;
      bandas.push(k);
      arr.forEach((i, fase) => {
        const v = cad[i];
        if (!enBanda.includes(v)) return;
        acciones.push(op(estructuraId, { op: 'celda', clave: celdaId(v.id, k), valor: { diagonal: sentidoZigzag(k, fase) } }));
      });
    }
    if (bandas.length && acciones.length) {
      avisos.push({ regla: 'libre.diag.falta', nivel: 'aviso', estructuraId, celda: celdaId(cad[0].id, bandas[0]), texto: `Faltan diagonales en ${bandas.length} banda${bandas.length > 1 ? 's' : ''} de la cara exterior (${cad.length} vano${cad.length > 1 ? 's' : ''}) ⚠.`, reparaciones: [{ etiqueta: 'Agregar diagonales en zigzag', accion: lote(acciones) }] });
    }
  }
  // 2. barandas: borde libre de una plataforma sin baranda
  {
    const acciones: Accion[] = [];
    let primera: string | undefined;
    for (let k = 0; k < K; k++) {
      const conPlat = esq.panos.filter((p) => esq.celdasPano[panoCeldaId(p.id, k)]?.plataforma);
      if (!conPlat.length) continue;
      const cuenta = new Map<string, number>();
      for (const p of conPlat) for (const v of p.vanos) cuenta.set(v, (cuenta.get(v) || 0) + 1);
      for (const [vid, n] of cuenta) {
        if (n > 1) continue;
        const v = ix.vano.get(vid);
        if (!v || v.cara === 'interior') continue;
        const ce = esq.celdas[celdaId(vid, k)] || {};
        if ((ce.baranda || 0) > 0) continue;
        const mens = esq.nodos[`${v.a}@${k}`]?.mensula && esq.nodos[`${v.b}@${k}`]?.mensula;
        if (mens) continue;
        primera = primera || celdaId(vid, k);
        acciones.push(op(estructuraId, { op: 'celda', clave: celdaId(vid, k), valor: { baranda: 2 } }));
      }
    }
    if (acciones.length) avisos.push({ regla: 'libre.baranda.falta', nivel: 'error', estructuraId, celda: primera, texto: `${acciones.length} borde${acciones.length > 1 ? 's' : ''} de plataforma sin baranda.`, reparaciones: [{ etiqueta: 'Poner baranda doble y rodapié', accion: lote(acciones) }] });
  }
  // 3. columnas sin apoyo
  for (const c of esq.columnas) {
    if (c.apoyo !== 'ninguno') continue;
    const debajo = esq.columnas.some((x) => x.id !== c.id && Math.abs(x.p[0] - c.p[0]) < EPS && Math.abs(x.p[1] - c.p[1]) < EPS && x.yTope <= c.yBase + EPS);
    const vigas = esq.elementos.some((e) => (e.familia === 'viga_celosia' || e.familia === 'viga_puente') && Math.abs(e.a[1] - c.yBase) < 0.6);
    if (debajo || vigas) continue;
    avisos.push({ regla: 'libre.apoyo', nivel: 'error', estructuraId, texto: `La columna ${c.id} arranca a ${fmt(c.yBase)} m sin apoyo debajo.`, reparaciones: [{ etiqueta: 'Bajarla al piso con base', accion: op(estructuraId, { op: 'columna', columnaId: c.id, yBase: esq.cotas[0] ?? 0.25, apoyo: 'base_regulable' }) }, { etiqueta: 'Agregar viga debajo', accion: op(estructuraId, { op: 'agregarElemento', elemento: { id: `viga-${c.id}`, familia: 'viga_puente', medidas: { largo: 2.5 }, a: [c.p[0] - 1.25, c.yBase, c.p[1]], b: [c.p[0] + 1.25, c.yBase, c.p[1]], grupo: 'viga' } }) }] });
  }
  // 4. tramo libre de vertical > 2,00
  for (const c of esq.columnas) {
    const vs = ix.vanosDeCol.get(c.id) || [];
    const ys: number[] = [];
    for (let k = 0; k < K; k++) {
      const y = esq.cotas[k];
      if (!cubre(c, y)) continue;
      if (vs.some((v) => cubreV(v, y) && esq.celdas[celdaId(v.id, k)]?.horizontal !== false && !esq.celdas[celdaId(v.id, k)]?.abertura)) ys.push(y);
    }
    if (!ys.length) continue;
    const tramos = [c.yBase, ...ys.filter((y) => y > c.yBase + EPS)];
    for (let i = 1; i < tramos.length; i++) {
      if (tramos[i] - tramos[i - 1] > CRITERIOS.libreVerticalMax + EPS) {
        const cota = r3(tramos[i - 1] + 2);
        avisos.push({ regla: 'libre.vertical', nivel: 'aviso', estructuraId, texto: `La columna ${c.id} queda ${fmt(tramos[i] - tramos[i - 1])} m sin horizontales (máx. ${fmt(CRITERIOS.libreVerticalMax)} ⚠).`, reparaciones: [{ etiqueta: `Agregar anillo a ${fmt(cota)}`, accion: op(estructuraId, { op: 'agregarNivel', cota }) }] });
        break;
      }
    }
  }
  // 5. esbeltez sin anclajes
  const anclada = Object.values(esq.nodos).some((n) => n.anclaje);
  if (!anclada && esq.columnas.length) {
    const xs = esq.columnas.map((c) => c.p[0]);
    const zs = esq.columnas.map((c) => c.p[1]);
    const B = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const H = Math.max(...esq.columnas.map((c) => c.yTope));
    if (B > 0 && H / B > CRITERIOS.hbMax) avisos.push({ regla: 'libre.hb', nivel: 'aviso', estructuraId, texto: `H/B = ${fmt(H / B, 1)} > ${CRITERIOS.hbMax} sin anclajes (H ${fmt(H)}, B ${fmt(B)}). ${PREDIMENSIONADO}.`, reparaciones: [] });
  }
  return avisos;
}
