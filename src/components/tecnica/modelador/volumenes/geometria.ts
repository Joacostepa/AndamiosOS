// Volúmenes de referencia en la pantalla: adaptador sobre la lógica oficial
// (src/lib/tecnica/modelo/volumenes). Lo que se guarda en diseno.contexto.volumenes es el formato
// del núcleo (VolumenModelado: planta y cotas + `def` versionada); acá solo se traduce entre esa
// `def` y la «receta» que editan los formularios (FormaVolumen), que se deriva de la def y no se
// guarda. Los patios sueltos (sin cuerpo que los contenga) van como volumen sin def con
// `hueco: true`, que la lógica oficial entiende como patio.

import {
  actualizarVolumen, agregarVolumen, carasDe as carasLib, circulo, quitarVolumen, rectanguloCaja, solidosDe,
  volumenDesdeDef,
  type Cara, type DefVolumen, type Diseno, type Poligono, type Solido, type V2, type Volumen, type VolumenModelado,
} from "@/lib/tecnica/modelo";

export { VERSION_VOLUMENES } from "@/lib/tecnica/modelo";
export type { Cara, Solido };

export type TipoSaliente = "balcon" | "marquesina" | "cornisa";

/** La receta que edita el formulario. Se deriva de la def del volumen (no se guarda). */
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
      forma: "saliente"; tipo: TipoSaliente; sobre: string;
      /** Lado del volumen padre (índice de su planta base, el mismo que usa la def). */
      cara: number;
      /** Desde dónde arranca sobre el lado (m desde su primer vértice) y cuánto mide. */
      desde: number; largo: number; vuelo: number; altura: number; espesor: number;
    }
  | { forma: "cilindro"; centro: V2; radio: number; alto: number; cupula: boolean; altoCupula: number; yBase: number }
  | { forma: "hueco"; largo: number; ancho: number; origen: V2; rumbo: number; yBase: number; alto: number };

/** Volumen del contexto tal como lo guarda el núcleo (más la marca de patio suelto). */
export type VolumenRef = Volumen & Partial<Pick<VolumenModelado, "def" | "defVersion">> & { hueco?: boolean };

export const NOMBRE_FORMA: Record<FormaVolumen["forma"], string> = {
  caja: "Caja", prisma: "Prisma por planta", escalonado: "Escalonado (retranqueos)", saliente: "Saliente",
  cilindro: "Cilindro / cúpula", hueco: "Hueco / patio",
};

export const NOMBRE_SALIENTE: Record<TipoSaliente, string> = { balcon: "Balcón", marquesina: "Marquesina", cornisa: "Cornisa" };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const LADOS_CILINDRO = 24;

const volumenesDe = (d: Diseno) => (d.contexto?.volumenes ?? []) as VolumenRef[];

// ───────────── receta ↔ def ─────────────

/** Rectángulo de 4 puntos → origen, rumbo, largo y ancho (el inverso de rectanguloCaja). */
function rectanguloInverso(p: Poligono): { origen: V2; rumbo: number; largo: number; ancho: number } | null {
  if (p.length !== 4) return null;
  const [a, b, , d] = p;
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ancho = Math.hypot(d[0] - a[0], d[1] - a[1]);
  if (largo < 1e-3 || ancho < 1e-3) return null;
  // tiene que ser rectángulo: lados a-b y a-d perpendiculares
  if (Math.abs((b[0] - a[0]) * (d[0] - a[0]) + (b[1] - a[1]) * (d[1] - a[1])) > 1e-2 * largo * ancho) return null;
  // la planta se guarda redondeada al mm: rumbo a la centésima de grado y medidas al cm
  return { origen: a, rumbo: r2((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI), largo: r2(largo), ancho: r2(ancho) };
}

/** La def oficial que corresponde a una receta (null para un patio suelto, que no lleva def). */
export function defDesdeForma(f: FormaVolumen, previa?: DefVolumen): DefVolumen | null {
  const conservar = <K extends string>(claves: K[]) => {
    const out: Record<string, unknown> = {};
    if (previa) for (const k of claves) if (k in previa) out[k] = (previa as unknown as Record<string, unknown>)[k];
    return out;
  };
  switch (f.forma) {
    case "caja":
      return { tipo: "caja", origen: f.origen, rumbo: f.rumbo, largo: f.largo, ancho: f.ancho, alto: f.alto, yBase: f.yBase, ...conservar(["medianeras", "huecos"]) };
    case "prisma":
      return { tipo: "prisma", planta: f.puntos, alto: f.alto, yBase: f.yBase, ...conservar(["medianeras", "huecos"]) };
    case "escalonado": {
      let hasta = 0;
      let acumulado = 0;
      const tramos = f.pisos.map((p, k) => {
        hasta = r3(hasta + p.alto);
        if (k > 0) acumulado = r3(acumulado + Math.max(0, p.retiro));
        return { hasta, retiro: f.lados === "todos" ? acumulado : [acumulado, 0, 0, 0] };
      });
      return { tipo: "escalonado", planta: rectanguloCaja(f.origen, f.rumbo, f.largo, f.ancho), tramos, ...conservar(["medianeras", "huecos"]) };
    }
    case "saliente":
      return {
        tipo: "saliente", padre: f.sobre, lado: f.cara, desde: f.desde, largo: f.largo, vuelo: f.vuelo, yBase: f.altura, espesor: f.espesor, clase: f.tipo,
        ...conservar(["antepecho", "repetir"]),
      };
    case "cilindro":
      return {
        tipo: "cilindro", centro: f.centro, radio: f.radio, alto: f.alto, yBase: f.yBase, lados: LADOS_CILINDRO,
        cupula: f.cupula ? { alto: Math.max(0.1, f.altoCupula) } : null, clase: f.cupula ? "cupula" : previa?.tipo === "cilindro" && previa.clase !== "cupula" ? previa.clase : "tanque",
      };
    case "hueco":
      return null;
  }
}

/** La receta de un volumen guardado, o null si no se puede editar con el formulario. */
export function formaDe(v: VolumenRef): FormaVolumen | null {
  const def = v.def;
  if (!def) {
    if (!v.hueco) return null;
    const r = rectanguloInverso(v.planta);
    return r ? { forma: "hueco", ...r, yBase: v.yBase, alto: r3(v.yTope - v.yBase) } : null;
  }
  switch (def.tipo) {
    case "caja":
      return { forma: "caja", origen: def.origen, rumbo: def.rumbo, largo: def.largo, ancho: def.ancho, alto: def.alto, yBase: def.yBase ?? 0 };
    case "prisma":
      return { forma: "prisma", puntos: def.planta, alto: def.alto, yBase: def.yBase ?? 0 };
    case "cilindro":
      return { forma: "cilindro", centro: def.centro, radio: def.radio, alto: def.alto, yBase: def.yBase ?? 0, cupula: !!def.cupula, altoCupula: def.cupula?.alto ?? 3 };
    case "saliente":
      return { forma: "saliente", tipo: def.clase, sobre: def.padre, cara: def.lado, desde: def.desde, largo: def.largo, vuelo: def.vuelo, altura: def.yBase, espesor: def.espesor };
    case "escalonado": {
      const r = rectanguloInverso(def.planta);
      if (!r || (def.yBase ?? 0) !== 0) return null;
      const frente = (t: (typeof def.tramos)[number]) => (Array.isArray(t.retiro) ? (t.retiro[0] ?? 0) : t.retiro);
      const todos = def.tramos.every((t) => !Array.isArray(t.retiro));
      if (!todos && def.tramos.some((t) => Array.isArray(t.retiro) && t.retiro.slice(1).some((x) => x !== 0))) return null;
      let antes = 0;
      let retiroAntes = 0;
      const pisos = def.tramos.map((t, k) => {
        const p = { alto: r3(t.hasta - antes), retiro: k === 0 ? 0 : r3(frente(t) - retiroAntes) };
        antes = t.hasta;
        retiroAntes = frente(t);
        return p;
      });
      return { forma: "escalonado", ...r, pisos, lados: todos ? "todos" : "frente" };
    }
  }
}

// ───────────── alta, edición y baja ─────────────

/** Id nuevo que no choca con los del diseño. */
export function nuevoIdVolumen(diseno: Diseno): string {
  const usados = new Set(volumenesDe(diseno).map((v) => v.id));
  let n = 1;
  while (usados.has(`V${n}`)) n++;
  return `V${n}`;
}

function patioSuelto(id: string, nombre: string, f: Extract<FormaVolumen, { forma: "hueco" }>): VolumenRef {
  return { id, nombre, tipo: "edificio", hueco: true, planta: rectanguloCaja(f.origen, f.rumbo, f.largo, f.ancho), yBase: f.yBase, yTope: r3(f.yBase + f.alto) };
}

/**
 * Crea o reemplaza el volumen `id` con la receta. Los salientes que cuelgan de él se recalculan
 * (lo hace la lógica oficial). Devuelve el diseño nuevo y los avisos de la geometría.
 */
export function ponerForma(diseno: Diseno, id: string, forma: FormaVolumen, nombre: string): { diseno: Diseno; avisos: string[] } {
  const existe = volumenesDe(diseno).find((v) => v.id === id);
  const def = defDesdeForma(forma, existe?.def);
  if (!def) {
    const d = structuredClone(diseno);
    const nuevo = patioSuelto(id, nombre, forma as Extract<FormaVolumen, { forma: "hueco" }>);
    const vols = volumenesDe(d);
    const i = vols.findIndex((v) => v.id === id);
    if (i >= 0) vols[i] = nuevo;
    else vols.push(nuevo);
    d.contexto.volumenes = vols;
    return { diseno: d, avisos: [] };
  }
  if (existe?.def) return actualizarVolumen(diseno, id, { def, nombre });
  if (existe) {
    // era un patio suelto (o un volumen sin def) y pasa a tener receta: se reemplaza en su lugar
    const d = structuredClone(diseno);
    const vols = volumenesDe(d);
    const r = volumenDesdeDef(id, def, vols, nombre);
    vols[vols.findIndex((v) => v.id === id)] = r.volumen;
    d.contexto.volumenes = vols;
    return { diseno: d, avisos: r.avisos };
  }
  const r = agregarVolumen(diseno, def, { id, nombre });
  return { diseno: r.diseno, avisos: r.avisos };
}

/** Borra el volumen (y sus salientes). */
export function quitarGrupo(diseno: Diseno, id: string): Diseno {
  return quitarVolumen(diseno, id);
}

/** La receta del volumen, con su nombre. */
export function formaDeGrupo(diseno: Diseno, id: string): { forma: FormaVolumen; nombre: string } | null {
  const v = volumenesDe(diseno).find((x) => x.id === id);
  const forma = v ? formaDe(v) : null;
  return v && forma ? { forma, nombre: v.nombre || v.id } : null;
}

/** Los volúmenes para la lista del panel (uno por volumen, con su receta si la tiene). */
export function gruposDe(diseno: Diseno): { grupo: string; nombre: string; forma: FormaVolumen | null; volumen: VolumenRef; yTope: number }[] {
  return volumenesDe(diseno).map((v) => ({ grupo: v.id, nombre: v.nombre || v.id, forma: formaDe(v), volumen: v, yTope: v.yTope }));
}

/**
 * Lados de la planta base de un volumen, en el mismo orden que usa `def.lado` de un saliente.
 * (Para un patio suelto o un volumen sin def, los lados de su planta.)
 */
export function ladosDe(v: VolumenRef): { lado: number; largo: number }[] {
  const def = v.def;
  const P: Poligono =
    def?.tipo === "caja" ? rectanguloCaja(def.origen, def.rumbo, def.largo, def.ancho)
      : def?.tipo === "prisma" || def?.tipo === "escalonado" ? def.planta
        : def?.tipo === "cilindro" ? circulo(def.centro, def.radio, def.lados ?? 16)
          : v.planta;
  return P.map((a, i) => {
    const b = P[(i + 1) % P.length];
    return { lado: i, largo: r3(Math.hypot(b[0] - a[0], b[1] - a[1])) };
  });
}

/** Sólidos de todos los volúmenes (lo que se dibuja: tramos, cúpula, balcones repetidos, patios). */
export function solidosDelDiseno(diseno: Diseno): Solido[] {
  const vols = volumenesDe(diseno);
  return vols.flatMap((v) => solidosDe(v, vols));
}

/** Caras clicables de un volumen («modelar arriba»). */
export function carasDe(v: VolumenRef, diseno: Diseno): Cara[] {
  return carasLib(v, volumenesDe(diseno));
}

/** Un saliente nuevo sobre un lado, con medidas típicas por tipo. */
export function salientePorDefecto(tipo: TipoSaliente, sobre: string, cara: number, largoCara: number): Extract<FormaVolumen, { forma: "saliente" }> {
  const def = {
    marquesina: { vuelo: 1.2, altura: 3, espesor: 0.15 },
    balcon: { vuelo: 1.0, altura: 3, espesor: 0.15 },
    cornisa: { vuelo: 0.5, altura: 9, espesor: 0.4 },
  }[tipo];
  return { forma: "saliente", tipo, sobre, cara, desde: 0, largo: r3(largoCara), ...def };
}

// ───────────── formato provisorio de la pantalla (solo /prueba y la demo) ─────────────

type VolumenViejo = VolumenRef & { grupo?: string; forma?: FormaVolumen & { pisos?: unknown; tipo?: unknown } };

/**
 * Convierte volúmenes guardados con la capa provisoria de la pantalla (con `forma` y `grupo`, el
 * escalonado partido en varios volúmenes) al formato oficial. Los demás quedan como están.
 */
export function migrarVolumenesPantalla(diseno: Diseno): Diseno {
  const vols = volumenesDe(diseno) as VolumenViejo[];
  if (!vols.some((v) => v.forma || v.grupo)) return diseno;
  let d: Diseno = structuredClone(diseno);
  d.contexto.volumenes = vols.filter((v) => !v.forma && !v.grupo).map((v) => ({ ...v }));
  // primero los cuerpos, después los salientes (necesitan al padre)
  const conForma = vols.filter((v) => v.forma).sort((a, b) => Number(a.forma!.forma === "saliente") - Number(b.forma!.forma === "saliente"));
  for (const v of conForma) {
    const f = v.forma!;
    // ojo: la capa vieja numeraba las caras sobre el polígono recorrido al revés; el lado de un
    // saliente se toma tal cual y puede quedar en otro lado (son datos de prueba)
    const id = v.grupo ?? v.id;
    d = ponerForma(d, id, f, v.nombre || id).diseno;
  }
  return d;
}
