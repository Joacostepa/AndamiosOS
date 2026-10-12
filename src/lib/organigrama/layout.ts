// Layout del «Lienzo vivo» (docs/organigrama/propuesta.md § 7): dónde va cada caja y por dónde
// pasa cada conector. Puro: sin DOM, sin React. Lo usa el lienzo para animar con springs (cada
// cambio de estructura recalcula el layout y las cajas viajan de la posición vieja a la nueva).
//
// DOS FORMAS (opción `forma`), las dos de arriba hacia abajo:
//   - los primeros niveles (`nivelesHorizontales`, por defecto 1: la Dirección y sus áreas)
//     se abren siempre en abanico horizontal, con conectores curvos (bezier);
//   - «lista»: de ahí para abajo, los hijos van en LISTA vertical con sangría y un conector en
//     codo redondeado. Así un área con 7 puestos es una columna y no una fila de 1.500 px;
//   - «arbol»: de ahí para abajo, los hijos se abren debajo del padre como en un organigrama
//     clásico (bajada, bus horizontal, bajada a cada hijo). Árbol compacto, no puro: si un nodo
//     tiene más de `filaMax` hijos, van en una GRILLA de `columnas` columnas (más si quedarían
//     más de `filasMax` filas), con un tronco que baja por el hueco entre columnas y un bus por
//     fila. La última fila incompleta va centrada. Las subáreas van después de los puestos, en
//     filas propias. Profundidad arbitraria.
//
// JERARQUÍA: cada clase de caja (Dirección, área, subárea, puesto) tiene su tamaño
// (`tamanos`). Y cada área es un GRUPO (`grupos`): en el árbol, un recuadro que la encierra con
// todo lo suyo (con `margenGrupo` de aire, reservado en el layout; las subáreas quedan
// anidadas); en la lista, una franja de su color por la sangría. Los conectores que corren
// dentro de un grupo llevan `grupo` (se pintan con el color del área).
//
// Los conectores en codo de las dos formas se dibujan con la MISMA estructura de comandos
// (`rutaSvg`), así al cambiar de forma motion interpola cada conector del viejo al nuevo.
//
// Las coordenadas son del «mundo»: la cámara del lienzo las transforma con translate+scale.

import type { Nodo } from "./tipos.ts";

export type Punto = { x: number; y: number };
export type Caja = { x: number; y: number; w: number; h: number };

export type FormaLayout = "lista" | "arbol";

/**
 * rama: de abajo-centro del padre a arriba-centro del hijo (bezier).
 * lista: baja por la sangría del padre y dobla hacia el borde izquierdo del hijo (codo).
 * arbol: baja del padre hasta el `bus` (y), corre hasta el `tronco` (x), baja por el tronco
 *   hasta el bus de su `fila` (y), corre hasta encima del hijo y baja a su borde de arriba. En la
 *   primera fila, `tronco` = x del padre y `fila` = `bus` (esos tramos miden cero).
 */
export type Geometria =
  | { modo: "rama"; desde: Punto; hasta: Punto }
  | { modo: "lista"; desde: Punto; hasta: Punto; radio: number }
  | { modo: "arbol"; desde: Punto; hasta: Punto; bus: number; tronco: number; fila: number; radio: number };

export type Arista = {
  de: string;
  a: string;
  geo: Geometria;
  /** El área (recuadro de grupo) dentro de la que corre el conector: se pinta con su color. */
  grupo?: string;
};

export type Limites = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Las cuatro clases de caja, de más a menos peso: la Dirección, un área (cuelga de la Dirección),
 * una subárea (un área que cuelga de otra área o de un puesto) y un puesto. Cada una tiene su
 * tamaño: la jerarquía se ve sin leer.
 */
export type ClaseCaja = "direccion" | "area" | "subarea" | "puesto";

/**
 * Árbol: el RECUADRO que encierra a un área y a todo lo que cuelga de ella (las subáreas quedan
 * anidadas adentro). Lista: la FRANJA vertical del color del área que corre por la sangría,
 * debajo de su tarjeta. `nivel` = cuántos grupos lo encierran (0 = un área de la Dirección).
 */
export type Grupo = { clave: string; caja: Caja; nivel: number; forma: FormaLayout };

export type Layout = {
  cajas: Record<string, Caja>;
  aristas: Arista[];
  /** Los grupos de las áreas, de afuera hacia adentro (los anidados después: quedan encima). */
  grupos: Grupo[];
  limites: Limites;
  /** Profundidad de cada nodo visible (0 = raíz). */
  profundidad: Record<string, number>;
  /** Cuántos nodos quedan escondidos debajo de cada nodo colapsado. */
  ocultos: Record<string, number>;
};

export type Tamano = { w: number; h: number };

export type OpcionesLayout = {
  /** El tamaño de cada clase de caja. */
  tamanos: Record<ClaseCaja, Tamano>;
  /** Separación horizontal entre subárboles en abanico. */
  sepX: number;
  /** Separación vertical entre un padre en abanico y sus hijos. */
  sepY: number;
  /** Separación vertical entre filas de una lista. */
  sepLista: number;
  /** Sangría de cada nivel de lista. */
  sangria: number;
  nivelesHorizontales: number;
  /** Debajo de los niveles en abanico: lista con sangría o árbol compacto. */
  forma: FormaLayout;
  /** Árbol: separación horizontal entre hermanos (y entre columnas de la grilla). */
  sepXArbol: number;
  /** Árbol: separación vertical entre un padre y su primera fila de hijos. */
  sepYArbol: number;
  /** Árbol: separación vertical entre filas de la grilla. */
  sepFila: number;
  /** Árbol: hasta cuántos hijos van en una sola fila. */
  filaMax: number;
  /** Árbol: columnas de la grilla cuando hay más de `filaMax` hijos. */
  columnas: number;
  /** Árbol: si con `columnas` quedarían más filas que esto, se agregan columnas. */
  filasMax: number;
  /** Árbol: el aire entre el recuadro de un área y lo que encierra. */
  margenGrupo: number;
  colapsados?: ReadonlySet<string>;
};

export const OPCIONES_LAYOUT: OpcionesLayout = {
  tamanos: {
    direccion: { w: 312, h: 132 },
    area: { w: 264, h: 128 },
    subarea: { w: 236, h: 116 },
    puesto: { w: 208, h: 78 },
  },
  sepX: 40,
  sepY: 72,
  sepLista: 12,
  sangria: 28,
  nivelesHorizontales: 1,
  forma: "lista",
  sepXArbol: 16,
  sepYArbol: 44,
  sepFila: 28,
  filaMax: 3,
  columnas: 2,
  filasMax: 4,
  margenGrupo: 14,
};

/** La clase de caja de un nodo según su tipo y su padre: un área que no cuelga de la raíz es subárea. */
export function claseCaja(n: Nodo, padre: Nodo | undefined): ClaseCaja {
  if (n.tipo === "puesto") return "puesto";
  if (n.tipo === "direccion" || !padre) return "direccion";
  return padre.dependeDe === null || padre.tipo === "direccion" ? "area" : "subarea";
}

/** Cuántas columnas usa el árbol para `n` hijos (una sola fila si son pocos). */
export function columnasArbol(n: number, op: Pick<OpcionesLayout, "filaMax" | "columnas" | "filasMax"> = OPCIONES_LAYOUT): number {
  if (n <= op.filaMax) return Math.max(1, n);
  return Math.min(n, Math.max(op.columnas, Math.ceil(n / Math.max(1, op.filasMax))));
}

/**
 * Los hijos de un nodo en el árbol, por filas: primero los PUESTOS en grilla (columnas de ancho
 * común) y después las SUBÁREAS en filas propias (cada recuadro con su ancho). Así un recuadro
 * grande no ensancha una columna de puestos ni queda mezclado entre ellos.
 */
type FilaGrilla = { nodos: Nodo[]; anchos: number[]; w: number; h: number };
type Grilla = { filas: FilaGrilla[]; w: number; h: number; colW: number[]; wPuestos: number };

function hijosOrdenados(porPadre: Map<string, Nodo[]>, clave: string): Nodo[] {
  return porPadre.get(clave) ?? [];
}

const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Calcula cajas, conectores y grupos. Tolera ciclos y padres inexistentes (los trata como raíces). */
export function calcularLayout(nodos: Nodo[], opciones: Partial<OpcionesLayout> = {}): Layout {
  const op = { ...OPCIONES_LAYOUT, ...opciones };
  const colapsados = op.colapsados ?? new Set<string>();
  const porClave = new Map(nodos.map((n) => [n.clave, n]));
  const porPadre = new Map<string, Nodo[]>();
  const raices: Nodo[] = [];
  for (const n of nodos) {
    if (n.dependeDe && porClave.has(n.dependeDe) && n.dependeDe !== n.clave) {
      const l = porPadre.get(n.dependeDe) ?? [];
      l.push(n);
      porPadre.set(n.dependeDe, l);
    } else raices.push(n);
  }
  for (const l of porPadre.values()) l.sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
  raices.sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));

  const tam = (n: Nodo, nivel: number): Tamano => op.tamanos[nivel === 0 ? "direccion" : claseCaja(n, porClave.get(n.dependeDe ?? ""))];
  // Cada área (no la raíz) es un grupo; en el árbol, un recuadro con margen alrededor de lo suyo.
  const esGrupo = (n: Nodo, nivel: number) => nivel > 0 && n.tipo !== "puesto";
  const margen = (n: Nodo, nivel: number) => (op.forma === "arbol" && esGrupo(n, nivel) ? op.margenGrupo : 0);

  const medidas = new Map<string, Tamano>();
  const grillas = new Map<string, Grilla>();
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

  // Medidas EXTERIORES (con el margen del recuadro, si es un grupo del árbol).
  const medir = (n: Nodo, nivel: number): Tamano => {
    enCamino.add(n.clave);
    if (colapsados.has(n.clave)) {
      const debajo = contarDebajo(n.clave, new Set([n.clave]));
      if (debajo) ocultos[n.clave] = debajo;
    }
    const t = tam(n, nivel);
    const hs = visibles(n.clave);
    let m = { w: t.w, h: t.h };
    if (hs.length) {
      const ms = new Map(hs.map((h) => [h.clave, medir(h, nivel + 1)] as const));
      const de = (h: Nodo) => ms.get(h.clave)!;
      if (nivel < op.nivelesHorizontales) {
        const total = suma(hs.map((h) => de(h).w)) + op.sepX * (hs.length - 1);
        m = { w: Math.max(t.w, total), h: t.h + op.sepY + Math.max(...hs.map((h) => de(h).h)) };
      } else if (op.forma === "arbol") {
        const puestos = hs.filter((h) => !esGrupo(h, nivel + 1));
        const areas = hs.filter((h) => esGrupo(h, nivel + 1));
        const cols = columnasArbol(puestos.length, op);
        const trozos: Nodo[][] = [];
        for (let i = 0; i < puestos.length; i += cols) trozos.push(puestos.slice(i, i + cols));
        const colW = Array.from({ length: puestos.length ? cols : 0 }, (_, c) => Math.max(0, ...trozos.map((f) => (f[c] ? de(f[c]).w : 0))));
        const filas: FilaGrilla[] = trozos.map((f) => {
          const anchos = colW.slice(0, f.length);
          return { nodos: f, anchos, w: suma(anchos) + op.sepXArbol * (f.length - 1), h: Math.max(...f.map((h) => de(h).h)) };
        });
        const colsAreas = columnasArbol(areas.length, op);
        for (let i = 0; i < areas.length; i += colsAreas) {
          const f = areas.slice(i, i + colsAreas);
          const anchos = f.map((h) => de(h).w);
          filas.push({ nodos: f, anchos, w: suma(anchos) + op.sepXArbol * (f.length - 1), h: Math.max(...f.map((h) => de(h).h)) });
        }
        const wPuestos = colW.length ? suma(colW) + op.sepXArbol * (colW.length - 1) : 0;
        const g: Grilla = {
          filas,
          colW,
          wPuestos,
          w: Math.max(wPuestos, ...filas.map((f) => f.w)),
          h: suma(filas.map((f) => f.h)) + op.sepFila * (filas.length - 1),
        };
        grillas.set(n.clave, g);
        m = { w: Math.max(t.w, g.w), h: t.h + op.sepYArbol + g.h };
      } else {
        m = {
          w: Math.max(t.w, op.sangria + Math.max(...hs.map((h) => de(h).w))),
          h: t.h + suma(hs.map((h) => op.sepLista + de(h).h)),
        };
      }
    }
    const mg = margen(n, nivel);
    m = { w: m.w + mg * 2, h: m.h + mg * 2 };
    medidas.set(n.clave, m);
    enCamino.delete(n.clave);
    return m;
  };

  const cajas: Record<string, Caja> = {};
  const profundidad: Record<string, number> = {};
  const aristas: Arista[] = [];
  const grupos: Grupo[] = [];

  /** `grupo`: el área cuyo grupo encierra a `n` (los conectores de adentro llevan su color). */
  const ubicar = (n: Nodo, nivel: number, izqExt: number, arribaExt: number, grupo: string | undefined, nivelGrupo: number) => {
    enCamino.add(n.clave);
    const mExt = medidas.get(n.clave)!;
    const mg = margen(n, nivel);
    const izq = izqExt + mg;
    const arriba = arribaExt + mg;
    const m = { w: mExt.w - mg * 2, h: mExt.h - mg * 2 };
    const t = tam(n, nivel);
    const hs = visibles(n.clave).filter((h) => medidas.has(h.clave));
    const horizontal = nivel < op.nivelesHorizontales;
    const arbol = !horizontal && op.forma === "arbol";
    const x = horizontal || arbol ? izq + (m.w - t.w) / 2 : izq;
    cajas[n.clave] = { x, y: arriba, w: t.w, h: t.h };
    profundidad[n.clave] = nivel;
    const grupal = esGrupo(n, nivel);
    const grupoHijos = grupal ? n.clave : grupo;
    const nivelHijos = grupal ? nivelGrupo + 1 : nivelGrupo;
    if (grupal) {
      grupos.push(
        op.forma === "arbol"
          ? { clave: n.clave, caja: { x: izqExt, y: arribaExt, w: mExt.w, h: mExt.h }, nivel: nivelGrupo, forma: "arbol" }
          : // Lista: la franja corre por la sangría, de la tarjeta hasta el último de abajo.
            { clave: n.clave, caja: { x: x + op.sangria / 2 - 1.5, y: arriba + t.h, w: 3, h: Math.max(0, m.h - t.h) }, nivel: nivelGrupo, forma: "lista" },
      );
    }
    const enGrupo = grupoHijos ? { grupo: grupoHijos } : {};
    if (horizontal) {
      const total = suma(hs.map((h) => medidas.get(h.clave)!.w)) + op.sepX * Math.max(0, hs.length - 1);
      let cx = izq + (m.w - total) / 2;
      const y = arriba + t.h + op.sepY;
      for (const h of hs) {
        const mh = medidas.get(h.clave)!;
        ubicar(h, nivel + 1, cx, y, grupoHijos, nivelHijos);
        const ch = cajas[h.clave];
        aristas.push({
          de: n.clave,
          a: h.clave,
          geo: { modo: "rama", desde: { x: x + t.w / 2, y: arriba + t.h }, hasta: { x: ch.x + ch.w / 2, y: ch.y } },
          ...enGrupo,
        });
        cx += mh.w + op.sepX;
      }
    } else if (arbol) {
      const g = grillas.get(n.clave);
      if (g && hs.length) {
        const izqGrilla = izq + (m.w - g.w) / 2;
        const desde = { x: x + t.w / 2, y: arriba + t.h };
        const bus = arriba + t.h + op.sepYArbol / 2;
        // El tronco baja por el hueco entre las columnas del medio de los puestos: nunca cruza
        // una caja. Sin grilla de varias columnas, baja por el centro.
        const cols = g.colW.length;
        const medio = Math.max(1, Math.floor(cols / 2));
        const izqPuestos = izqGrilla + (g.w - g.wPuestos) / 2;
        const tronco = cols > 1 ? izqPuestos + suma(g.colW.slice(0, medio)) + op.sepXArbol * (medio - 1) + op.sepXArbol / 2 : desde.x;
        let y = arriba + t.h + op.sepYArbol;
        g.filas.forEach((fila, r) => {
          // Cada fila va centrada (la última de puestos, si queda incompleta, también).
          let cx = izqGrilla + (g.w - fila.w) / 2;
          const busFila = r === 0 ? bus : y - op.sepFila / 2;
          fila.nodos.forEach((h, c) => {
            const mh = medidas.get(h.clave);
            if (mh) {
              ubicar(h, nivel + 1, cx + (fila.anchos[c] - mh.w) / 2, y, grupoHijos, nivelHijos);
              const ch = cajas[h.clave];
              aristas.push({
                de: n.clave,
                a: h.clave,
                geo: { modo: "arbol", desde, hasta: { x: ch.x + ch.w / 2, y: ch.y }, bus, tronco: r === 0 ? desde.x : tronco, fila: busFila, radio: 8 },
                ...enGrupo,
              });
            }
            cx += fila.anchos[c] + op.sepXArbol;
          });
          y += fila.h + op.sepFila;
        });
      }
    } else {
      let y = arriba + t.h + op.sepLista;
      for (const h of hs) {
        const mh = medidas.get(h.clave)!;
        ubicar(h, nivel + 1, izq + op.sangria, y, grupoHijos, nivelHijos);
        const ch = cajas[h.clave];
        aristas.push({
          de: n.clave,
          a: h.clave,
          geo: {
            modo: "lista",
            desde: { x: x + op.sangria / 2, y: arriba + t.h },
            hasta: { x: ch.x, y: ch.y + ch.h / 2 },
            radio: Math.min(10, op.sangria / 2),
          },
          ...enGrupo,
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
    ubicar(r, 0, izq, 0, undefined, 0);
    izq += ms[i].w + op.sepX;
  });

  // De afuera hacia adentro: los recuadros anidados se pintan (y reciben el puntero) encima.
  grupos.sort((a, b) => a.nivel - b.nivel);
  return {
    cajas,
    aristas,
    grupos,
    limites: limitesDe([...Object.values(cajas), ...grupos.map((g) => g.caja)]),
    profundidad,
    ocultos,
  };
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

/** La familia de un conector: dos conectores de la misma familia se pueden interpolar. */
export function familiaGeo(geo: Geometria): "rama" | "codo" {
  return geo.modo === "rama" ? "rama" : "codo";
}

/**
 * Los SEIS vértices de un conector en codo (lista o árbol), del padre al hijo. Siempre seis
 * (algunos repetidos), así lista y árbol comparten la forma del `d` y se pueden interpolar.
 */
export function verticesCodo(geo: Exclude<Geometria, { modo: "rama" }>): Punto[] {
  const { desde: a, hasta: b } = geo;
  if (geo.modo === "lista") return [a, a, a, { x: a.x, y: b.y }, b, b];
  return [a, { x: a.x, y: geo.bus }, { x: geo.tronco, y: geo.bus }, { x: geo.tronco, y: geo.fila }, { x: b.x, y: geo.fila }, b];
}

/** La geometría de un conector recién nacido: todo concentrado en el padre (crece desde ahí). */
export function geometriaNaciente(geo: Geometria): Geometria {
  const a = geo.desde;
  if (geo.modo === "arbol") return { ...geo, hasta: a, bus: a.y, tronco: a.x, fila: a.y };
  return { ...geo, hasta: a };
}

/**
 * El `d` del conector. SIEMPRE con la misma estructura de comandos para cada familia, así motion
 * puede interpolar un conector viejo con el nuevo (el conector «viaja» con la caja, y al cambiar
 * de lista a árbol se transforma). Codo: `M` + 4 × (`L` `Q`) + `L`; las esquinas se redondean
 * con `radio` (sin pasarse de la mitad de un tramo que tiene otra esquina en la otra punta).
 */
export function rutaSvg(geo: Geometria): string {
  const { desde: a, hasta: b } = geo;
  if (geo.modo === "rama") {
    const ym = (a.y + b.y) / 2;
    return `M ${r1(a.x)} ${r1(a.y)} C ${r1(a.x)} ${r1(ym)} ${r1(b.x)} ${r1(ym)} ${r1(b.x)} ${r1(b.y)}`;
  }
  const v = verticesCodo(geo);
  const largo = (i: number) => Math.hypot(v[i + 1].x - v[i].x, v[i + 1].y - v[i].y);
  // Una esquina de verdad: los dos tramos miden algo y no siguen la misma dirección.
  const esquina = (i: number) => {
    if (i <= 0 || i >= v.length - 1) return false;
    const l1 = largo(i - 1);
    const l2 = largo(i);
    if (l1 < 0.01 || l2 < 0.01) return false;
    const cruz = (v[i].x - v[i - 1].x) * (v[i + 1].y - v[i].y) - (v[i].y - v[i - 1].y) * (v[i + 1].x - v[i].x);
    return Math.abs(cruz) > 0.01 * l1 * l2;
  };
  let d = `M ${r1(v[0].x)} ${r1(v[0].y)}`;
  for (let i = 1; i < v.length - 1; i++) {
    const p = v[i];
    let r = 0;
    let uin = { x: 0, y: 0 };
    let uout = { x: 0, y: 0 };
    if (esquina(i)) {
      const l1 = largo(i - 1);
      const l2 = largo(i);
      r = Math.min(geo.radio, esquina(i - 1) ? l1 / 2 : l1, esquina(i + 1) ? l2 / 2 : l2);
      uin = { x: (p.x - v[i - 1].x) / l1, y: (p.y - v[i - 1].y) / l1 };
      uout = { x: (v[i + 1].x - p.x) / l2, y: (v[i + 1].y - p.y) / l2 };
    }
    d += ` L ${r1(p.x - uin.x * r)} ${r1(p.y - uin.y * r)} Q ${r1(p.x)} ${r1(p.y)} ${r1(p.x + uout.x * r)} ${r1(p.y + uout.y * r)}`;
  }
  const z = v[v.length - 1];
  return `${d} L ${r1(z.x)} ${r1(z.y)}`;
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
  // Codo (lista o árbol): por los tramos rectos (la curvita del radio no se nota a esta escala).
  const v = verticesCodo(geo).filter((p, i, t) => i === 0 || Math.hypot(p.x - t[i - 1].x, p.y - t[i - 1].y) > 0.01);
  if (v.length < 2) return [a, b];
  const mitad = Math.max(1, Math.floor(pasos / 2));
  fuera.push(v[0]);
  for (let s = 1; s < v.length; s++)
    for (let i = 1; i <= mitad; i++) fuera.push({ x: v[s - 1].x + ((v[s].x - v[s - 1].x) * i) / mitad, y: v[s - 1].y + ((v[s].y - v[s - 1].y) * i) / mitad });
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

/** Un panel flotante sobre el lienzo, en coordenadas del lienzo, y el borde al que está pegado. */
export type PanelFlotante = { lado: "arriba" | "abajo" | "izquierda" | "derecha"; x: number; y: number; w: number; h: number };

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * El rectángulo del lienzo que no tapa ningún panel flotante (la barra de arriba, el banco de
 * abajo, la caja de herramientas, el minimapa y el zoom): lo que se encuadra tiene que caer acá.
 *
 * Sin `contenido`: cada panel corre el borde de su lado hasta su canto interior, más
 * `separacion` (el rectángulo central). Si los paneles dejaran menos de `minimo` en un sentido,
 * se achican los márgenes en proporción.
 *
 * Con `contenido` (el ancho y alto de lo que se va a encuadrar): se prueban todos los
 * rectángulos libres de paneles —por ejemplo, todo el ancho entre la caja de herramientas y el
 * minimapa, si lo que se encuadra es ancho y bajo— y se elige el que deja verlo más grande.
 */
export function areaLibre(
  ancho: number,
  alto: number,
  paneles: PanelFlotante[],
  separacion = 12,
  minimo = 160,
  contenido?: { w: number; h: number },
  margen = 24,
): Rect {
  const central = areaCentral(ancho, alto, paneles, separacion, minimo);
  if (!contenido) return central;
  const visibles = paneles.filter((p) => p.w > 0 && p.h > 0);
  const escala = (r: Rect) =>
    Math.min((r.w - margen * 2) / Math.max(1, contenido.w), (r.h - margen * 2) / Math.max(1, contenido.h));
  const izquierdas = [0, ...visibles.map((p) => p.x + p.w + separacion)].filter((x) => x >= 0 && x < ancho);
  const derechas = [ancho, ...visibles.map((p) => p.x - separacion)].filter((x) => x > 0 && x <= ancho);
  let mejor = central;
  let kMejor = escala(central);
  for (const l of izquierdas)
    for (const r of derechas) {
      if (r - l < minimo) continue;
      // Los paneles que caen en esa franja vertical parten el alto en huecos.
      const cortes = visibles
        .filter((p) => p.x < r && p.x + p.w > l)
        .map((p) => [p.y - separacion, p.y + p.h + separacion] as const)
        .sort((a, b) => a[0] - b[0]);
      let desde = 0;
      const huecos: [number, number][] = [];
      for (const [a, b] of cortes) {
        if (a > desde) huecos.push([desde, a]);
        desde = Math.max(desde, b);
      }
      if (desde < alto) huecos.push([desde, alto]);
      for (const [t, b] of huecos) {
        if (b - t < minimo) continue;
        const rect = { x: l, y: t, w: r - l, h: b - t };
        const k = escala(rect);
        // Más grande gana; si da casi lo mismo, el de más superficie (queda más aire).
        if (k > kMejor * 1.01 || (k > kMejor * 0.99 && rect.w * rect.h > mejor.w * mejor.h)) {
          mejor = rect;
          kMejor = Math.max(k, kMejor);
        }
      }
    }
  return mejor;
}

function areaCentral(ancho: number, alto: number, paneles: PanelFlotante[], separacion: number, minimo: number): Rect {
  let arriba = 0;
  let abajo = 0;
  let izq = 0;
  let der = 0;
  for (const p of paneles) {
    if (p.w <= 0 || p.h <= 0) continue;
    if (p.lado === "arriba") arriba = Math.max(arriba, p.y + p.h + separacion);
    else if (p.lado === "abajo") abajo = Math.max(abajo, alto - p.y + separacion);
    else if (p.lado === "izquierda") izq = Math.max(izq, p.x + p.w + separacion);
    else der = Math.max(der, ancho - p.x + separacion);
  }
  const ajustar = (a: number, b: number, total: number): [number, number] => {
    const libre = total - a - b;
    if (libre >= minimo || a + b <= 0) return [a, b];
    const f = Math.max(0, total - minimo) / (a + b);
    return [a * f, b * f];
  };
  [izq, der] = ajustar(izq, der, ancho);
  [arriba, abajo] = ajustar(arriba, abajo, alto);
  return { x: izq, y: arriba, w: Math.max(1, ancho - izq - der), h: Math.max(1, alto - arriba - abajo) };
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
    grupos: layout.grupos.map((g) => ({ ...g, caja: { ...g.caja, x: g.caja.x + dx, y: g.caja.y + dy } })),
    aristas: layout.aristas.map((a) => ({
      ...a,
      geo:
        a.geo.modo === "arbol"
          ? { ...a.geo, desde: mov(a.geo.desde), hasta: mov(a.geo.hasta), bus: a.geo.bus + dy, tronco: a.geo.tronco + dx, fila: a.geo.fila + dy }
          : { ...a.geo, desde: mov(a.geo.desde), hasta: mov(a.geo.hasta) },
    })),
    limites: {
      minX: layout.limites.minX + dx,
      maxX: layout.limites.maxX + dx,
      minY: layout.limites.minY + dy,
      maxY: layout.limites.maxY + dy,
    },
  };
}

/** Los límites del subárbol de `clave` (él, todo lo visible debajo y su recuadro, si es un área). */
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
  const grupo = layout.grupos.find((g) => g.clave === clave && g.forma === "arbol");
  return limitesDe([...[...debajo].map((c) => layout.cajas[c]).filter(Boolean), ...(grupo ? [grupo.caja] : [])]);
}
