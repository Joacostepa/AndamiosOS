// Volúmenes de referencia del modelador: el edificio y los obstáculos dibujados a partir de
// medidas (caja, prisma, escalonado con retranqueos, salientes, cilindro/cúpula, huecos).
//
// Funciones PURAS (sin DOM ni three). La lógica "oficial" de volúmenes la escribe otro agente
// en src/lib/tecnica/modelo/volumenes/; mientras tanto la pantalla usa esta capa, que guarda
// lo mismo que pide el contrato (Contexto.volumenes con planta, yBase y yTope) y además la
// receta (`forma`) para poder volver a editarlo. Ver el handoff de la pantalla.

import type { Accion, Aviso, Diseno, Estructura, Poligono, Resultado, V2, Volumen } from "@/lib/tecnica/modelo";

export const VERSION_VOLUMENES = 1;

export type TipoSaliente = "balcon" | "marquesina" | "cornisa";

export type FormaVolumen =
  | { forma: "caja"; largo: number; ancho: number; alto: number; origen: V2; rumbo: number; yBase: number }
  | { forma: "prisma"; puntos: V2[]; alto: number; yBase: number }
  | {
      forma: "escalonado"; largo: number; ancho: number; origen: V2; rumbo: number;
      /** Tramos de abajo hacia arriba: alto del tramo y retiro respecto del tramo de abajo. */
      pisos: { alto: number; retiro: number }[];
      lados: "frente" | "todos";
    }
  | {
      forma: "saliente"; tipo: TipoSaliente; sobre: string; cara: number;
      /** Desde dónde arranca sobre la cara (m desde el primer vértice) y cuánto mide. */
      desde: number; largo: number; vuelo: number; altura: number; espesor: number;
    }
  | { forma: "cilindro"; centro: V2; radio: number; alto: number; cupula: boolean; altoCupula: number; yBase: number }
  | { forma: "hueco"; largo: number; ancho: number; origen: V2; rumbo: number; yBase: number; alto: number };

/** Volumen del contexto con lo que la pantalla necesita para editarlo. */
export type VolumenRef = Volumen & {
  /** Los volúmenes que salen de una misma receta comparten grupo (el escalonado da varios). */
  grupo?: string;
  forma?: FormaVolumen;
  hueco?: boolean;
  /** Versión de esta receta (VERSION_VOLUMENES). */
  v?: number;
};

export const NOMBRE_FORMA: Record<FormaVolumen["forma"], string> = {
  caja: "Caja", prisma: "Prisma por planta", escalonado: "Escalonado (retranqueos)", saliente: "Saliente",
  cilindro: "Cilindro / cúpula", hueco: "Hueco / patio",
};

export const NOMBRE_SALIENTE: Record<TipoSaliente, string> = { balcon: "Balcón", marquesina: "Marquesina", cornisa: "Cornisa" };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rad = (g: number) => (g * Math.PI) / 180;

function rect(origen: V2, rumbo: number, x0: number, z0: number, x1: number, z1: number): Poligono {
  const u: V2 = [Math.cos(rad(rumbo)), Math.sin(rad(rumbo))];
  const n: V2 = [-u[1], u[0]];
  const P = (s: number, t: number): V2 => [r3(origen[0] + u[0] * s + n[0] * t), r3(origen[1] + u[1] * s + n[1] * t)];
  return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)];
}

export function areaFirmada(p: Poligono): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

export function centroide(p: Poligono): V2 {
  const n = p.length || 1;
  return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n];
}

/** Caras (lados) de un volumen con la normal hacia AFUERA del edificio (hacia donde va el andamio). */
export interface Cara {
  i: number;
  a: V2;
  b: V2;
  largo: number;
  rumbo: number;
  normal: V2;
  yBase: number;
  yTope: number;
}

/**
 * Lados del volumen orientados para el modelador: recorriendo a → b, la normal (−u.z, u.x) del
 * marco del núcleo apunta hacia afuera del edificio. En un hueco (patio) apunta hacia adentro
 * del patio, que es donde va el andamio.
 */
export function carasDe(v: VolumenRef): Cara[] {
  const p = v.planta;
  if (p.length < 2) return [];
  const area = areaFirmada(p);
  // con área positiva, (−u.z, u.x) apunta hacia adentro del polígono: se recorre al revés
  const invertir = v.hueco ? area < 0 : area > 0;
  const pts = invertir ? [...p].reverse() : p;
  const out: Cara[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-3) continue;
    const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    out.push({ i: out.length, a, b, largo: r3(L), rumbo: r3((Math.atan2(u[1], u[0]) * 180) / Math.PI), normal: [-u[1], u[0]], yBase: v.yBase, yTope: v.yTope });
  }
  return out;
}

/** Id nuevo que no choca con los del diseño. */
export function nuevoIdVolumen(diseno: Diseno): string {
  const usados = new Set((diseno.contexto.volumenes as VolumenRef[]).flatMap((v) => [v.id, v.grupo ?? v.id]));
  let n = 1;
  while (usados.has(`V${n}`)) n++;
  return `V${n}`;
}

/** Arma los volúmenes del contexto a partir de una receta. */
export function volumenesDesdeForma(forma: FormaVolumen, id: string, nombre: string, diseno: Diseno): VolumenRef[] {
  const base = { grupo: id, v: VERSION_VOLUMENES };
  switch (forma.forma) {
    case "caja":
      return [{ ...base, id, nombre, tipo: "edificio", forma, planta: rect(forma.origen, forma.rumbo, 0, 0, forma.largo, forma.ancho), yBase: forma.yBase, yTope: r3(forma.yBase + forma.alto) }];
    case "prisma":
      return [{ ...base, id, nombre, tipo: "edificio", forma, planta: forma.puntos.map((q) => [r3(q[0]), r3(q[1])] as V2), yBase: forma.yBase, yTope: r3(forma.yBase + forma.alto) }];
    case "escalonado": {
      const out: VolumenRef[] = [];
      let y = 0;
      let rf = 0;
      let rl = 0;
      forma.pisos.forEach((piso, k) => {
        if (k > 0) {
          rf += Math.max(0, piso.retiro);
          if (forma.lados === "todos") rl += Math.max(0, piso.retiro);
        }
        const x0 = rl, x1 = forma.largo - rl, z0 = rf, z1 = forma.ancho - (forma.lados === "todos" ? rl : 0);
        if (x1 - x0 < 0.2 || z1 - z0 < 0.2) return;
        out.push({
          ...base, id: k === 0 ? id : `${id}.${k}`, nombre: k === 0 ? nombre : `${nombre} · tramo ${k + 1}`, tipo: "edificio",
          ...(k === 0 ? { forma } : {}), planta: rect(forma.origen, forma.rumbo, x0, z0, x1, z1), yBase: r3(y), yTope: r3(y + piso.alto),
        });
        y += piso.alto;
      });
      return out;
    }
    case "saliente": {
      const sobre = (diseno.contexto.volumenes as VolumenRef[]).find((v) => v.id === forma.sobre) ?? (diseno.contexto.volumenes as VolumenRef[]).find((v) => (v.grupo ?? v.id) === forma.sobre);
      const cara = sobre ? carasDe(sobre)[forma.cara] : undefined;
      if (!cara) return [];
      const u: V2 = [(cara.b[0] - cara.a[0]) / cara.largo, (cara.b[1] - cara.a[1]) / cara.largo];
      const P = (s: number, t: number): V2 => [r3(cara.a[0] + u[0] * s + cara.normal[0] * t), r3(cara.a[1] + u[1] * s + cara.normal[1] * t)];
      const s0 = Math.max(0, forma.desde), s1 = Math.min(cara.largo, forma.desde + forma.largo);
      return [{ ...base, id, nombre, tipo: "losa", forma, planta: [P(s0, 0), P(s1, 0), P(s1, forma.vuelo), P(s0, forma.vuelo)], yBase: r3(forma.altura), yTope: r3(forma.altura + forma.espesor) }];
    }
    case "cilindro": {
      const lados = 24;
      const planta: Poligono = [];
      for (let i = 0; i < lados; i++) {
        const a = (2 * Math.PI * i) / lados;
        planta.push([r3(forma.centro[0] + forma.radio * Math.cos(a)), r3(forma.centro[1] + forma.radio * Math.sin(a))]);
      }
      return [{ ...base, id, nombre, tipo: forma.cupula ? "cupula" : "cilindro", forma, planta, yBase: forma.yBase, yTope: r3(forma.yBase + forma.alto) }];
    }
    case "hueco":
      return [{ ...base, id, nombre, tipo: "edificio", hueco: true, forma, planta: rect(forma.origen, forma.rumbo, 0, 0, forma.largo, forma.ancho), yBase: forma.yBase, yTope: r3(forma.yBase + forma.alto) }];
  }
}

/** Reemplaza (o agrega) los volúmenes de un grupo en el diseño. Devuelve una copia. */
export function ponerGrupo(diseno: Diseno, grupo: string, nuevos: VolumenRef[]): Diseno {
  const d = structuredClone(diseno);
  const resto = (d.contexto.volumenes as VolumenRef[]).filter((v) => (v.grupo ?? v.id) !== grupo);
  const idx = (d.contexto.volumenes as VolumenRef[]).findIndex((v) => (v.grupo ?? v.id) === grupo);
  const lista = [...resto];
  lista.splice(idx < 0 ? lista.length : Math.min(idx, lista.length), 0, ...nuevos);
  d.contexto.volumenes = lista;
  // los salientes que cuelgan de este volumen se recalculan (la cara pudo cambiar)
  for (const v of lista as VolumenRef[]) {
    if (v.forma?.forma === "saliente" && v.forma.sobre === grupo && v.grupo) {
      const re = volumenesDesdeForma(v.forma, v.id, v.nombre || "Saliente", d);
      if (re[0]) Object.assign(v, re[0]);
    }
  }
  return d;
}

export function quitarGrupo(diseno: Diseno, grupo: string): Diseno {
  const d = structuredClone(diseno);
  d.contexto.volumenes = (d.contexto.volumenes as VolumenRef[]).filter(
    (v) => (v.grupo ?? v.id) !== grupo && !(v.forma?.forma === "saliente" && v.forma.sobre === grupo),
  );
  return d;
}

/** La receta del grupo (la guarda el primer volumen del grupo). */
export function formaDeGrupo(diseno: Diseno, grupo: string): { forma: FormaVolumen; nombre: string } | null {
  const v = (diseno.contexto.volumenes as VolumenRef[]).find((x) => (x.grupo ?? x.id) === grupo && x.forma);
  return v?.forma ? { forma: v.forma, nombre: v.nombre || v.id } : null;
}

/** Grupos de volúmenes (uno por receta), en orden. */
export function gruposDe(diseno: Diseno): { grupo: string; nombre: string; forma: FormaVolumen | null; volumenes: VolumenRef[] }[] {
  const out = new Map<string, { grupo: string; nombre: string; forma: FormaVolumen | null; volumenes: VolumenRef[] }>();
  for (const v of diseno.contexto.volumenes as VolumenRef[]) {
    const g = v.grupo ?? v.id;
    if (!out.has(g)) out.set(g, { grupo: g, nombre: v.nombre || v.id, forma: null, volumenes: [] });
    const e = out.get(g)!;
    e.volumenes.push(v);
    if (v.forma) {
      e.forma = v.forma;
      e.nombre = v.nombre || e.nombre;
    }
  }
  return [...out.values()];
}

// ───────────── clic en una cara → fachada ─────────────

function interseccion(p1: V2, d1: V2, p2: V2, d2: V2): V2 | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

const normAng = (a: number) => {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x <= -180) x += 360;
  return Math.round(x * 100) / 100;
};

export interface PropuestaFachada {
  origen: V2;
  rumbo: number;
  params: { frentes: { largo: number; angulo?: number }[]; altura: number; retiro: number };
  texto: string;
}

/**
 * Fachada que sigue una o varias caras consecutivas del volumen, separada `retiro` de la cara.
 * Las caras se desplazan hacia afuera y se cortan entre sí, así los frentes empalman en las esquinas.
 */
export function fachadaDesdeCara(v: VolumenRef, caraIdx: number, opciones: { retiro: number; caras?: number }): PropuestaFachada | null {
  const caras = carasDe(v);
  if (!caras.length) return null;
  const n = Math.max(1, Math.min(caras.length, opciones.caras ?? 1));
  const sel: Cara[] = [];
  for (let k = 0; k < n; k++) sel.push(caras[(caraIdx + k) % caras.length]);
  const r = Math.max(0, opciones.retiro);
  const lineas = sel.map((c) => {
    const u: V2 = [(c.b[0] - c.a[0]) / c.largo, (c.b[1] - c.a[1]) / c.largo];
    return { p: [c.a[0] + c.normal[0] * r, c.a[1] + c.normal[1] * r] as V2, q: [c.b[0] + c.normal[0] * r, c.b[1] + c.normal[1] * r] as V2, u };
  });
  const puntos: V2[] = [lineas[0].p];
  for (let k = 1; k < lineas.length; k++) {
    const x = interseccion(lineas[k - 1].p, lineas[k - 1].u, lineas[k].p, lineas[k].u);
    puntos.push(x ?? lineas[k].p);
  }
  puntos.push(lineas[lineas.length - 1].q);
  const frentes: { largo: number; angulo?: number }[] = [];
  for (let k = 0; k < sel.length; k++) {
    const L = r3(Math.hypot(puntos[k + 1][0] - puntos[k][0], puntos[k + 1][1] - puntos[k][1]));
    if (k === 0) frentes.push({ largo: Math.max(0.5, L) });
    else frentes.push({ largo: Math.max(0.5, L), angulo: normAng(sel[k - 1].rumbo - sel[k].rumbo) });
  }
  const altura = r3(Math.max(2, Math.max(...sel.map((c) => c.yTope))));
  return {
    origen: [r3(puntos[0][0]), r3(puntos[0][1])],
    rumbo: sel[0].rumbo,
    params: { frentes, altura, retiro: r3(r) },
    texto: `${frentes.map((f) => f.largo.toFixed(2).replace(".", ",")).join(" + ")} m × ${altura.toFixed(2).replace(".", ",")} m`,
  };
}

// ───────────── choques andamio ↔ volumen ─────────────

function dentro(x: number, z: number, poly: Poligono): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function distBorde(x: number, z: number, poly: Poligono): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    d = Math.min(d, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return d;
}

const TOL = 0.03;

/** Avisos de choque entre las piezas y los volúmenes macizos, con reparación de un clic cuando se puede. */
export function choques(diseno: Diseno, res: Resultado, mensulas: number[]): Aviso[] {
  const vols = (diseno.contexto.volumenes as VolumenRef[]).filter((v) => !v.hueco && v.planta.length >= 3);
  if (!vols.length) return [];
  const out: Aviso[] = [];
  const porPar = new Map<string, { est: string; vol: VolumenRef; n: number; yMin: number }>();
  for (const p of res.piezas) {
    for (const v of vols) {
      const y0 = Math.min(p.a[1], p.b[1]), y1 = Math.max(p.a[1], p.b[1]);
      if (y1 < v.yBase + TOL || y0 > v.yTope - TOL) continue;
      // tramo de la pieza dentro de la franja de alturas del volumen
      const dy = p.b[1] - p.a[1];
      let t0 = 0, t1 = 1;
      if (Math.abs(dy) > 1e-6) {
        const ta = (v.yBase + TOL - p.a[1]) / dy, tb = (v.yTope - TOL - p.a[1]) / dy;
        t0 = Math.max(0, Math.min(ta, tb));
        t1 = Math.min(1, Math.max(ta, tb));
        if (t1 < t0) continue;
      }
      let choca = false;
      for (let k = 0; k <= 4 && !choca; k++) {
        const t = t0 + ((t1 - t0) * k) / 4;
        const x = p.a[0] + (p.b[0] - p.a[0]) * t;
        const z = p.a[2] + (p.b[2] - p.a[2]) * t;
        if (dentro(x, z, v.planta) && distBorde(x, z, v.planta) > TOL) choca = true;
      }
      if (!choca) continue;
      const clave = `${p.estructuraId}|${v.grupo ?? v.id}`;
      const e = porPar.get(clave) ?? { est: p.estructuraId, vol: v, n: 0, yMin: Infinity };
      e.n++;
      e.yMin = Math.min(e.yMin, y0);
      porPar.set(clave, e);
    }
  }
  let i = 0;
  for (const { est: estId, vol, n } of porPar.values()) {
    const est = diseno.estructuras.find((e) => e.id === estId);
    if (!est) continue;
    const forma = (diseno.contexto.volumenes as VolumenRef[]).find((x) => (x.grupo ?? x.id) === (vol.grupo ?? vol.id) && x.forma)?.forma;
    const nombreVol = vol.nombre || vol.id;
    const reparaciones = forma?.forma === "saliente" ? reparacionesSaliente(est, forma, vol, res, mensulas) : [];
    out.push({
      id: `VC${++i}`,
      regla: "volumen.choque",
      nivel: "error",
      texto: `${est.nombre} choca con ${nombreVol}: ${n} pieza${n === 1 ? "" : "s"} adentro del volumen.${forma?.forma === "saliente" ? ` La ${forma.tipo === "marquesina" ? "marquesina" : forma.tipo === "balcon" ? "saliente del balcón" : "cornisa"} vuela ${forma.vuelo.toFixed(2).replace(".", ",")} m.` : " Mové la estructura o revisá las medidas."}`,
      estructuraId: est.id,
      reparaciones,
    });
  }
  return out;
}

function reparacionesSaliente(est: Estructura, forma: Extract<FormaVolumen, { forma: "saliente" }>, vol: VolumenRef, res: Resultado, mensulas: number[]): Aviso["reparaciones"] {
  if (est.tipologia !== "fachada") return [];
  const retiro0 = typeof est.params.retiro === "number" ? est.params.retiro : 0.2;
  const nuevo = r3(forma.vuelo + 0.1);
  const delta = nuevo - retiro0;
  if (delta <= 0) return [];
  const n: V2 = [-Math.sin(rad(est.rumbo)), Math.cos(rad(est.rumbo))];
  const origen: V2 = [r3(est.origen[0] + n[0] * delta), r3(est.origen[1] + n[1] * delta)];
  const mover: Accion[] = [
    { tipo: "param", estructuraId: est.id, ruta: "origen", valor: origen },
    { tipo: "param", estructuraId: est.id, ruta: "params.retiro", valor: nuevo },
  ];
  const r = res.estructuras.find((x) => x.id === est.id);
  const frentes = (r?.info?.frentes as { niveles?: { cota: number }[] }[] | undefined) ?? [];
  const niveles = frentes[0]?.niveles ?? [];
  const desde = niveles.findIndex((x) => x.cota > vol.yTope + 0.3);
  const necesita = r3(nuevo - 0.2);
  const brazo = [...mensulas].sort((a, b) => a - b).find((m) => m >= necesita - 1e-6) ?? Math.max(0.73, ...mensulas);
  const sal = forma.tipo === "marquesina" ? "la marquesina" : forma.tipo === "balcon" ? "el balcón" : "la cornisa";
  const out: Aviso["reparaciones"] = [];
  if (desde >= 0) {
    out.push({
      etiqueta: `Retirar a ${nuevo.toFixed(2).replace(".", ",")} y acercar con ménsulas sobre ${sal}`,
      accion: { tipo: "lote", acciones: [...mover, { tipo: "param", estructuraId: est.id, ruta: "params.mensulas", valor: [{ lado: "fachada", brazo, desdeNivel: desde }] }] },
    });
  }
  out.push({ etiqueta: `Retirar a ${nuevo.toFixed(2).replace(".", ",")}`, accion: { tipo: "lote", acciones: mover } });
  return out;
}

/** Un saliente nuevo sobre una cara, con medidas típicas por tipo. */
export function salientePorDefecto(tipo: TipoSaliente, sobre: string, cara: number, largoCara: number): Extract<FormaVolumen, { forma: "saliente" }> {
  const def = {
    marquesina: { vuelo: 1.2, altura: 3, espesor: 0.15 },
    balcon: { vuelo: 1.0, altura: 3, espesor: 0.15 },
    cornisa: { vuelo: 0.5, altura: 9, espesor: 0.4 },
  }[tipo];
  return { forma: "saliente", tipo, sobre, cara, desde: 0, largo: r3(largoCara), ...def };
}
