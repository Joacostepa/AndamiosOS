/**
 * Puertos, encastre (snap) y unión entre estructuras (port de la maqueta) + modo `embebida`.
 */
import type { Diseno, Estructura, Puerto, Union, V2 } from '../tipos.ts';
import { type Catalogo, catalogoVacio } from '../catalogo/catalogo.ts';
import { generarTodas } from '../construir.ts';
import { categoriaDe } from '../tipologias/indice.ts';
import { angulo2, clone, EPS, mod, r3, rot2 } from '../util.ts';

const categoria = (e: Estructura) => categoriaDe(e);

/** Puertos de una estructura en coordenadas de mundo (resuelta en el contexto del diseño, si se pasa). */
export function puertosDe(estructura: Estructura, diseno: Diseno | null = null, catalogo: Catalogo = catalogoVacio()): Puerto[] {
  const d: Diseno = diseno
    ? { ...diseno, estructuras: diseno.estructuras.some((e) => e.id === estructura.id) ? diseno.estructuras.map((e) => (e.id === estructura.id ? estructura : e)) : [...diseno.estructuras, estructura] }
    : { esquema: 2, nombre: '', contexto: { terreno: 'cemento', enVereda: false, claseCarga: 3, volumenes: [] }, estructuras: [estructura], uniones: [], modoBom: 'kit', ajustesBom: [] };
  return generarTodas(d, catalogo).get(estructura.id)?.puertos || [];
}

function ordenarCara(pt: Puerto): Puerto {
  if (pt.tipo !== 'cara' && pt.tipo !== 'extremo') return pt;
  const dEsp = [-pt.normal[2], 0, pt.normal[0]];
  if (dEsp[0] * pt.d[0] + dEsp[2] * pt.d[2] >= 0) return pt;
  return { ...pt, p0: pt.p1, p1: pt.p0, d: pt.d.map((x) => -x) as Puerto['d'], cols: pt.cols.map((c) => r3(pt.largo - c)).reverse() };
}

function puertoPorDefecto(est: Estructura, modo: Union['modo']): string {
  const c = categoria(est);
  if (modo === 'apoyo') return c === 'portico' ? 'tope' : 'f0:base';
  if (modo === 'embebida') return c === 'fachada' ? 'f0:base' : 'base';
  if (c === 'fachada') return 'f0:ini';
  return 'frente';
}

function snapS(ptA: Puerto, s: number, largoB: number): number {
  const max = Math.max(0, ptA.largo - largoB);
  const cands = ptA.cols.filter((c) => c <= max + EPS);
  if (!cands.length) return Math.min(Math.max(0, s), max);
  return cands.reduce((b, c) => (Math.abs(c - s) < Math.abs(b - s) ? c : b), cands[0]);
}

/**
 * Mueve b para que su puerto encastre en el puerto a y guarda la unión. Modos: 'vertical_compartida' (caras
 * pegadas), 'vano_giro' (separadas 0,73 con horizontales de conexión), 'apoyo' (el pórtico es el soporte) y
 * 'embebida' (b ocupa vanos de a sobre su línea de base).
 */
export function unir(diseno: Diseno, a: { estructuraId: string; puerto: string; s?: number }, b: { estructuraId: string; puerto?: string }, modo: Union['modo'] = 'vertical_compartida', catalogo: Catalogo = catalogoVacio()): Diseno {
  const d = clone(diseno);
  const estA = d.estructuras.find((e) => e.id === a.estructuraId);
  const estB = d.estructuras.find((e) => e.id === b.estructuraId);
  if (!estA || !estB || estA.id === estB.id) return d;
  const sinUnion = { ...d, uniones: d.uniones.filter((u) => !((u.a.estructuraId === estA.id && u.b.estructuraId === estB.id) || (u.a.estructuraId === estB.id && u.b.estructuraId === estA.id))) };
  const gens = generarTodas(sinUnion, catalogo);
  let puertoA = a.puerto;
  if (modo === 'embebida' && categoria(estA) === 'fachada') puertoA = puertoA.replace(/:(ext|ini|fin)$/, ':base');
  const ptA0 = gens.get(estA.id)?.puertos.find((x) => x.id === puertoA);
  if (!ptA0) return d;
  const idB = b.puerto || puertoPorDefecto(estB, modo);
  const estB0: Estructura = { ...clone(estB), origen: [0, 0], rumbo: 0 };
  const ptB0 = puertosDe(estB0, null, catalogo).find((x) => x.id === idB);
  if (!ptB0) return d;
  let ptA = ptA0;
  let ptB = ptB0;
  let s = a.s ?? Math.max(0, (ptA.largo - ptB.largo) / 2);
  let destinoD: Puerto['d'];
  let destinoP0: V2;
  let sGuardado: number;
  if (modo === 'apoyo' || modo === 'embebida') {
    s = snapS(ptA, s, ptB.largo);
    sGuardado = s;
    destinoD = ptA.d;
    destinoP0 = [ptA.p0[0] + ptA.d[0] * s, ptA.p0[2] + ptA.d[2] * s];
  } else {
    ptA = ordenarCara(ptA0);
    ptB = ordenarCara(ptB0);
    const invertido = ptA.p0 !== ptA0.p0;
    const aOrd = (x: number) => (invertido ? ptA.largo - x - ptB.largo : x);
    s = snapS(ptA, aOrd(s), ptB.largo);
    sGuardado = aOrd(s);
    const gap = modo === 'vano_giro' ? 0.73 : 0;
    destinoD = ptA.d.map((x) => -x) as Puerto['d'];
    const sp0 = s + ptB.largo;
    destinoP0 = [ptA.p0[0] + ptA.d[0] * sp0 + ptA.normal[0] * gap, ptA.p0[2] + ptA.d[2] * sp0 + ptA.normal[2] * gap];
  }
  const rumboNuevo = angulo2([destinoD[0], destinoD[2]]) - angulo2([ptB.d[0], ptB.d[2]]);
  const p0Rot = rot2([ptB.p0[0], ptB.p0[2]], rumboNuevo);
  estB.rumbo = r3(mod(rumboNuevo + 180, 360) - 180);
  estB.origen = [r3(destinoP0[0] - p0Rot[0]), r3(destinoP0[1] - p0Rot[1])];
  if (categoria(estB) === 'torre' && categoria(estA) === 'fachada' && modo !== 'apoyo' && estB.params.alturaHeredada !== false) {
    estB.params = { ...estB.params, altura: gens.get(estA.id)!.gen.metricas.alturaReal };
  }
  d.uniones = sinUnion.uniones;
  const nid = `U${d.uniones.reduce((m, u) => Math.max(m, +u.id.replace(/\D/g, '') || 0), 0) + 1}`;
  d.uniones.push({ id: nid, a: { estructuraId: estA.id, puerto: ptA0.id, s: r3(sGuardado) }, b: { estructuraId: estB.id, puerto: idB }, modo });
  return d;
}

export interface Snap {
  a: { estructuraId: string; puerto: string; s: number };
  b: { puerto: string };
  modo: Union['modo'];
  distancia: number;
  origen: V2;
  rumbo: number;
  etiqueta: string;
}

/** Mejor encastre para una estructura que se está arrastrando (fantasma). */
export function buscarSnap(diseno: Diseno, estructuraMovil: Estructura, punto: V2, opciones: { radio?: number; modo?: Union['modo']; catalogo?: Catalogo } = {}): Snap | null {
  const radio = opciones.radio ?? 2.5;
  const cat = opciones.catalogo || catalogoVacio();
  const gens = generarTodas(diseno, cat);
  const movil: Estructura = { ...clone(estructuraMovil), id: estructuraMovil.id || '__movil' };
  const cm = categoria(movil);
  let mejor: Snap | null = null;
  for (const est of diseno.estructuras) {
    if (est.id === movil.id) continue;
    const ce = categoria(est);
    for (const pt of gens.get(est.id)?.puertos || []) {
      let modo: Union['modo'] | null = null;
      if (cm === 'torre' && (pt.tipo === 'cara' || pt.tipo === 'extremo') && ce === 'fachada') modo = opciones.modo || 'vertical_compartida';
      else if (cm === 'portico' && pt.tipo === 'base' && ce === 'fachada') modo = 'apoyo';
      else if (cm === 'fachada' && pt.tipo === 'tope' && ce === 'portico') modo = 'apoyo';
      else if (cm === 'torre' && pt.tipo === 'cara' && ce !== 'fachada') modo = opciones.modo || 'vertical_compartida';
      if (!modo) continue;
      const t = Math.max(0, Math.min(pt.largo, (punto[0] - pt.p0[0]) * pt.d[0] + (punto[1] - pt.p0[2]) * pt.d[2]));
      const qx = pt.p0[0] + pt.d[0] * t;
      const qz = pt.p0[2] + pt.d[2] * t;
      const dist = Math.hypot(punto[0] - qx, punto[1] - qz);
      if (dist > radio || (mejor && dist >= mejor.distancia)) continue;
      const tmp: Diseno = { ...clone(diseno), estructuras: [...diseno.estructuras.filter((e) => e.id !== movil.id), movil] };
      const idB = puertoPorDefecto(movil, modo);
      const largoB = (puertosDe({ ...movil, origen: [0, 0], rumbo: 0 }, null, cat).find((x) => x.id === idB) || { largo: 0 }).largo;
      const s0 = t - largoB / 2;
      const unido = unir(tmp, { estructuraId: est.id, puerto: pt.id, s: s0 }, { estructuraId: movil.id, puerto: idB }, modo, cat);
      const em = unido.estructuras.find((e) => e.id === movil.id)!;
      const u = unido.uniones[unido.uniones.length - 1];
      mejor = { a: { estructuraId: est.id, puerto: pt.id, s: u?.a.s ?? s0 }, b: { puerto: idB }, modo, distancia: r3(dist), origen: em.origen, rumbo: em.rumbo, etiqueta: `${est.nombre} · ${pt.etiqueta}` };
    }
  }
  return mejor;
}
