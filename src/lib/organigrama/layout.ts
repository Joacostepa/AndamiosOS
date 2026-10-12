// Layout del «Lienzo vivo» (docs/organigrama/propuesta.md § 7): dónde va cada caja y por dónde
// pasa cada conector. Puro: sin DOM, sin React. Lo usa el lienzo para animar con springs (cada
// cambio de estructura recalcula el layout y las cajas viajan de la posición vieja a la nueva).
//
// FORMA: árbol de arriba hacia abajo, pero híbrido, porque ABA es ancho y bajo:
//   - los primeros niveles (`nivelesHorizontales`, por defecto 1: la Dirección y sus áreas)
//     se abren en abanico horizontal, con conectores curvos (bezier);
//   - de ahí para abajo, los hijos van en LISTA vertical con sangría y un conector en codo
//     redondeado. Así un área con 7 puestos es una columna y no una fila de 1.500 px.
//
// Las coordenadas son del «mundo»: la cámara del lienzo las transforma con translate+scale.

import type { Nodo } from "./tipos.ts";

export type Punto = { x: number; y: number };
export type Caja = { x: number; y: number; w: number; h: number };

/**
 * rama: de abajo-centro del padre a arriba-centro del hijo (bezier).
 * lista: baja por la sangría del padre y dobla hacia el borde izquierdo del hijo (codo).
 */
export type Geometria =
  | { modo: "rama"; desde: Punto; hasta: Punto }
  | { modo: "lista"; desde: Punto; hasta: Punto; radio: number };

export type Arista = { de: string; a: string; geo: Geometria };

export type Limites = { minX: number; minY: number; maxX: number; maxY: number };

export type Layout = {
  cajas: Record<string, Caja>;
  aristas: Arista[];
  limites: Limites;
  /** Profundidad de cada nodo visible (0 = raíz). */
  profundidad: Record<string, number>;
  /** Cuántos nodos quedan escondidos debajo de cada nodo colapsado. */
  ocultos: Record<string, number>;
};

export type OpcionesLayout = {
  ancho: number;
  alto: number;
  /** Separación horizontal entre subárboles en abanico. */
  sepX: number;
  /** Separación vertical entre un padre en abanico y sus hijos. */
  sepY: number;
  /** Separación vertical entre filas de una lista. */
  sepLista: number;
  /** Sangría de cada nivel de lista. */
  sangria: number;
  nivelesHorizontales: number;
  colapsados?: ReadonlySet<string>;
};

export const OPCIONES_LAYOUT: OpcionesLayout = {
  ancho: 224,
  alto: 96,
  sepX: 40,
  sepY: 72,
  sepLista: 14,
  sangria: 28,
  nivelesHorizontales: 1,
};

function hijosOrdenados(porPadre: Map<string, Nodo[]>, clave: string): Nodo[] {
  return porPadre.get(clave) ?? [];
}

/** Calcula cajas y conectores. Tolera ciclos y padres inexistentes (los trata como raíces). */
export function calcularLayout(nodos: Nodo[], opciones: Partial<OpcionesLayout> = {}): Layout {
  const op = { ...OPCIONES_LAYOUT, ...opciones };
  const colapsados = op.colapsados ?? new Set<string>();
  const claves = new Set(nodos.map((n) => n.clave));
  const porPadre = new Map<string, Nodo[]>();
  const raices: Nodo[] = [];
  for (const n of nodos) {
    if (n.dependeDe && claves.has(n.dependeDe) && n.dependeDe !== n.clave) {
      const l = porPadre.get(n.dependeDe) ?? [];
      l.push(n);
      porPadre.set(n.dependeDe, l);
    } else raices.push(n);
  }
  for (const l of porPadre.values()) l.sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
  raices.sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));

  const medidas = new Map<string, { w: number; h: number }>();
  const ocultos: Record<string, number> = {};
  const enCamino = new Set<string>();

  const contarDebajo = (clave: string, vistos: Set<string>): number => {
    let total = 0;
    for (const h of hijosOrdenados(porPadre, clave)) {
      if (vistos.has(h.clave)) continue;
      vistos.add(h.clave);
      total += 1 + contarDebajo(h.clave, vistos);
    }
    return total;
  };

  // Los hijos «visibles»: sin los que cerrarían un ciclo y vacío si el nodo está colapsado.
  const visibles = (clave: string): Nodo[] => {
    if (colapsados.has(clave)) return [];
    return hijosOrdenados(porPadre, clave).filter((h) => !enCamino.has(h.clave));
  };

  const medir = (n: Nodo, nivel: number): { w: number; h: number } => {
    enCamino.add(n.clave);
    if (colapsados.has(n.clave)) {
      const debajo = contarDebajo(n.clave, new Set([n.clave]));
      if (debajo) ocultos[n.clave] = debajo;
    }
    const hs = visibles(n.clave);
    let m = { w: op.ancho, h: op.alto };
    if (hs.length) {
      const ms = hs.map((h) => medir(h, nivel + 1));
      if (nivel < op.nivelesHorizontales) {
        const total = ms.reduce((s, x) => s + x.w, 0) + op.sepX * (ms.length - 1);
        m = { w: Math.max(op.ancho, total), h: op.alto + op.sepY + Math.max(...ms.map((x) => x.h)) };
      } else {
        m = {
          w: Math.max(op.ancho, op.sangria + Math.max(...ms.map((x) => x.w))),
          h: op.alto + ms.reduce((s, x) => s + op.sepLista + x.h, 0),
        };
      }
    }
    medidas.set(n.clave, m);
    enCamino.delete(n.clave);
    return m;
  };

  const cajas: Record<string, Caja> = {};
  const profundidad: Record<string, number> = {};
  const aristas: Arista[] = [];

  const ubicar = (n: Nodo, nivel: number, izq: number, arriba: number) => {
    enCamino.add(n.clave);
    const m = medidas.get(n.clave)!;
    const hs = visibles(n.clave).filter((h) => medidas.has(h.clave));
    const horizontal = nivel < op.nivelesHorizontales;
    const x = horizontal ? izq + (m.w - op.ancho) / 2 : izq;
    cajas[n.clave] = { x, y: arriba, w: op.ancho, h: op.alto };
    profundidad[n.clave] = nivel;
    if (horizontal) {
      const total = hs.reduce((s, h) => s + medidas.get(h.clave)!.w, 0) + op.sepX * Math.max(0, hs.length - 1);
      let cx = izq + (m.w - total) / 2;
      const y = arriba + op.alto + op.sepY;
      for (const h of hs) {
        const mh = medidas.get(h.clave)!;
        ubicar(h, nivel + 1, cx, y);
        const ch = cajas[h.clave];
        aristas.push({
          de: n.clave,
          a: h.clave,
          geo: { modo: "rama", desde: { x: x + op.ancho / 2, y: arriba + op.alto }, hasta: { x: ch.x + ch.w / 2, y: ch.y } },
        });
        cx += mh.w + op.sepX;
      }
    } else {
      let y = arriba + op.alto + op.sepLista;
      for (const h of hs) {
        const mh = medidas.get(h.clave)!;
        ubicar(h, nivel + 1, izq + op.sangria, y);
        const ch = cajas[h.clave];
        aristas.push({
          de: n.clave,
          a: h.clave,
          geo: {
            modo: "lista",
            desde: { x: x + op.sangria / 2, y: arriba + op.alto },
            hasta: { x: ch.x, y: ch.y + ch.h / 2 },
            radio: Math.min(10, op.sangria / 2),
          },
        });
        y += mh.h + op.sepLista;
      }
    }
    enCamino.delete(n.clave);
  };

  // Varias raíces (no debería pasar) van una al lado de la otra.
  const ms = raices.map((r) => medir(r, 0));
  const total = ms.reduce((s, x) => s + x.w, 0) + op.sepX * Math.max(0, ms.length - 1);
  let izq = -total / 2;
  raices.forEach((r, i) => {
    ubicar(r, 0, izq, 0);
    izq += ms[i].w + op.sepX;
  });

  return { cajas, aristas, limites: limitesDe(Object.values(cajas)), profundidad, ocultos };
}

export function limitesDe(cajas: Caja[]): Limites {
  if (!cajas.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...cajas.map((c) => c.x)),
    minY: Math.min(...cajas.map((c) => c.y)),
    maxX: Math.max(...cajas.map((c) => c.x + c.w)),
    maxY: Math.max(...cajas.map((c) => c.y + c.h)),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * El `d` del conector. SIEMPRE con la misma estructura de comandos para cada modo, así motion
 * puede interpolar un conector viejo con el nuevo (el conector «viaja» con la caja).
 */
export function rutaSvg(geo: Geometria): string {
  const { desde: a, hasta: b } = geo;
  if (geo.modo === "rama") {
    const ym = (a.y + b.y) / 2;
    return `M ${r1(a.x)} ${r1(a.y)} C ${r1(a.x)} ${r1(ym)} ${r1(b.x)} ${r1(ym)} ${r1(b.x)} ${r1(b.y)}`;
  }
  const r = Math.max(0, Math.min(geo.radio, Math.abs(b.y - a.y), Math.abs(b.x - a.x)));
  return `M ${r1(a.x)} ${r1(a.y)} L ${r1(a.x)} ${r1(b.y - r)} Q ${r1(a.x)} ${r1(b.y)} ${r1(a.x + r)} ${r1(b.y)} L ${r1(b.x)} ${r1(b.y)}`;
}

function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Puntos a lo largo del conector, del padre al hijo (incluye los dos extremos). */
export function puntosDeArista(geo: Geometria, pasos = 8): Punto[] {
  const { desde: a, hasta: b } = geo;
  const fuera: Punto[] = [];
  if (geo.modo === "rama") {
    const ym = (a.y + b.y) / 2;
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      fuera.push({ x: bezier(a.x, a.x, b.x, b.x, t), y: bezier(a.y, ym, ym, b.y, t) });
    }
    return fuera;
  }
  // Codo: tramo vertical y tramo horizontal (la curvita del radio no se nota a esta escala).
  const codo = { x: a.x, y: b.y };
  const mitad = Math.max(1, Math.floor(pasos / 2));
  for (let i = 0; i <= mitad; i++) fuera.push({ x: a.x, y: a.y + ((codo.y - a.y) * i) / mitad });
  for (let i = 1; i <= mitad; i++) fuera.push({ x: codo.x + ((b.x - codo.x) * i) / mitad, y: b.y });
  return fuera;
}

/**
 * El recorrido POR LOS CONECTORES de la caja `de` a la caja `a`: sube hasta el ancestro común y
 * baja. Arranca y termina en el centro de cada caja. Sirve para el «papelito» de Seguí el papel.
 */
export function rutaEntre(layout: Layout, nodos: Nodo[], de: string, a: string): Punto[] {
  const padre = new Map(nodos.map((n) => [n.clave, n.dependeDe]));
  const cadena = (clave: string) => {
    const fuera = [clave];
    const vistos = new Set(fuera);
    let p = padre.get(clave) ?? null;
    while (p && !vistos.has(p)) {
      fuera.push(p);
      vistos.add(p);
      p = padre.get(p) ?? null;
    }
    return fuera;
  };
  const centro = (clave: string): Punto | null => {
    const c = layout.cajas[clave];
    return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : null;
  };
  const inicio = centro(de);
  const fin = centro(a);
  if (!inicio || !fin) return [];
  if (de === a) return [inicio, fin];
  const subida = cadena(de);
  const bajada = cadena(a);
  const comun = subida.find((c) => bajada.includes(c));
  const arista = (padreClave: string, hijo: string) => layout.aristas.find((x) => x.de === padreClave && x.a === hijo);
  const puntos: Punto[] = [inicio];
  if (comun) {
    for (let i = 0; i < subida.indexOf(comun); i++) {
      const ar = arista(subida[i + 1], subida[i]);
      if (ar) puntos.push(...puntosDeArista(ar.geo).reverse());
    }
    const bajan = bajada.slice(0, bajada.indexOf(comun)).reverse();
    let anterior = comun;
    for (const h of bajan) {
      const ar = arista(anterior, h);
      if (ar) puntos.push(...puntosDeArista(ar.geo));
      anterior = h;
    }
  }
  puntos.push(fin);
  // Sin puntos repetidos seguidos (los extremos de aristas consecutivas coinciden).
  return puntos.filter((p, i) => i === 0 || Math.hypot(p.x - puntos[i - 1].x, p.y - puntos[i - 1].y) > 0.5);
}

// ── Cámara ───────────────────────────────────────────────────────────────────

/** La cámara: el mundo se dibuja en pantalla como `pantalla = mundo * k + (x, y)`. */
export type Camara = { x: number; y: number; k: number };

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.2;

export function acotar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * La cámara que encuadra `limites` dentro de un área visible de `ancho`×`alto` (con margen).
 * `area` permite reservar lugar (p. ej. la hoja lateral o la tarjeta del recorrido): se encuadra
 * dentro del rectángulo {x, y, w, h} de la pantalla.
 */
export function encuadrar(
  limites: Limites,
  area: { x: number; y: number; w: number; h: number },
  margen = 40,
  kMax = 1.2,
): Camara {
  const w = Math.max(1, limites.maxX - limites.minX);
  const h = Math.max(1, limites.maxY - limites.minY);
  const k = acotar(Math.min((area.w - margen * 2) / w, (area.h - margen * 2) / h), ZOOM_MIN, kMax);
  const cx = (limites.minX + limites.maxX) / 2;
  const cy = (limites.minY + limites.maxY) / 2;
  return { k, x: area.x + area.w / 2 - cx * k, y: area.y + area.h / 2 - cy * k };
}

/** Zoom por `factor` dejando quieto el punto de pantalla `foco` (rueda, pinch, botones). */
export function zoomHacia(cam: Camara, factor: number, foco: Punto): Camara {
  const k = acotar(cam.k * factor, ZOOM_MIN, ZOOM_MAX);
  const real = k / cam.k;
  return { k, x: foco.x - (foco.x - cam.x) * real, y: foco.y - (foco.y - cam.y) * real };
}

/** La cámara que pone el punto del mundo `p` en el punto de pantalla `destino`. */
export function centrar(p: Punto, destino: Punto, k: number): Camara {
  return { k, x: destino.x - p.x * k, y: destino.y - p.y * k };
}

/** Lo que hay que correr TODO el layout para que `clave` quede donde estaba en `antes`. */
export function desplazamientoAncla(antes: Layout, despues: Layout, clave: string): Punto {
  const a = antes.cajas[clave];
  const d = despues.cajas[clave];
  if (!a || !d) return { x: 0, y: 0 };
  return { x: a.x - d.x, y: a.y - d.y };
}

/** Corre todas las cajas y conectores de un layout (para anclar la vista previa). */
export function desplazar(layout: Layout, dx: number, dy: number): Layout {
  if (!dx && !dy) return layout;
  const mov = (p: Punto) => ({ x: p.x + dx, y: p.y + dy });
  const cajas: Record<string, Caja> = {};
  for (const [k, c] of Object.entries(layout.cajas)) cajas[k] = { ...c, x: c.x + dx, y: c.y + dy };
  return {
    ...layout,
    cajas,
    aristas: layout.aristas.map((a) => ({ ...a, geo: { ...a.geo, desde: mov(a.geo.desde), hasta: mov(a.geo.hasta) } })),
    limites: {
      minX: layout.limites.minX + dx,
      maxX: layout.limites.maxX + dx,
      minY: layout.limites.minY + dy,
      maxY: layout.limites.maxY + dy,
    },
  };
}

/** Los límites del subárbol de `clave` (él y todo lo visible debajo). */
export function limitesDeRama(layout: Layout, nodos: Nodo[], clave: string): Limites {
  const debajo = new Set([clave]);
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const n of nodos) {
      if (n.dependeDe && debajo.has(n.dependeDe) && !debajo.has(n.clave)) {
        debajo.add(n.clave);
        crecio = true;
      }
    }
  }
  return limitesDe([...debajo].map((c) => layout.cajas[c]).filter(Boolean));
}
