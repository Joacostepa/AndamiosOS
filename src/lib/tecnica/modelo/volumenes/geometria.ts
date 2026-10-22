/**
 * Geometría de volúmenes: definición → planta y cotas, sólidos (prismas) y caras verticales.
 * Puro y determinista. Coordenadas de mundo (x, z).
 */
import type { Poligono, V2, Volumen } from '../tipos.ts';
import { areaPoligono, clamp, num, r3 } from '../util.ts';
import type { Cara, DefVolumen, HuecoDef, Solido, TramoEscalonado, VolumenModelado } from './tipos.ts';
import { VERSION_VOLUMENES } from './tipos.ts';

export const antihorario = (p: Poligono): Poligono => (areaPoligono(p) < 0 ? [...p].reverse() : [...p]);

/** Polígono regular inscripto (antihorario). */
export function circulo(centro: V2, radio: number, lados: number): Poligono {
  const n = Math.max(6, Math.round(lados));
  const out: Poligono = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push([r3(centro[0] + radio * Math.cos(a)), r3(centro[1] + radio * Math.sin(a))]);
  }
  return out;
}

/** Rectángulo de una caja: primer lado desde `origen` en dirección `rumbo`, el cuerpo a la izquierda (antihorario). */
export function rectanguloCaja(origen: V2, rumbo: number, largo: number, ancho: number): Poligono {
  const r = (rumbo * Math.PI) / 180;
  const u: V2 = [Math.cos(r), Math.sin(r)];
  const n: V2 = [-u[1], u[0]];
  const P = (s: number, t: number): V2 => [r3(origen[0] + u[0] * s + n[0] * t), r3(origen[1] + u[1] * s + n[1] * t)];
  return antihorario([P(0, 0), P(largo, 0), P(largo, ancho), P(0, ancho)]);
}

const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: V2): number => Math.hypot(a[0], a[1]);
const unit = (a: V2): V2 => {
  const L = len(a) || 1;
  return [a[0] / L, a[1] / L];
};

/** Normal hacia afuera del lado i de un polígono antihorario. */
export function normalAfuera(P: Poligono, i: number): V2 {
  const d = unit(sub(P[(i + 1) % P.length], P[i]));
  return [r3(d[1]), r3(-d[0])];
}

function cruceRectas(p: V2, u: V2, q: V2, v: V2): V2 | null {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const l = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [r3(p[0] + u[0] * l), r3(p[1] + u[1] * l)];
}

/**
 * Desplaza cada lado de un polígono antihorario `d[i]` hacia adentro (negativo = hacia afuera) y vuelve a
 * cortar los lados consecutivos. Sirve para retranqueos y para las líneas de andamio a una distancia.
 */
export function desplazarLados(P: Poligono, d: number[] | number): Poligono {
  const n = P.length;
  const dist = (i: number) => (Array.isArray(d) ? (d[i] ?? 0) : d);
  const lineas = P.map((a, i) => {
    const b = P[(i + 1) % n];
    const u = unit(sub(b, a));
    const nin: V2 = [-u[1], u[0]];
    return { p: [a[0] + nin[0] * dist(i), a[1] + nin[1] * dist(i)] as V2, u };
  });
  return P.map((_, i) => {
    const prev = lineas[(i - 1 + n) % n];
    const act = lineas[i];
    return cruceRectas(prev.p, prev.u, act.p, act.u) || [r3(act.p[0]), r3(act.p[1])];
  });
}

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const v2ok = (q: unknown): q is V2 => Array.isArray(q) && q.length === 2 && q.every(finito);
const poliOk = (p: unknown): p is Poligono => Array.isArray(p) && p.length >= 3 && p.every(v2ok);

function normalizarHuecos(h: unknown): HuecoDef[] | undefined {
  if (!Array.isArray(h)) return undefined;
  const out = h.filter((x) => x && poliOk(x.planta)).map((x) => ({ ...(x.nombre ? { nombre: String(x.nombre) } : {}), planta: antihorario(x.planta), ...(finito(x.yBase) ? { yBase: x.yBase } : {}), ...(finito(x.yTope) ? { yTope: x.yTope } : {}) }));
  return out.length ? out : undefined;
}

const medianerasOk = (m: unknown): number[] | undefined => (Array.isArray(m) ? m.filter((x) => Number.isInteger(x) && x >= 0) : undefined);

/** Normaliza una definición (clamp y defaults). Nunca tira: si no se entiende, devuelve una caja de 10 × 10 × 10. */
export function normalizarDef(def: unknown): { def: DefVolumen; avisos: string[] } {
  const x = (def && typeof def === 'object' ? def : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  const yBase = finito(x.yBase) ? clamp(x.yBase, -20, 300) : undefined;
  const base = yBase === undefined ? {} : { yBase };
  switch (x.tipo) {
    case 'prisma':
      if (poliOk(x.planta)) return { def: { tipo: 'prisma', planta: antihorario(x.planta), alto: clamp(num(x.alto, 10), 0.1, 300), ...base, medianeras: medianerasOk(x.medianeras), huecos: normalizarHuecos(x.huecos) }, avisos };
      avisos.push('Planta inválida: dibujé una caja.');
      break;
    case 'escalonado': {
      if (!poliOk(x.planta)) {
        avisos.push('Planta inválida: dibujé una caja.');
        break;
      }
      const y0 = yBase ?? 0;
      const tramos = (Array.isArray(x.tramos) ? x.tramos : []).filter((t: TramoEscalonado) => t && finito(t.hasta)).map((t: TramoEscalonado) => ({ hasta: clamp(t.hasta, y0 + 0.1, 300), retiro: Array.isArray(t.retiro) ? t.retiro.map((r) => clamp(num(r, 0), -10, 50)) : clamp(num(t.retiro, 0), -10, 50) }));
      tramos.sort((a, b) => a.hasta - b.hasta);
      if (!tramos.length) tramos.push({ hasta: y0 + 10, retiro: 0 });
      return { def: { tipo: 'escalonado', planta: antihorario(x.planta), tramos, ...base, medianeras: medianerasOk(x.medianeras), huecos: normalizarHuecos(x.huecos) }, avisos };
    }
    case 'cilindro':
      return {
        def: {
          tipo: 'cilindro', centro: v2ok(x.centro) ? x.centro : [0, 0], radio: clamp(num(x.radio, 2), 0.1, 100), alto: clamp(num(x.alto, 6), 0.1, 300), ...base,
          lados: Math.round(clamp(num(x.lados, 16), 6, 48)),
          cupula: x.cupula && typeof x.cupula === 'object' && finito((x.cupula as { alto?: unknown }).alto) ? { alto: clamp((x.cupula as { alto: number }).alto, 0.1, 100) } : null,
          clase: ['tanque', 'torre', 'columna', 'cupula'].includes(x.clase as string) ? (x.clase as 'tanque') : 'tanque',
        },
        avisos,
      };
    case 'saliente':
      return {
        def: {
          tipo: 'saliente', padre: typeof x.padre === 'string' ? x.padre : '', lado: Math.max(0, Math.round(num(x.lado, 0))),
          desde: clamp(num(x.desde, 0), -50, 500), largo: clamp(num(x.largo, 3), 0.1, 500), vuelo: clamp(num(x.vuelo, 1), 0.05, 10),
          yBase: clamp(num(x.yBase, 3), -10, 300), espesor: clamp(num(x.espesor, 0.15), 0.02, 5),
          clase: ['balcon', 'marquesina', 'cornisa'].includes(x.clase as string) ? (x.clase as 'balcon') : 'marquesina',
          ...(finito(x.antepecho) ? { antepecho: clamp(x.antepecho, 0, 3) } : {}),
          repetir: x.repetir && typeof x.repetir === 'object' && finito((x.repetir as { cada?: unknown }).cada) && finito((x.repetir as { hasta?: unknown }).hasta)
            ? { cada: clamp((x.repetir as { cada: number }).cada, 1, 20), hasta: clamp((x.repetir as { hasta: number }).hasta, 0, 300) } : null,
        },
        avisos,
      };
    case 'caja':
    default:
      if (x.tipo !== 'caja') avisos.push('Tipo de volumen desconocido: dibujé una caja.');
  }
  return {
    def: {
      tipo: 'caja', origen: v2ok(x.origen) ? x.origen : [0, 0], rumbo: num(x.rumbo, 0), largo: clamp(num(x.largo, 10), 0.1, 500), ancho: clamp(num(x.ancho, 10), 0.1, 500),
      alto: clamp(num(x.alto, 10), 0.1, 300), ...base, medianeras: medianerasOk(x.medianeras), huecos: normalizarHuecos(x.huecos),
    },
    avisos,
  };
}

/** Sólidos de un volumen (necesita la lista para resolver el padre de un saliente). */
export function solidosDe(v: Volumen | VolumenModelado, todos: Volumen[] = []): Solido[] {
  const def = (v as VolumenModelado).def;
  // volumen sin definición (cargado a mano o por la capa provisoria de la pantalla): un prisma; `hueco: true` = patio
  if (!def) return [{ id: `${v.id}:s0`, volumenId: v.id, planta: antihorario(v.planta), yBase: v.yBase, yTope: v.yTope, rol: (v as { hueco?: boolean }).hueco ? 'hueco' : 'cuerpo' }];
  const out: Solido[] = [];
  const huecos = (h: HuecoDef[] | undefined, y0: number, y1: number) => (h || []).forEach((x, i) => out.push({ id: `${v.id}:h${i}`, volumenId: v.id, planta: x.planta, yBase: x.yBase ?? y0, yTope: x.yTope ?? y1, rol: 'hueco', clase: x.nombre }));
  switch (def.tipo) {
    case 'caja': {
      const y0 = def.yBase ?? 0;
      out.push({ id: `${v.id}:s0`, volumenId: v.id, planta: rectanguloCaja(def.origen, def.rumbo, def.largo, def.ancho), yBase: y0, yTope: r3(y0 + def.alto), rol: 'cuerpo' });
      huecos(def.huecos, y0, r3(y0 + def.alto));
      break;
    }
    case 'prisma': {
      const y0 = def.yBase ?? 0;
      out.push({ id: `${v.id}:s0`, volumenId: v.id, planta: def.planta, yBase: y0, yTope: r3(y0 + def.alto), rol: 'cuerpo' });
      huecos(def.huecos, y0, r3(y0 + def.alto));
      break;
    }
    case 'escalonado': {
      let y = def.yBase ?? 0;
      def.tramos.forEach((t, i) => {
        const pl = desplazarLados(def.planta, t.retiro);
        out.push({ id: `${v.id}:s${i}`, volumenId: v.id, planta: antihorario(pl), yBase: r3(y), yTope: r3(t.hasta), rol: i === 0 ? 'cuerpo' : 'tramo' });
        y = t.hasta;
      });
      huecos(def.huecos, def.yBase ?? 0, y);
      break;
    }
    case 'cilindro': {
      const y0 = def.yBase ?? 0;
      const y1 = r3(y0 + def.alto);
      out.push({ id: `${v.id}:s0`, volumenId: v.id, planta: circulo(def.centro, def.radio, def.lados ?? 16), yBase: y0, yTope: y1, rol: 'cuerpo', clase: def.clase });
      if (def.cupula) {
        // cúpula por anillos (4 rodajas)
        const n = 4;
        for (let i = 0; i < n; i++) {
          const a0 = (Math.PI / 2) * (i / n);
          const r = def.radio * Math.cos(a0);
          out.push({ id: `${v.id}:c${i}`, volumenId: v.id, planta: circulo(def.centro, r3(r), def.lados ?? 16), yBase: r3(y1 + def.cupula.alto * Math.sin(a0)), yTope: r3(y1 + def.cupula.alto * Math.sin((Math.PI / 2) * ((i + 1) / n))), rol: 'cupula' });
        }
      }
      break;
    }
    case 'saliente': {
      const padre = todos.find((x) => x.id === def.padre);
      const rect = padre ? rectanguloSaliente(padre, def) : null;
      if (!rect) break;
      const ante = def.antepecho ?? (def.clase === 'balcon' ? 1 : 0);
      const alto = r3(def.espesor + ante);
      const tope = def.repetir ? def.repetir.hasta : def.yBase;
      let k = 0;
      for (let y = def.yBase; y <= tope + 1e-6 && k < 200; y = r3(y + (def.repetir?.cada ?? 1e9)), k++) {
        out.push({ id: `${v.id}:s${k}`, volumenId: v.id, planta: rect, yBase: r3(y), yTope: r3(y + alto), rol: 'saliente', clase: def.clase });
      }
      break;
    }
  }
  return out;
}

/** Planta base (lado de referencia) del padre de un saliente. */
export function plantaBase(v: Volumen | VolumenModelado): Poligono {
  const def = (v as VolumenModelado).def;
  if (!def) return antihorario(v.planta);
  if (def.tipo === 'caja') return rectanguloCaja(def.origen, def.rumbo, def.largo, def.ancho);
  if (def.tipo === 'prisma' || def.tipo === 'escalonado') return def.planta;
  if (def.tipo === 'cilindro') return circulo(def.centro, def.radio, def.lados ?? 16);
  return antihorario(v.planta);
}

function rectanguloSaliente(padre: Volumen, def: Extract<DefVolumen, { tipo: 'saliente' }>): Poligono | null {
  const P = plantaBase(padre);
  if (!P.length) return null;
  const i = def.lado % P.length;
  const a = P[i];
  const b = P[(i + 1) % P.length];
  const u = unit(sub(b, a));
  const n = normalAfuera(P, i);
  const p0: V2 = [a[0] + u[0] * def.desde, a[1] + u[1] * def.desde];
  const p1: V2 = [p0[0] + u[0] * def.largo, p0[1] + u[1] * def.largo];
  const q = (p: V2): V2 => [r3(p[0] + n[0] * def.vuelo), r3(p[1] + n[1] * def.vuelo)];
  return antihorario([[r3(p0[0]), r3(p0[1])], [r3(p1[0]), r3(p1[1])], q(p1), q(p0)]);
}

/** Recalcula planta y cotas de un volumen desde su definición (lo que leen las tipologías). */
export function volumenDesdeDef(id: string, defIn: unknown, todos: Volumen[] = [], nombre?: string): { volumen: VolumenModelado; avisos: string[] } {
  const { def, avisos } = normalizarDef(defIn);
  const tmp = { id, tipo: 'edificio', planta: [], yBase: 0, yTope: 0, def, defVersion: VERSION_VOLUMENES } as unknown as VolumenModelado;
  const sol = solidosDe(tmp, todos).filter((s) => s.rol !== 'hueco');
  if (def.tipo === 'saliente' && !sol.length) avisos.push(`No encuentro el volumen «${def.padre}» del saliente.`);
  const base = sol[0];
  const tipo: Volumen['tipo'] = def.tipo === 'cilindro' ? (def.cupula || def.clase === 'cupula' ? 'cupula' : 'cilindro') : def.tipo === 'saliente' ? 'losa' : 'edificio';
  const volumen: VolumenModelado = {
    id, tipo, ...(nombre ? { nombre } : {}),
    planta: base ? base.planta : [],
    yBase: base ? base.yBase : 0,
    yTope: sol.length ? Math.max(...sol.map((s) => s.yTope)) : 0,
    def, defVersion: VERSION_VOLUMENES,
  };
  return { volumen, avisos };
}

/** Caras verticales de un volumen. Un lado al ras en los tramos de arriba sigue siendo una sola cara. */
export function carasDe(v: Volumen | VolumenModelado, todos: Volumen[] = []): Cara[] {
  const def = (v as VolumenModelado).def;
  const sol = solidosDe(v, todos);
  const out: Cara[] = [];
  const medianeras = new Set(def && 'medianeras' in def ? def.medianeras || [] : []);
  const cuerpos = sol.filter((s) => s.rol === 'cuerpo' || s.rol === 'tramo');
  const yaCubierto = new Set<string>();
  cuerpos.forEach((s, si) => {
    const P = s.planta;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      const kLado = `${r3(a[0])},${r3(a[1])}|${r3(b[0])},${r3(b[1])}`;
      if (yaCubierto.has(kLado)) continue;
      // los tramos de arriba que siguen al ras (todo o parte del lado) suben la cara en esa parte
      const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u = unit(sub(b, a));
      let segs = [{ desde: 0, hasta: r3(L0), yTope: s.yTope }];
      for (let sj = si + 1; sj < cuerpos.length; sj++) {
        const Q = cuerpos[sj].planta;
        for (let j = 0; j < Q.length; j++) {
          const qa = Q[j];
          const qb = Q[(j + 1) % Q.length];
          const lado = (q: V2) => Math.abs((q[0] - a[0]) * u[1] - (q[1] - a[1]) * u[0]);
          const dq = unit(sub(qb, qa));
          if (lado(qa) > 0.005 || lado(qb) > 0.005 || dq[0] * u[0] + dq[1] * u[1] < 0.999) continue;
          const t0 = (qa[0] - a[0]) * u[0] + (qa[1] - a[1]) * u[1];
          const t1 = (qb[0] - a[0]) * u[0] + (qb[1] - a[1]) * u[1];
          const i0 = Math.max(0, t0);
          const i1 = Math.min(L0, t1);
          if (i1 - i0 < 0.01) continue;
          if (t0 >= -0.005 && t1 <= L0 + 0.005) yaCubierto.add(`${r3(qa[0])},${r3(qa[1])}|${r3(qb[0])},${r3(qb[1])}`);
          const nuevos: typeof segs = [];
          for (const g of segs) {
            if (Math.abs(g.yTope - cuerpos[sj].yBase) > 0.005 || g.hasta <= i0 + 1e-6 || g.desde >= i1 - 1e-6) {
              nuevos.push(g);
              continue;
            }
            if (g.desde < i0 - 1e-6) nuevos.push({ desde: g.desde, hasta: r3(i0), yTope: g.yTope });
            nuevos.push({ desde: r3(Math.max(g.desde, i0)), hasta: r3(Math.min(g.hasta, i1)), yTope: cuerpos[sj].yTope });
            if (g.hasta > i1 + 1e-6) nuevos.push({ desde: r3(i1), hasta: g.hasta, yTope: g.yTope });
          }
          segs = nuevos;
        }
      }
      const yTope = Math.max(...segs.map((g) => g.yTope));
      const unidos: typeof segs = [];
      for (const g of segs.sort((x, y) => x.desde - y.desde)) {
        const ult = unidos[unidos.length - 1];
        if (ult && Math.abs(ult.yTope - g.yTope) < 0.005) ult.hasta = g.hasta;
        else unidos.push({ ...g });
      }
      const largo = r3(Math.hypot(b[0] - a[0], b[1] - a[1]));
      if (largo < 0.05) continue;
      const curva = def?.tipo === 'cilindro';
      out.push({
        id: `${v.id}:${s.id.split(':').pop()}:${i}`, volumenId: v.id, solidoId: s.id, lado: i, a, b, normal: normalAfuera(P, i), largo,
        yBase: s.yBase, yTope: r3(yTope), rumbo: r3((Math.atan2(a[1] - b[1], a[0] - b[0]) * 180) / Math.PI),
        tipo: curva ? 'curva' : 'pared', medianera: si === 0 && medianeras.has(i),
        ...(unidos.length > 1 ? { tramosAltura: unidos } : {}),
      });
    }
  });
  // paredes de los patios (la normal mira al patio)
  for (const h of sol.filter((s) => s.rol === 'hueco')) {
    const P = h.planta;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      const n = normalAfuera(P, i);
      // recorrer al revés: el muro queda a la derecha mirando al patio
      out.push({ id: `${v.id}:${h.id.split(':').pop()}:${i}`, volumenId: v.id, solidoId: h.id, lado: i, a: b, b: a, normal: [r3(-n[0]), r3(-n[1])], largo: r3(Math.hypot(b[0] - a[0], b[1] - a[1])), yBase: h.yBase, yTope: h.yTope, rumbo: r3((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI), tipo: 'patio', medianera: false });
    }
  }
  for (const s of sol.filter((x) => x.rol === 'saliente').slice(0, 1)) {
    const P = s.planta;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      out.push({ id: `${v.id}:${s.id.split(':').pop()}:${i}`, volumenId: v.id, solidoId: s.id, lado: i, a, b, normal: normalAfuera(P, i), largo: r3(Math.hypot(b[0] - a[0], b[1] - a[1])), yBase: s.yBase, yTope: s.yTope, rumbo: r3((Math.atan2(a[1] - b[1], a[0] - b[0]) * 180) / Math.PI), tipo: 'saliente', medianera: false });
    }
  }
  return out;
}

/** ¿El punto está dentro del sólido (con un margen en bordes y cotas)? */
export function dentroSolido(s: Solido, x: number, y: number, z: number, margen = 0.03): boolean {
  if (y <= s.yBase + margen || y >= s.yTope - margen) return false;
  return distanciaAdentro(s.planta, [x, z]) > margen;
}

/** Distancia (positiva) del punto al borde si está adentro del polígono; ≤ 0 si está afuera. */
export function distanciaAdentro(P: Poligono, q: V2): number {
  let dentro = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i];
    const [xj, zj] = P[j];
    if (zi > q[1] !== zj > q[1] && q[0] < ((xj - xi) * (q[1] - zi)) / (zj - zi) + xi) dentro = !dentro;
  }
  let dmin = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const ab = sub(b, a);
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
    const t = clamp(((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / L2, 0, 1);
    dmin = Math.min(dmin, Math.hypot(q[0] - (a[0] + ab[0] * t), q[1] - (a[1] + ab[1] * t)));
  }
  return dentro ? dmin : -dmin;
}

/** Lado del polígono más cercano a un punto interior (para empujar hacia afuera). */
export function ladoMasCercano(P: Poligono, q: V2): { lado: number; dist: number; normal: V2 } {
  let best = { lado: 0, dist: Infinity, normal: [0, 0] as V2 };
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const ab = sub(b, a);
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
    const t = clamp(((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / L2, 0, 1);
    const d = Math.hypot(q[0] - (a[0] + ab[0] * t), q[1] - (a[1] + ab[1] * t));
    if (d < best.dist) best = { lado: i, dist: d, normal: normalAfuera(P, i) };
  }
  return best;
}
