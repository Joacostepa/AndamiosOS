/**
 * Mover un volumen de referencia (arrastre en el 3D «tipo SketchUp» y en la planta). Puro: devuelve copias.
 * Se traslada la DEFINICIÓN (origen, centro, planta y patios), no la receta del formulario: así no se pierden
 * la base del escalonado, los lados del cilindro ni los patios internos (que están en coordenadas de mundo).
 * Las estructuras no se tocan: las que leen el volumen (escalera, azotea, losa del colgante, envolvente) lo
 * vuelven a leer al construir. Además: inferencia de ejes, encastre contra otros volúmenes y frentes de
 * estructuras, la distancia tipeada y el texto del deshacer.
 */
import type { Diseno, Estructura, Poligono, Resultado, V2, V3, Volumen } from '../tipos.ts';
import { clamp, clone, dirDe, fmt, r3 } from '../util.ts';
import { actualizarVolumen } from './crear.ts';
import { plantaBase, solidosDe } from './geometria.ts';
import type { DefVolumen, VolumenModelado } from './tipos.ts';

/** rojo = a lo largo del volumen · verde = hacia el fondo · azul = vertical · x / z = ejes del mundo (si el volumen está girado). */
export type EjeMovimiento = 'rojo' | 'verde' | 'azul' | 'x' | 'z';
export interface EjePlano {
  eje: Exclude<EjeMovimiento, 'azul'>;
  /** dirección unitaria en planta (x, z) */
  dir: V2;
}

export interface Movilidad {
  /** el volumen y los salientes que lo acompañan */
  ids: string[];
  /** se mueve libre en planta (un saliente solo se desliza sobre su lado) */
  libre: boolean;
  vertical: boolean;
  motivoVertical?: string;
  ejes: EjePlano[];
}

export interface EncastreVolumen {
  punto: V2;
  tipo: 'esquina' | 'borde' | 'frente';
  etiqueta: string;
}

export interface CandidatosEncastre {
  puntos: { p: V2; etiqueta: string }[];
  lineas: { a: V2; b: V2; etiqueta: string; tipo: 'borde' | 'frente' }[];
  cotas: { y: number; etiqueta: string }[];
}

type Saliente = Extract<DefVolumen, { tipo: 'saliente' }>;

const volumenesDe = (d: Diseno): Volumen[] => d.contexto?.volumenes ?? [];
const defDe = (v: Volumen): DefVolumen | undefined => (v as VolumenModelado).def;
const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
const cruz = (a: V2, b: V2) => a[0] * b[1] - a[1] * b[0];
const unit = (a: V2): V2 => {
  const L = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / L, a[1] / L];
};
/** r3 sin «−0» (que deepEqual distingue y se vería en los textos). */
const r3z = (v: number) => r3(v) || 0;
const redondear = (v: number, paso: number) => r3z(Math.round(v / paso) * paso);

/** Ids que se mueven juntos: el volumen y los salientes que cuelgan de él. Un saliente se mueve solo. */
export function grupoDeMovimiento(vols: Volumen[], id: string): string[] {
  const out = vols.some((v) => v.id === id) ? [id] : [];
  for (let i = 0; i < out.length; i++) {
    for (const v of vols) {
      const def = defDe(v);
      if (def?.tipo === 'saliente' && def.padre === out[i] && !out.includes(v.id)) out.push(v.id);
    }
  }
  return out;
}

/** El lado del padre sobre el que está un saliente: inicio, dirección y largo. */
function ladoDeSaliente(vols: Volumen[], def: Saliente): { a: V2; u: V2; largo: number } | null {
  const padre = vols.find((x) => x.id === def.padre);
  if (!padre) return null;
  const P = plantaBase(padre);
  if (P.length < 2) return null;
  const i = def.lado % P.length;
  const a = P[i];
  const b = P[(i + 1) % P.length];
  return { a, u: unit([b[0] - a[0], b[1] - a[1]]), largo: Math.hypot(b[0] - a[0], b[1] - a[1]) };
}

/** La estructura que lee este volumen (`volumenId` en sus params, también anidado: planta de la envolvente). */
function usadoPor(diseno: Diseno, id: string): Estructura | null {
  const busca = (o: unknown, prof: number): boolean => {
    if (!o || typeof o !== 'object' || prof > 3) return false;
    for (const [k, x] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'volumenId' && x === id) return true;
      if (busca(x, prof + 1)) return true;
    }
    return false;
  };
  return diseno.estructuras.find((e) => busca(e.params, 0)) ?? null;
}

const primerLado = (P: Poligono): V2 | null => (P.length >= 2 && Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) > 1e-6 ? unit([P[1][0] - P[0][0], P[1][1] - P[0][1]]) : null);

function ladoMasLargo(P: Poligono): V2 | null {
  let mejor: V2 | null = null;
  let L = 1e-6;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > L + 1e-6) {
      L = l;
      mejor = unit([b[0] - a[0], b[1] - a[1]]);
    }
  }
  return mejor;
}

/** «A lo largo» del volumen: el rumbo de la caja, el primer lado del escalonado, el lado más largo del prisma… */
function ejeRojoDe(v: Volumen, vols: Volumen[]): V2 {
  const def = defDe(v);
  switch (def?.tipo) {
    case 'caja': return dirDe(def.rumbo);
    case 'escalonado': return primerLado(def.planta) ?? [1, 0];
    case 'prisma': return ladoMasLargo(def.planta) ?? [1, 0];
    case 'cilindro': return [1, 0];
    case 'saliente': return ladoDeSaliente(vols, def)?.u ?? [1, 0];
  }
  if (v.escalera) return dirDe(v.escalera.rumbo);
  return primerLado(v.planta) ?? [1, 0];
}

/** Qué movimientos admite el volumen y sus ejes de inferencia (los propios y, si está girado, los del mundo). */
export function movilidadDe(diseno: Diseno, id: string): Movilidad | null {
  const vols = volumenesDe(diseno);
  const v = vols.find((x) => x.id === id);
  if (!v) return null;
  const def = defDe(v);
  const rojo = ejeRojoDe(v, vols);
  const libre = def?.tipo !== 'saliente';
  const ejes: EjePlano[] = [{ eje: 'rojo', dir: rojo }];
  if (libre) {
    ejes.push({ eje: 'verde', dir: [-rojo[1], rojo[0]] });
    const alineado = Math.abs(rojo[0]) > Math.cos((0.5 * Math.PI) / 180) || Math.abs(rojo[1]) > Math.cos((0.5 * Math.PI) / 180);
    if (!alineado) ejes.push({ eje: 'x', dir: [1, 0] }, { eje: 'z', dir: [0, 1] });
  }
  const ids = grupoDeMovimiento(vols, id);
  let motivoVertical: string | undefined;
  // el escalonado mide sus tramos desde el piso (el formulario no lo podría editar más) y una estructura
  // vinculada (azotea, losa del colgante, escalera) subiría o bajaría con el volumen; también la que usa
  // un saliente que lo acompaña (un colgante de la marquesina, una torre sobre el balcón)
  if (def?.tipo === 'escalonado') motivoVertical = 'El escalonado se mueve solo en planta.';
  else {
    for (const x of ids) {
      const est = usadoPor(diseno, x);
      if (!est) continue;
      const sobre = x === id ? '' : ` (sobre ${vols.find((y) => y.id === x)?.nombre || x})`;
      motivoVertical = `Lo usa ${est.nombre || est.id}${sobre}: subirlo o bajarlo cambiaría la estructura.`;
      break;
    }
  }
  return { ids, libre, vertical: !motivoVertical, ...(motivoVertical ? { motivoVertical } : {}), ejes };
}

/**
 * El desplazamiento que el volumen admite: sin vertical si no se puede, el saliente proyectado sobre su lado
 * (y sin salirse de él) y la base dentro del rango de la definición. `mov`: la movilidad ya calculada (la
 * escena la guarda al levantar el volumen y no la recalcula en cada cuadro).
 */
export function limitarDelta(diseno: Diseno, id: string, d: V3, mov?: Movilidad): V3 {
  const vols = volumenesDe(diseno);
  const v = vols.find((x) => x.id === id);
  const m = v ? mov ?? movilidadDe(diseno, id) : null;
  if (!v || !m) return [0, 0, 0];
  let [dx, dy, dz] = d;
  const def = defDe(v);
  if (!m.vertical) dy = 0;
  if (def?.tipo === 'saliente') {
    const lado = ladoDeSaliente(vols, def);
    if (!lado) {
      dx = 0;
      dz = 0;
    } else {
      const max = Math.max(lado.largo - def.largo, def.desde);
      const min = Math.min(0, def.desde);
      const t = clamp(def.desde + dx * lado.u[0] + dz * lado.u[1], min, max) - def.desde;
      dx = lado.u[0] * t;
      dz = lado.u[1] * t;
    }
    dy = clamp(dy, -10 - def.yBase, 300 - def.yBase);
  } else {
    dy = clamp(dy, -20 - v.yBase, 300 - v.yBase);
  }
  return [r3z(dx), r3z(dy), r3z(dz)];
}

/**
 * Traslada una definición. El saliente se desliza sobre su lado (`desde`, necesita `todos` para el padre)
 * y sube con su base y su repetición; el resto mueve origen, centro o planta, sus patios y su base.
 */
export function moverDef(def: DefVolumen, d: V3, todos: Volumen[] = []): DefVolumen {
  const [dx, dy, dz] = d;
  const x = clone(def);
  const P = (p: V2): V2 => [r3(p[0] + dx), r3(p[1] + dz)];
  const subir = (o: { yBase?: number }) => {
    if (dy) o.yBase = r3((o.yBase ?? 0) + dy);
  };
  switch (x.tipo) {
    case 'caja':
      x.origen = P(x.origen);
      subir(x);
      break;
    case 'prisma':
      x.planta = x.planta.map(P);
      subir(x);
      break;
    case 'escalonado':
      x.planta = x.planta.map(P);
      if (dy) {
        subir(x);
        x.tramos = x.tramos.map((t) => ({ ...t, hasta: r3(t.hasta + dy) }));
      }
      break;
    case 'cilindro':
      x.centro = P(x.centro);
      subir(x);
      break;
    case 'saliente': {
      const lado = ladoDeSaliente(todos, x);
      if (lado) x.desde = r3(x.desde + dx * lado.u[0] + dz * lado.u[1]);
      if (dy) {
        x.yBase = r3(x.yBase + dy);
        if (x.repetir) x.repetir = { ...x.repetir, hasta: r3(x.repetir.hasta + dy) };
      }
      break;
    }
  }
  if (x.tipo !== 'cilindro' && x.tipo !== 'saliente' && x.huecos) {
    x.huecos = x.huecos.map((h) => ({
      ...h, planta: h.planta.map(P),
      ...(dy && h.yBase !== undefined ? { yBase: r3(h.yBase + dy) } : {}),
      ...(dy && h.yTope !== undefined ? { yTope: r3(h.yTope + dy) } : {}),
    }));
  }
  return x;
}

/**
 * Mueve el volumen `id` (con sus salientes) `d` = [dx, dy, dz] en mundo. Con definición, por actualizarVolumen
 * (recalcula planta, cotas y salientes); sin definición (patio suelto, azotea, losa, escalera de una plantilla),
 * traslada planta, cotas y el origen y los descansos de la escalera. No toca las estructuras.
 * `delta` es lo que realmente se movió (ver limitarDelta); los avisos son solo de los volúmenes movidos.
 */
export function moverVolumen(diseno: Diseno, id: string, d: V3): { diseno: Diseno; avisos: string[]; movidos: string[]; delta: V3 } {
  const vols0 = volumenesDe(diseno);
  const delta = limitarDelta(diseno, id, d);
  const [dx, dy, dz] = delta;
  if (!vols0.some((v) => v.id === id) || Math.hypot(dx, dy, dz) < 1e-6) return { diseno, avisos: [], movidos: [], delta: [0, 0, 0] };
  const movidos = grupoDeMovimiento(vols0, id);
  const hijos = movidos.slice(1);
  let out = clone(diseno);
  const vols = out.contexto.volumenes;
  // los salientes acompañan en altura; en planta los acomoda el recálculo (se arman sobre el lado del padre)
  if (dy) {
    for (const h of hijos) {
      const i = vols.findIndex((x) => x.id === h);
      const vh = vols[i] as VolumenModelado;
      vols[i] = { ...vh, def: moverDef(vh.def, [0, dy, 0]) } as VolumenModelado;
    }
  }
  const i = vols.findIndex((x) => x.id === id);
  const v = vols[i];
  const def = defDe(v);
  let avisos: string[] = [];
  if (def) {
    const r = actualizarVolumen(out, id, { def: moverDef(def, delta, vols) });
    out = r.diseno;
    avisos = r.avisos;
  } else {
    const P = (p: V2): V2 => [r3(p[0] + dx), r3(p[1] + dz)];
    const nuevo: Volumen = { ...v, planta: v.planta.map(P), yBase: r3(v.yBase + dy), yTope: r3(v.yTope + dy) };
    // la escalera se muestrea desde su origen (mundo) y sus descansos tienen cota absoluta
    if (v.escalera) nuevo.escalera = { ...v.escalera, origen: P(v.escalera.origen), descansos: v.escalera.descansos.map((x) => ({ ...x, cota: r3(x.cota + dy) })) };
    vols[i] = nuevo;
    // actualizarVolumen no recalcula a partir de un volumen sin def: se pide sobre un saliente hijo
    if (hijos.length) {
      const r = actualizarVolumen(out, hijos[0], {});
      out = r.diseno;
      avisos = r.avisos;
    }
  }
  const prefijos = movidos.map((m) => {
    const x = vols0.find((y) => y.id === m);
    return `${x?.nombre || m}: `;
  });
  return { diseno: out, avisos: avisos.filter((t) => prefijos.some((p) => t.startsWith(p))), movidos, delta };
}

// ───────────── inferencia ─────────────

/** El eje (propio o del mundo) más cercano a la dirección del movimiento, si está a menos de `tolGrados`. */
export function inferirEje(delta: V2, ejes: EjePlano[], tolGrados = 4): EjePlano | null {
  const L = Math.hypot(delta[0], delta[1]);
  if (L < 1e-6) return null;
  let mejor: EjePlano | null = null;
  let amin = (tolGrados * Math.PI) / 180;
  for (const e of ejes) {
    const a = Math.acos(Math.min(1, Math.abs(dot(delta, e.dir)) / L));
    if (a < amin) {
      amin = a;
      mejor = e;
    }
  }
  return mejor;
}

/** Proyección del movimiento sobre una dirección unitaria. */
export function proyectar(delta: V2, dir: V2): V2 {
  const t = dot(delta, dir);
  return [dir[0] * t, dir[1] * t];
}

/**
 * Parámetro t del punto del eje (ejeO + t·ejeD) más cercano al rayo del puntero (rayO + s·rayD, s > 0).
 * Sirve con el eje bloqueado y para subir y bajar, aunque la cámara mire casi de costado. null = paralelos.
 */
export function puntoEnEje(rayO: V3, rayD: V3, ejeO: V3, ejeD: V3): number | null {
  const w: V3 = [rayO[0] - ejeO[0], rayO[1] - ejeO[1], rayO[2] - ejeO[2]];
  const p = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a = p(rayD, rayD);
  const b = p(rayD, ejeD);
  const c = p(ejeD, ejeD);
  const dd = p(rayD, w);
  const e = p(ejeD, w);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-9 * a * c) return null;
  const s = (b * e - c * dd) / den;
  if (s <= 0) return null;
  return (a * e - b * dd) / den;
}

// ───────────── encastre ─────────────

/** Plantas y cotas de lo que se mueve (para probarlas contra los candidatos). */
export function formaMovil(diseno: Diseno, ids: Iterable<string>): { plantas: Poligono[]; cotas: number[] } {
  const vols = volumenesDe(diseno);
  const set = new Set(ids);
  const plantas: Poligono[] = [];
  const cotas = new Set<number>();
  for (const v of vols) {
    if (!set.has(v.id)) continue;
    for (const s of solidosDe(v, vols)) {
      if (s.rol === 'cupula' || s.rol === 'hueco') continue;
      plantas.push(s.planta);
      cotas.add(s.yBase).add(s.yTope);
    }
  }
  return { plantas, cotas: [...cotas] };
}

/**
 * Contra qué se encastra: esquinas y bordes de los otros volúmenes (sin `excluir`), sus cotas y el piso, y de las
 * estructuras la huella, la línea del frente (marco) y, en una fachada, la línea de la pared (el retiro detrás).
 */
export function candidatosEncastre(diseno: Diseno, excluir: Iterable<string>, res?: Pick<Resultado, 'estructuras'>): CandidatosEncastre {
  const fuera = new Set(excluir);
  const vols = volumenesDe(diseno);
  const out: CandidatosEncastre = { puntos: [], lineas: [], cotas: [{ y: 0, etiqueta: 'Piso' }] };
  const poligono = (P: Poligono, de: string) => {
    for (let i = 0; i < P.length; i++) {
      out.puntos.push({ p: P[i], etiqueta: `Esquina de ${de}` });
      out.lineas.push({ a: P[i], b: P[(i + 1) % P.length], etiqueta: `Borde de ${de}`, tipo: 'borde' });
    }
  };
  for (const v of vols) {
    if (fuera.has(v.id)) continue;
    const nom = v.nombre || v.id;
    const def = defDe(v);
    if (def?.tipo === 'cilindro') out.puntos.push({ p: def.centro, etiqueta: `Centro de ${nom}` });
    for (const s of solidosDe(v, vols)) {
      if (s.rol === 'cupula') continue;
      poligono(s.planta, nom);
      out.cotas.push({ y: s.yTope, etiqueta: `Arriba de ${nom}` }, { y: s.yBase, etiqueta: `Base de ${nom}` });
    }
  }
  for (const e of res?.estructuras ?? []) {
    if (e.huella.length > 2) poligono(e.huella, e.nombre);
    const rb = (e.marco.rumbo * Math.PI) / 180;
    const frentes = (e.info?.frentes as { rumbo?: number; origen?: V2; S?: number[] }[] | undefined) ?? [];
    const tramos: { o: V2; u: V2; L: number }[] = [];
    if (frentes.length > 1) {
      // frentes en el marco local de la estructura (como en la vista 3D)
      for (const F of frentes) {
        if (F.rumbo === undefined || !F.origen) continue;
        const o: V2 = [
          e.marco.origen[0] + Math.cos(rb) * F.origen[0] - Math.sin(rb) * F.origen[1],
          e.marco.origen[1] + Math.sin(rb) * F.origen[0] + Math.cos(rb) * F.origen[1],
        ];
        tramos.push({ o, u: dirDe(e.marco.rumbo + F.rumbo), L: F.S?.length ? F.S[F.S.length - 1] : 0 });
      }
    } else if (e.ml > 0) tramos.push({ o: e.marco.origen, u: dirDe(e.marco.rumbo), L: e.ml });
    const est = diseno.estructuras.find((x) => x.id === e.id);
    const retiro = e.tipologia !== 'fachada' ? null : typeof est?.params.retiro === 'number' ? est.params.retiro : 0.2;
    for (const t of tramos) {
      if (t.L < 0.05) continue;
      const b: V2 = [t.o[0] + t.u[0] * t.L, t.o[1] + t.u[1] * t.L];
      out.lineas.push({ a: t.o, b, etiqueta: `Frente de ${e.nombre}`, tipo: 'frente' });
      if (retiro !== null) {
        // la pared queda `retiro` detrás de la línea de la fachada (n = izquierda del rumbo)
        const n: V2 = [-t.u[1], t.u[0]];
        const pa: V2 = [t.o[0] - n[0] * retiro, t.o[1] - n[1] * retiro];
        const pb: V2 = [b[0] - n[0] * retiro, b[1] - n[1] * retiro];
        out.lineas.push({ a: pa, b: pb, etiqueta: `Pared de ${e.nombre}`, tipo: 'frente' });
        out.puntos.push({ p: pa, etiqueta: `Pared de ${e.nombre}` }, { p: pb, etiqueta: `Pared de ${e.nombre}` });
      }
    }
  }
  return out;
}

function cercanoEnSegmento(q: V2, a: V2, b: V2): V2 {
  const ab: V2 = [b[0] - a[0], b[1] - a[1]];
  const L2 = dot(ab, ab);
  const t = L2 < 1e-12 ? 0 : clamp(dot([q[0] - a[0], q[1] - a[1]], ab) / L2, 0, 1);
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
}

/** t para el que p + u·t cae sobre el segmento a–b (null si son paralelos o no lo cruza). */
function cruceSegmento(p: V2, u: V2, a: V2, b: V2): number | null {
  const w: V2 = [b[0] - a[0], b[1] - a[1]];
  const den = cruz(u, w);
  if (Math.abs(den) < 1e-9) return null;
  const ap: V2 = [a[0] - p[0], a[1] - p[1]];
  const t = cruz(ap, w) / den;
  const s = cruz(ap, u) / den;
  return s >= -1e-6 && s <= 1 + 1e-6 ? t : null;
}

/**
 * Ajusta el movimiento en planta: la esquina propia más cercana a una esquina ajena, o a un borde o frente
 * (o un borde propio contra una esquina ajena), dentro de `tol` metros (la escena la escala con la pantalla).
 * Con `dir` (eje inferido o bloqueado) solo se corre a lo largo de esa dirección. Si no encastra, redondea a `paso`.
 */
export function encastrar(moviles: Poligono[], delta: V2, cand: CandidatosEncastre, o: { tol: number; dir?: V2 | null; paso?: number }): { delta: V2; encastre: EncastreVolumen | null } {
  const paso = o.paso ?? 0.05;
  let mejor: { d: number; delta: V2; enc: EncastreVolumen } | null = null;
  /** true si es el mejor hasta ahora */
  const probar = (dist: number, nd: V2, enc: EncastreVolumen): boolean => {
    if (dist > o.tol || (mejor && dist >= mejor.d - 1e-9)) return false;
    mejor = { d: dist, delta: nd, enc };
    return true;
  };
  const esquinas = moviles.flat();
  const bordes = moviles.flatMap((P) => P.map((a, i) => [a, P[(i + 1) % P.length]] as [V2, V2]));
  if (!o.dir) {
    for (const m of esquinas) {
      const q: V2 = [m[0] + delta[0], m[1] + delta[1]];
      for (const c of cand.puntos) probar(Math.hypot(q[0] - c.p[0], q[1] - c.p[1]), [c.p[0] - m[0], c.p[1] - m[1]], { punto: c.p, tipo: 'esquina', etiqueta: c.etiqueta });
    }
    if (!mejor) {
      let tangente: V2 | null = null;
      for (const m of esquinas) {
        const q: V2 = [m[0] + delta[0], m[1] + delta[1]];
        for (const l of cand.lineas) {
          const p = cercanoEnSegmento(q, l.a, l.b);
          if (probar(Math.hypot(q[0] - p[0], q[1] - p[1]), [delta[0] + p[0] - q[0], delta[1] + p[1] - q[1]], { punto: p, tipo: l.tipo, etiqueta: l.etiqueta })) tangente = unit([l.b[0] - l.a[0], l.b[1] - l.a[1]]);
        }
      }
      for (const [a, b] of bordes) {
        const qa: V2 = [a[0] + delta[0], a[1] + delta[1]];
        const qb: V2 = [b[0] + delta[0], b[1] + delta[1]];
        for (const c of cand.puntos) {
          const p = cercanoEnSegmento(c.p, qa, qb);
          if (probar(Math.hypot(c.p[0] - p[0], c.p[1] - p[1]), [delta[0] + c.p[0] - p[0], delta[1] + c.p[1] - p[1]], { punto: c.p, tipo: 'borde', etiqueta: c.etiqueta })) tangente = unit([b[0] - a[0], b[1] - a[1]]);
        }
      }
      // pegado a una línea: a lo largo de ella también redondea al paso (sigue tocándola)
      const mj = mejor as { d: number; delta: V2; enc: EncastreVolumen } | null;
      if (mj && tangente) {
        const tg = dot(mj.delta, tangente);
        const k = redondear(tg, paso) - tg;
        mj.delta = [mj.delta[0] + tangente[0] * k, mj.delta[1] + tangente[1] * k];
      }
    }
    const mj = mejor as { delta: V2; enc: EncastreVolumen } | null;
    if (mj) return { delta: [r3z(mj.delta[0]), r3z(mj.delta[1])], encastre: mj.enc };
    return { delta: [redondear(delta[0], paso), redondear(delta[1], paso)], encastre: null };
  }
  const u = unit(o.dir);
  const t0 = dot(delta, u);
  const en = (t: number): V2 => [u[0] * t, u[1] * t];
  // esquina propia alineada con una esquina ajena sobre el eje
  for (const m of esquinas) {
    for (const c of cand.puntos) {
      const tc = dot([c.p[0] - m[0], c.p[1] - m[1]], u);
      const perp = Math.abs(cruz(u, [c.p[0] - m[0], c.p[1] - m[1]]));
      if (perp <= o.tol) probar(Math.abs(tc - t0), en(tc), { punto: c.p, tipo: 'esquina', etiqueta: c.etiqueta });
    }
  }
  // la esquina propia llega a un borde o frente; o un borde propio llega a una esquina ajena (a igual
  // distancia sobre el eje gana la esquina, que se probó antes)
  for (const m of esquinas) {
    for (const l of cand.lineas) {
      const t = cruceSegmento(m, u, l.a, l.b);
      if (t !== null) probar(Math.abs(t - t0), en(t), { punto: [m[0] + u[0] * t, m[1] + u[1] * t], tipo: l.tipo, etiqueta: l.etiqueta });
    }
  }
  for (const [a, b] of bordes) {
    for (const c of cand.puntos) {
      const t = cruceSegmento(c.p, [-u[0], -u[1]], a, b);
      if (t !== null) probar(Math.abs(t - t0), en(t), { punto: c.p, tipo: 'borde', etiqueta: c.etiqueta });
    }
  }
  const mj = mejor as { delta: V2; enc: EncastreVolumen } | null;
  if (mj) return { delta: [r3z(mj.delta[0]), r3z(mj.delta[1])], encastre: mj.enc };
  const t = redondear(t0, paso);
  return { delta: [r3z(u[0] * t), r3z(u[1] * t)], encastre: null };
}

/** Lo mismo en altura: la base o el tope propios contra el tope o la base de otro volumen, o el piso. */
export function encastrarCota(cotas: number[], dy: number, cand: CandidatosEncastre, o: { tol: number; paso?: number }): { dy: number; cota: { y: number; etiqueta: string } | null } {
  let mejor: { d: number; dy: number; cota: { y: number; etiqueta: string } } | null = null;
  for (const y of cotas) {
    for (const c of cand.cotas) {
      const d = Math.abs(y + dy - c.y);
      if (d <= o.tol && (!mejor || d < mejor.d - 1e-9)) mejor = { d, dy: r3z(c.y - y), cota: c };
    }
  }
  return mejor ? { dy: mejor.dy, cota: mejor.cota } : { dy: redondear(dy, o.paso ?? 0.05), cota: null };
}

// ───────────── distancia tipeada y textos ─────────────

/**
 * La distancia tipeada (la caja de medidas de SketchUp) en la dirección actual: el eje (inferido o bloqueado)
 * con el sentido del movimiento, o la dirección del movimiento. En azul, sube o baja según el movimiento.
 */
export function deltaPorDistancia(eje: EjeMovimiento | null, dir: V2 | null, dist: number, actual: V3): V3 | null {
  if (!Number.isFinite(dist)) return null;
  if (eje === 'azul') return [0, r3z((actual[1] < 0 ? -1 : 1) * dist), 0];
  let u = dir;
  if (!u) {
    const L = Math.hypot(actual[0], actual[2]);
    if (L < 1e-6) return null;
    u = [actual[0] / L, actual[2] / L];
  }
  const s = actual[0] * u[0] + actual[2] * u[1] < 0 ? -1 : 1;
  return [r3z(u[0] * dist * s), 0, r3z(u[1] * dist * s)];
}

export const distanciaMovimiento = (d: V3): number => Math.hypot(d[0], d[1], d[2]);

/** Texto del deshacer: «Edificio: mover 3,20 m»; solo en altura, «Tanque: subir 1,50 m» o «bajar». */
export function nombreMovimiento(nombre: string, d: V3): string {
  const h = Math.hypot(d[0], d[2]);
  if (h < 0.005 && Math.abs(d[1]) >= 0.005) return `${nombre}: ${d[1] > 0 ? 'subir' : 'bajar'} ${fmt(Math.abs(d[1]))} m`;
  return `${nombre}: mover ${fmt(distanciaMovimiento(d))} m`;
}
