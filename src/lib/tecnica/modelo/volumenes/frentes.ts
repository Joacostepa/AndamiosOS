/**
 * «Modelar arriba del volumen»: clic en una cara → una estructura con el largo, el ángulo y la altura de esa
 * cara, a la separación pedida. Con `seguir: 'contorno'` los frentes de la fachada siguen el contorno del
 * volumen (esquinas a 90°, convexas o entrantes) hasta una medianera o una esquina que no sea recta.
 * - Cara en planta baja → fachada (preset elegido).
 * - Cara elevada (retranqueo, la terraza del piso de abajo) → estructura libre apoyada en la terraza.
 * - Cara curva (cilindro, cúpula) → envolvente del volumen.
 * - Pared de un patio → patio interno.
 * Puro: devuelve una propuesta; `agregarEnCara` la suma al diseño.
 */
import type { Diseno, Esqueleto, V2, Volumen } from '../tipos.ts';
import { type Catalogo, catalogoVacio } from '../catalogo/catalogo.ts';
import { agregarEstructura, type OpcionesEstructura } from '../diseno.ts';
import { rellenarLargo } from '../medida/rellenar.ts';
import { cotasNiveles, grillaRect } from '../tipologias/comunes/grilla.ts';
import { clone, fmt, r3 } from '../util.ts';
import { carasDe } from './geometria.ts';
import type { Cara } from './tipos.ts';

export interface OpcionesCara {
  /** separación de la fachada a la línea de verticales interiores (default 0,20) */
  retiro?: number;
  profundidad?: number;
  /** altura por encima del tope de la cara (baranda del último nivel, default 1,00) */
  sobrepaso?: number;
  /** extensión más allá de cada punta libre (default 0) */
  extension?: number;
  seguir?: 'cara' | 'contorno';
  /** preset de fachada (default 'estructura') */
  preset?: string;
  nombre?: string;
}

export interface Propuesta {
  tipologia: string;
  preset: string;
  opciones: OpcionesEstructura;
  /** caras que cubre */
  caras: string[];
  avisos: string[];
  /** solo para la estructura libre sobre una terraza */
  esqueleto?: Esqueleto;
  tipo: 'fachada' | 'terraza' | 'envolvente' | 'patio';
}

const PISO = 0.3;
const norm180 = (a: number) => {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x <= -180 + 1e-9) x += 360;
  return r3(x);
};
const unit = (a: V2): V2 => {
  const L = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / L, a[1] / L];
};
function cruce(p: V2, u: V2, q: V2, v: V2): V2 | null {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const l = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [r3(p[0] + u[0] * l), r3(p[1] + u[1] * l)];
}

/** Todas las caras del contexto del diseño. */
export function carasDelDiseno(diseno: Diseno): Cara[] {
  const vols = diseno.contexto?.volumenes || [];
  return vols.flatMap((v) => carasDe(v, vols));
}

export function buscarCara(diseno: Diseno, caraId: string): Cara | undefined {
  return carasDelDiseno(diseno).find((c) => c.id === caraId);
}

/** Cadena de caras del mismo sólido que sigue el contorno (en el sentido de la fachada) desde una cara. */
export function cadenaContorno(diseno: Diseno, cara: Cara): Cara[] {
  const delSolido = carasDelDiseno(diseno).filter((c) => c.solidoId === cara.solidoId && c.tipo === 'pared');
  const porLado = new Map(delSolido.map((c) => [c.lado, c]));
  const n = Math.max(...delSolido.map((c) => c.lado)) + 1;
  const recta = (x: Cara, y: Cara) => [0, 90, -90].some((g) => Math.abs(norm180(x.rumbo - y.rumbo) - g) < 1);
  const out = [cara];
  const usados = new Set([cara.lado]);
  // hacia adelante (en el recorrido de la fachada el lado siguiente es el anterior del polígono)
  for (let cur = cara; ; ) {
    const sig = porLado.get((cur.lado - 1 + n) % n);
    if (!sig || usados.has(sig.lado) || sig.medianera || Math.abs(sig.yBase - cara.yBase) > 0.01 || !recta(cur, sig)) break;
    out.push(sig);
    usados.add(sig.lado);
    cur = sig;
  }
  for (let cur = cara; ; ) {
    const ant = porLado.get((cur.lado + 1) % n);
    if (!ant || usados.has(ant.lado) || ant.medianera || Math.abs(ant.yBase - cara.yBase) > 0.01 || !recta(ant, cur)) break;
    out.unshift(ant);
    usados.add(ant.lado);
    cur = ant;
  }
  return out;
}

/** Propuesta de estructura para una cara (no modifica el diseño). */
export function propuestaParaCara(diseno: Diseno, caraId: string, o: OpcionesCara = {}): Propuesta | null {
  const cara = buscarCara(diseno, caraId);
  if (!cara) return null;
  const vol = (diseno.contexto?.volumenes || []).find((v) => v.id === cara.volumenId) as Volumen;
  const retiro = r3(Math.max(0, o.retiro ?? 0.2));
  const prof = o.profundidad ?? 0.73;
  const sobre = o.sobrepaso ?? 1;
  const ext = Math.max(0, o.extension ?? 0);
  const avisos: string[] = [];
  const nombreBase = o.nombre || `${cara.tipo === 'patio' ? 'Patio' : 'Fachada'} · ${vol?.nombre || cara.volumenId}`;

  if (cara.tipo === 'curva') {
    return {
      tipo: 'envolvente', tipologia: 'envolvente', preset: 'envolvente_tanque', caras: [cara.id], avisos: ['Cara curva: propongo una envolvente alrededor de todo el volumen.'],
      opciones: { nombre: o.nombre || `Envolvente · ${vol?.nombre || cara.volumenId}`, origen: [0, 0], rumbo: 0, params: { planta: { tipo: 'volumen', volumenId: cara.volumenId }, offset: Math.max(0.05, retiro), profundidad: prof, altura: r3(cara.yTope - cara.yBase + sobre) } },
    };
  }

  if (cara.tipo === 'patio') {
    const lados = carasDelDiseno(diseno).filter((c) => c.solidoId === cara.solidoId);
    const vecino = lados.find((c) => c.lado === (cara.lado + 1) % lados.length);
    const largo = vecino ? vecino.largo : cara.largo;
    return {
      tipo: 'patio', tipologia: 'patio_interno', preset: 'patio_medianeras', caras: [cara.id], avisos: lados.length !== 4 ? ['El patio no es rectangular: tomé el muro elegido como fondo.'] : [],
      opciones: { nombre: nombreBase, origen: cara.b, rumbo: cara.rumbo, params: { ancho: cara.largo, largo, altura: r3(cara.yTope - cara.yBase + sobre), retiro, profundidad: prof } },
    };
  }

  const elevada = cara.yBase > PISO;
  const cadena = !elevada && o.seguir === 'contorno' ? cadenaContorno(diseno, cara) : [cara];
  if (elevada && o.seguir === 'contorno') avisos.push('Cara elevada: armé solo esta cara.');
  if (cara.medianera) avisos.push('Esa cara es medianera: revisá que se pueda trabajar desde el lado vecino.');
  // líneas interiores de la fachada (a la separación pedida)
  const lineas = cadena.map((c) => ({ c, p: [c.b[0] + c.normal[0] * retiro, c.b[1] + c.normal[1] * retiro] as V2, u: unit([c.a[0] - c.b[0], c.a[1] - c.b[1]]) }));
  const puntos: V2[] = [];
  puntos.push([r3(lineas[0].p[0] - lineas[0].u[0] * ext), r3(lineas[0].p[1] - lineas[0].u[1] * ext)]);
  for (let i = 1; i < lineas.length; i++) puntos.push(cruce(lineas[i - 1].p, lineas[i - 1].u, lineas[i].p, lineas[i].u) || [r3(lineas[i].p[0]), r3(lineas[i].p[1])]);
  const ult = lineas[lineas.length - 1];
  puntos.push([r3(ult.c.a[0] + ult.c.normal[0] * retiro + ult.u[0] * ext), r3(ult.c.a[1] + ult.c.normal[1] * retiro + ult.u[1] * ext)]);
  const suelo = elevada ? cara.yBase : 0;
  const altura = (y: number) => r3(y - suelo + sobre);
  // cada cara es un frente; si la altura cambia a lo largo de la cara, se parte en frentes alineados (ángulo 0)
  const frentes: Record<string, unknown>[] = [];
  const alturas: number[] = [];
  lineas.forEach((L, i) => {
    const d: V2 = [puntos[i + 1][0] - puntos[i][0], puntos[i + 1][1] - puntos[i][1]];
    const largo = r3(Math.max(0.5, d[0] * L.u[0] + d[1] * L.u[1]));
    const ang = i > 0 ? Math.round(norm180(lineas[i - 1].c.rumbo - L.c.rumbo)) : undefined;
    const segs = L.c.tramosAltura;
    if (!segs || segs.length < 2) {
      frentes.push({ largo, ...(ang !== undefined ? { angulo: ang } : {}) });
      alturas.push(altura(L.c.yTope));
      return;
    }
    // distancia, en el sentido de la fachada, desde el arranque del frente hasta cada corte de altura
    const uab = unit([L.c.b[0] - L.c.a[0], L.c.b[1] - L.c.a[1]]);
    const dist = (sDesdeA: number) => {
      const q: V2 = [L.c.a[0] + uab[0] * sDesdeA + L.c.normal[0] * retiro, L.c.a[1] + uab[1] * sDesdeA + L.c.normal[1] * retiro];
      return Math.min(largo, Math.max(0, (q[0] - puntos[i][0]) * L.u[0] + (q[1] - puntos[i][1]) * L.u[1]));
    };
    const orden = [...segs].sort((x, y) => y.desde - x.desde);
    let prev = 0;
    orden.forEach((g, j) => {
      const fin = j === orden.length - 1 ? largo : r3(dist(g.desde));
      const l = r3(fin - prev);
      if (l < 0.05) return;
      frentes.push({ largo: l, ...(j > 0 ? { angulo: 0 } : ang !== undefined ? { angulo: ang } : {}) });
      alturas.push(altura(g.yTope));
      prev = fin;
    });
  });
  const H = Math.max(...alturas);
  alturas.forEach((h, i) => {
    if (Math.abs(h - H) > 0.01) frentes[i].altura = h;
  });
  const opciones: OpcionesEstructura = { nombre: nombreBase, origen: puntos[0], rumbo: lineas[0].c.rumbo, params: { frentes, altura: H, retiro, profundidad: prof } };
  if (cadena.length > 1) avisos.push(`Sigo el contorno: ${cadena.length} caras con esquinas a 90°.`);
  if (frentes.length > cadena.length) avisos.push('La altura cambia a lo largo de la cara: la partí en frentes alineados de distinta altura.');
  if (!elevada) return { tipo: 'fachada', tipologia: 'fachada', preset: o.preset || 'estructura', opciones, caras: cadena.map((c) => c.id), avisos };

  // cara elevada: estructura libre apoyada en la terraza del retranqueo
  const largo = r3(frentes.reduce((acc, f) => acc + (f.largo as number), 0));
  const Hrel = r3(cara.yTope - cara.yBase + sobre);
  const cn = cotasNiveles({ altura: Hrel, base: cara.yBase });
  const tramos = rellenarLargo(largo, 'multi', { modo: 'catalogo' }).vanos;
  const g = grillaRect({ vanosS: tramos, profundidades: [prof], cotas: cn.cotas, plataformas: cn.plataformas, barandaEn: { interior: retiro > 0.3, exterior: true, laterales: true } });
  for (const c of g.esqueleto.columnas) c.ySuelo = cara.yBase;
  const ks = cn.plataformas.map((y) => g.b.k(y)).filter((k) => k >= 0);
  ks.forEach((k, j) => g.col.forEach((cc, i) => {
    if ((i + j) % 2 === 0 || i === 0 || i === g.col.length - 1) g.b.nodo(cc[0], k, { anclaje: { retiro: Math.max(0.15, retiro), dir: [0, -1] } });
  }));
  avisos.push(`La cara arranca a ${fmt(cara.yBase)} (retranqueo): la armé como estructura libre apoyada en la terraza. Verificá la losa.`);
  return { tipo: 'terraza', tipologia: 'libre', preset: 'libre_vacia', opciones: { nombre: o.nombre || `Terraza · ${vol?.nombre || cara.volumenId}`, origen: puntos[0], rumbo: lineas[0].c.rumbo }, caras: [cara.id], avisos, esqueleto: g.esqueleto };
}

/** Suma al diseño la estructura propuesta para una cara. */
export function agregarEnCara(diseno: Diseno, caraId: string, o: OpcionesCara = {}, catalogo: Catalogo = catalogoVacio()): { diseno: Diseno; estructuraId: string | null; avisos: string[]; propuesta: Propuesta | null } {
  const prop = propuestaParaCara(diseno, caraId, o);
  if (!prop) return { diseno, estructuraId: null, avisos: [`No encuentro la cara «${caraId}».`], propuesta: null };
  const r = agregarEstructura(diseno, prop.preset, prop.opciones, catalogo);
  if (prop.esqueleto) {
    const e = r.diseno.estructuras.find((x) => x.id === r.estructuraId)!;
    e.esqueleto = clone(prop.esqueleto);
  }
  return { diseno: r.diseno, estructuraId: r.estructuraId, avisos: prop.avisos, propuesta: prop };
}
