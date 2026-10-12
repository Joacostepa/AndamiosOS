// Lógica pura del organigrama: el árbol, quién ocupa qué, qué hay para revisar, la búsqueda
// «¿A quién le pregunto?» y el diff entre versiones. Sin red ni React: la usan las pantallas y
// los tests (docs/organigrama/modulo.md).
//
// DECISIÓN: la integridad del árbol se chequea acá ANTES de llegar a la base (creaCiclo), para
// deshabilitar opciones en «Mover a…». En la base la garantiza además un trigger.

import type {
  Cambio,
  CodigoDoc,
  Cuadrilla,
  DatosOrg,
  Documento,
  Modalidad,
  Nodo,
  Ocupante,
  Persona,
  RolDoc,
  Tarea,
} from "./tipos";

// ── Árbol ────────────────────────────────────────────────────────────────────

export function nodoDe(nodos: Nodo[], clave: string | null | undefined): Nodo | undefined {
  return clave ? nodos.find((x) => x.clave === clave) : undefined;
}

export function raiz(nodos: Nodo[]): Nodo | undefined {
  return nodos.find((x) => x.dependeDe === null);
}

/** Hijos directos, en el orden de la estructura. */
export function hijos(nodos: Nodo[], clave: string): Nodo[] {
  return nodos.filter((x) => x.dependeDe === clave).sort((a, b) => a.orden - b.orden);
}

/** Del padre a la raíz. Corta si encuentra un ciclo (no debería haber, pero no se cuelga). */
export function ancestros(nodos: Nodo[], clave: string): Nodo[] {
  const fuera: Nodo[] = [];
  const vistos = new Set([clave]);
  let actual = nodoDe(nodos, nodoDe(nodos, clave)?.dependeDe);
  while (actual && !vistos.has(actual.clave)) {
    fuera.push(actual);
    vistos.add(actual.clave);
    actual = nodoDe(nodos, actual.dependeDe);
  }
  return fuera;
}

/** Todos los que dependen de `clave`, a cualquier profundidad (sin incluirlo). */
export function descendientes(nodos: Nodo[], clave: string): Nodo[] {
  const fuera: Nodo[] = [];
  const pendientes = [clave];
  const vistos = new Set([clave]);
  while (pendientes.length) {
    const actual = pendientes.shift()!;
    for (const h of hijos(nodos, actual)) {
      if (vistos.has(h.clave)) continue;
      vistos.add(h.clave);
      fuera.push(h);
      pendientes.push(h.clave);
    }
  }
  return fuera;
}

/** El área de un nodo: él mismo si es área o dirección, si no el ancestro área más cercano. */
export function areaDe(nodos: Nodo[], clave: string): Nodo | undefined {
  const n = nodoDe(nodos, clave);
  if (!n) return undefined;
  if (n.tipo !== "puesto") return n;
  return ancestros(nodos, clave).find((a) => a.tipo !== "puesto");
}

/** Los puestos que cuelgan de un área, en profundidad, con su nivel (0 = hijo directo). */
export function puestosDeArea(nodos: Nodo[], area: string): { nodo: Nodo; nivel: number }[] {
  const fuera: { nodo: Nodo; nivel: number }[] = [];
  const visitar = (clave: string, nivel: number) => {
    for (const h of hijos(nodos, clave)) {
      fuera.push({ nodo: h, nivel });
      visitar(h.clave, nivel + 1);
    }
  };
  visitar(area, 0);
  return fuera;
}

/** ¿Dejar `clave` debajo de `nuevoPadre` armaría un ciclo? (él mismo o un descendiente). */
export function creaCiclo(nodos: Nodo[], clave: string, nuevoPadre: string): boolean {
  if (clave === nuevoPadre) return true;
  return descendientes(nodos, clave).some((d) => d.clave === nuevoPadre);
}

export class NoSePuede extends Error {}

/** Mueve `clave` debajo de `nuevoPadre`, al final de sus hermanos. */
export function mover(nodos: Nodo[], clave: string, nuevoPadre: string): Nodo[] {
  if (!nodoDe(nodos, clave) || !nodoDe(nodos, nuevoPadre)) throw new NoSePuede("Ese puesto no existe");
  if (creaCiclo(nodos, clave, nuevoPadre)) throw new NoSePuede("Ese movimiento deja al puesto dependiendo de sí mismo");
  const orden = Math.max(-1, ...hijos(nodos, nuevoPadre).map((h) => h.orden)) + 1;
  return nodos.map((x) => (x.clave === clave ? { ...x, dependeDe: nuevoPadre, orden } : x));
}

/** Sube los hijos directos de `clave` a su padre, a continuación de los hermanos de `clave`. */
export function subirHijos(nodos: Nodo[], clave: string): Nodo[] {
  const n = nodoDe(nodos, clave);
  if (!n?.dependeDe) throw new NoSePuede("La raíz no tiene a dónde subir sus puestos");
  const padre = n.dependeDe;
  let orden = Math.max(-1, ...hijos(nodos, padre).map((h) => h.orden)) + 1;
  const subir = new Map(hijos(nodos, clave).map((h) => [h.clave, orden++]));
  return nodos.map((x) => (subir.has(x.clave) ? { ...x, dependeDe: padre, orden: subir.get(x.clave)! } : x));
}

/**
 * Elimina un nodo. Si tiene dependientes y `subir` es true, los sube primero a su padre; si es
 * false, NO borra nada (la regla del original que destruía ramas enteras).
 */
export function eliminar(nodos: Nodo[], clave: string, subir: boolean): Nodo[] {
  const n = nodoDe(nodos, clave);
  if (!n) throw new NoSePuede("Ese puesto no existe");
  if (!n.dependeDe) throw new NoSePuede("La Dirección no se puede eliminar");
  const tieneHijos = hijos(nodos, clave).length > 0;
  if (tieneHijos && !subir) throw new NoSePuede("Primero hay que mover o subir los puestos que dependen de este");
  const sinHijos = tieneHijos ? subirHijos(nodos, clave) : nodos;
  return sinHijos.filter((x) => x.clave !== clave);
}

/** Cambia el orden con el hermano de arriba (-1) o de abajo (+1). */
export function correr(nodos: Nodo[], clave: string, sentido: -1 | 1): Nodo[] {
  const n = nodoDe(nodos, clave);
  if (!n?.dependeDe) return nodos;
  const hermanos = hijos(nodos, n.dependeDe);
  const i = hermanos.findIndex((h) => h.clave === clave);
  const otro = hermanos[i + sentido];
  if (!otro) return nodos;
  return nodos.map((x) => (x.clave === clave ? { ...x, orden: otro.orden } : x.clave === otro.clave ? { ...x, orden: n.orden } : x));
}

/** Una clave nueva que no choca con ninguna existente: 'puesto_nuevo', 'puesto_nuevo_2'… */
export function claveNueva(nodos: Nodo[], base = "puesto_nuevo"): string {
  const usadas = new Set(nodos.map((x) => x.clave));
  if (!usadas.has(base)) return base;
  let i = 2;
  while (usadas.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

// ── Personas y ocupación ─────────────────────────────────────────────────────

export function personaDe(personas: Persona[], id: string | null | undefined): Persona | undefined {
  return id ? personas.find((p) => p.id === id) : undefined;
}

export function nombreCompleto(p: Persona): string {
  return [p.nombre, p.apellido].filter(Boolean).join(" ");
}

export function iniciales(p: Persona): string {
  const palabras = nombreCompleto(p).split(/\s+/).filter(Boolean);
  const letras = p.apellido ? [p.nombre, p.apellido.split(/\s+/)[0]] : palabras.slice(0, 2);
  return letras.map((x) => x.charAt(0).toUpperCase()).join("");
}

/**
 * Ocupantes vigentes de un nodo. Para Montajes (fuente «cuadrillas») son los capataces, leídos
 * en vivo de las cuadrillas: no se copia nada a `ocupantes`.
 */
export function ocupantesVigentes(datos: DatosOrg, clave: string): Ocupante[] {
  const n = nodoDe(datos.nodos, clave);
  if (!n) return [];
  if (n.fuenteOcupantes === "cuadrillas") {
    return datos.cuadrillas
      .filter((c) => c.capataz)
      .map((c) => ({ id: `cuadrilla-${c.id}`, nodo: clave, persona: c.capataz!, modalidad: "titular" as Modalidad, desde: "" }));
  }
  return datos.ocupantes.filter((o) => o.nodo === clave && !o.hasta);
}

export type EstadoPuesto = {
  /** No hay titular vigente (aunque haya interino). */
  vacante: boolean;
  /** Hay un interino vigente. */
  interino: boolean;
  /** Algún ocupante vigente está dado de baja en Legajos / usuarios. */
  baja: boolean;
  /** Algún ocupante es externo. */
  externo: boolean;
};

export function estadoPuesto(datos: DatosOrg, clave: string): EstadoPuesto {
  const vig = ocupantesVigentes(datos, clave);
  const personas = vig.map((o) => personaDe(datos.personas, o.persona));
  return {
    vacante: !vig.some((o) => o.modalidad === "titular"),
    interino: vig.some((o) => o.modalidad === "interino"),
    baja: personas.some((p) => p && !p.activo),
    externo: personas.some((p) => p?.origen === "externo"),
  };
}

/** Desde cuándo está vacante: el `hasta` más reciente de su historial, o null («desde siempre»). */
export function vacanteDesde(datos: DatosOrg, clave: string): string | null {
  const fechas = datos.ocupantes.filter((o) => o.nodo === clave && o.hasta).map((o) => o.hasta!);
  return fechas.length ? fechas.sort().at(-1)! : null;
}

export type PuestoDePersona = {
  nodo: Nodo;
  modalidad: Modalidad;
  desde?: string;
  /** Si le viene por una cuadrilla: «Capataz · Cuadrilla 1». */
  detalle?: string;
  cuadrilla?: Cuadrilla;
};

/** Los puestos de una persona: los asignados a mano y los que le vienen por una cuadrilla. */
export function puestosDePersona(datos: DatosOrg, persona: string): PuestoDePersona[] {
  const fuera: PuestoDePersona[] = [];
  for (const o of datos.ocupantes) {
    if (o.persona !== persona || o.hasta) continue;
    const nodo = nodoDe(datos.nodos, o.nodo);
    if (nodo && nodo.fuenteOcupantes !== "cuadrillas") fuera.push({ nodo, modalidad: o.modalidad, desde: o.desde });
  }
  const conCuadrillas = datos.nodos.filter((x) => x.fuenteOcupantes === "cuadrillas");
  for (const c of datos.cuadrillas) {
    const capataz = c.capataz === persona;
    if (!capataz && !c.plantel.includes(persona)) continue;
    for (const nodo of conCuadrillas) {
      fuera.push({ nodo, modalidad: "titular", detalle: `${capataz ? "Capataz" : "Operario"} · ${c.nombre}`, cuadrilla: c });
    }
  }
  return fuera;
}

/** Cuántos puestos tiene cada persona (titular o interina; el área cuenta como uno). */
export function cargaPorPersona(datos: DatosOrg): Map<string, number> {
  const carga = new Map<string, number>();
  for (const p of datos.personas) {
    const claves = new Set(puestosDePersona(datos, p.id).map((x) => x.nodo.clave));
    if (claves.size) carga.set(p.id, claves.size);
  }
  return carga;
}

export type Respuesta = {
  /** El puesto que responde (el pedido o el ancestro más cercano con alguien activo). */
  nodo: Nodo;
  personas: Persona[];
  /** true si el pedido estaba vacante o con el ocupante de baja y la respuesta subió. */
  subio: boolean;
  motivo?: "vacante" | "baja";
};

/**
 * A quién preguntarle por lo que hace `clave`. Si el puesto está vacante o su ocupante está
 * dado de baja, sube al ancestro más cercano que tenga a alguien activo: la respuesta sirve
 * siempre.
 */
export function quienResponde(datos: DatosOrg, clave: string): Respuesta | null {
  const n = nodoDe(datos.nodos, clave);
  if (!n) return null;
  const activos = (k: string) =>
    ocupantesVigentes(datos, k)
      .map((o) => personaDe(datos.personas, o.persona))
      .filter((p): p is Persona => !!p && p.activo);
  const propios = activos(clave);
  if (propios.length) return { nodo: n, personas: propios, subio: false };
  const motivo = ocupantesVigentes(datos, clave).length ? "baja" : "vacante";
  for (const a of ancestros(datos.nodos, clave)) {
    const ps = activos(a.clave);
    if (ps.length) return { nodo: a, personas: ps, subio: true, motivo };
  }
  return { nodo: n, personas: [], subio: false, motivo };
}

/**
 * A quién reporta una persona: el operario, a su capataz; el resto, a quien responde por el
 * puesto de arriba de cada uno de sus puestos (salvo que ese puesto también sea suyo: Natalia
 * es Facturación y responsable del área, y no se reporta a sí misma).
 */
export function jefesDe(datos: DatosOrg, persona: string): Persona[] {
  const puestos = puestosDePersona(datos, persona);
  const claves = new Set(puestos.map((p) => p.nodo.clave));
  const jefes = new Map<string, Persona>();
  for (const p of puestos) {
    if (p.cuadrilla && p.cuadrilla.capataz !== persona) {
      const cap = personaDe(datos.personas, p.cuadrilla.capataz);
      if (cap) jefes.set(cap.id, cap);
      continue;
    }
    if (p.nodo.dependeDe && !claves.has(p.nodo.dependeDe)) {
      for (const j of quienResponde(datos, p.nodo.dependeDe)?.personas ?? []) if (j.id !== persona) jefes.set(j.id, j);
    }
  }
  return [...jefes.values()];
}

// ── Para revisar ─────────────────────────────────────────────────────────────

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export type Pendientes = {
  bajas: { ocupante: Ocupante; persona: Persona; nodo: Nodo }[];
  vacantes: { nodo: Nodo; desde: string | null; interino?: Persona }[];
  sobrecarga: { persona: Persona; puestos: number }[];
  interinos: { ocupante: Ocupante; persona: Persona; nodo: Nodo; dias: number }[];
  sinPuesto: Persona[];
  incompletas: { sinMision: Nodo[]; sinKpis: Nodo[] };
  /** Lo accionable: bajas + vacantes sin interino + sobrecargas (el número de la pestaña). */
  accionables: number;
};

export const UMBRAL_SOBRECARGA = 3;

export function pendientes(datos: DatosOrg, hoy: string): Pendientes {
  const bajas: Pendientes["bajas"] = [];
  const vacantes: Pendientes["vacantes"] = [];
  const interinos: Pendientes["interinos"] = [];
  for (const nodo of datos.nodos) {
    if (nodo.tipo === "direccion") continue;
    const vig = ocupantesVigentes(datos, nodo.clave);
    for (const o of vig) {
      const p = personaDe(datos.personas, o.persona);
      if (p && !p.activo) bajas.push({ ocupante: o, persona: p, nodo });
      if (p && o.modalidad === "interino") interinos.push({ ocupante: o, persona: p, nodo, dias: diasEntre(o.desde, hoy) });
    }
    if (!vig.some((o) => o.modalidad === "titular")) {
      const interino = vig.find((o) => o.modalidad === "interino");
      vacantes.push({ nodo, desde: vacanteDesde(datos, nodo.clave), interino: personaDe(datos.personas, interino?.persona) });
    }
  }
  const carga = cargaPorPersona(datos);
  const sobrecarga = datos.personas
    .filter((p) => (carga.get(p.id) ?? 0) >= UMBRAL_SOBRECARGA)
    .map((p) => ({ persona: p, puestos: carga.get(p.id)! }));
  const sinPuesto = datos.personas.filter((p) => p.activo && !carga.has(p.id));
  const puestos = datos.nodos.filter((x) => x.tipo === "puesto");
  return {
    bajas,
    vacantes,
    sobrecarga,
    interinos,
    sinPuesto,
    incompletas: { sinMision: puestos.filter((x) => !x.mision?.trim()), sinKpis: puestos.filter((x) => x.kpis.length === 0) },
    accionables: bajas.length + vacantes.filter((v) => !v.interino).length + sobrecarga.length,
  };
}

// ── Búsqueda «¿A quién le pregunto?» ─────────────────────────────────────────

/**
 * Minúsculas y sin tildes, CARÁCTER POR CARÁCTER: el resultado tiene el mismo largo que el
 * original, así las posiciones de una coincidencia sirven para resaltar el texto original.
 */
export function normalizar(texto: string): string {
  let fuera = "";
  for (const c of texto) {
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    fuera += base.length === c.length ? base : c.toLowerCase().slice(0, c.length).padEnd(c.length, " ");
  }
  return fuera;
}

function palabras(q: string): string[] {
  return normalizar(q).split(/\s+/).filter(Boolean);
}

function coincide(texto: string | undefined, ps: string[]): boolean {
  if (!texto || !ps.length) return false;
  const t = normalizar(texto);
  return ps.every((p) => t.includes(p));
}

/** Tramos [inicio, fin) del texto original que coinciden con alguna palabra de la búsqueda. */
export function tramosCoincidencia(texto: string, q: string): [number, number][] {
  const t = normalizar(texto);
  const tramos: [number, number][] = [];
  for (const p of palabras(q)) {
    let i = t.indexOf(p);
    while (i >= 0) {
      tramos.push([i, i + p.length]);
      i = t.indexOf(p, i + p.length);
    }
  }
  tramos.sort((a, b) => a[0] - b[0]);
  const unidos: [number, number][] = [];
  for (const tr of tramos) {
    const ult = unidos.at(-1);
    if (ult && tr[0] <= ult[1]) ult[1] = Math.max(ult[1], tr[1]);
    else unidos.push([...tr]);
  }
  return unidos;
}

export type UsoDoc = { nodo: Nodo; rol: RolDoc; tarea: Tarea };
export type ResultadoDoc = { doc: Documento; usos: UsoDoc[] };
export type ResultadoTarea = { nodo: Nodo; tarea: Tarea; indice: number };
export type Resultados = {
  documentos: ResultadoDoc[];
  tareas: ResultadoTarea[];
  puestos: Nodo[];
  personas: Persona[];
  total: number;
};

const ORDEN_ROL: Record<RolDoc, number> = { emite: 0, firma: 1, recibe: 2, usa: 3 };

/** Quién emite, firma, recibe o usa un documento, según las tareas de la estructura. */
export function usosDeDoc(nodos: Nodo[], codigo: CodigoDoc): UsoDoc[] {
  const usos: UsoDoc[] = [];
  // Un puesto aparece una vez por rol aunque varias tareas suyas toquen el mismo documento.
  const vistos = new Set<string>();
  for (const nodo of nodos) {
    for (const tarea of nodo.tareas) {
      for (const d of tarea.docs ?? []) {
        const k = `${nodo.clave}:${d.rol}`;
        if (d.codigo !== codigo || vistos.has(k)) continue;
        vistos.add(k);
        usos.push({ nodo, rol: d.rol, tarea });
      }
    }
  }
  return usos.sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]);
}

/**
 * Busca en documentos, tareas, puestos y personas, sin tildes ni mayúsculas. Todas las palabras
 * tienen que aparecer. Un documento coincide por su código exacto («sol», «rs») o por su nombre.
 */
export function buscar(datos: DatosOrg, documentos: Documento[], q: string): Resultados {
  const ps = palabras(q);
  if (!ps.length) return { documentos: [], tareas: [], puestos: [], personas: [], total: 0 };
  const consulta = ps.join(" ");
  const docs = documentos
    .filter((d) => normalizar(d.codigo) === consulta || coincide(d.nombre, ps))
    .map((doc) => ({ doc, usos: usosDeDoc(datos.nodos, doc.codigo) }));
  const tareas: ResultadoTarea[] = [];
  for (const nodo of datos.nodos) {
    nodo.tareas.forEach((tarea, indice) => {
      if (coincide(tarea.texto, ps)) tareas.push({ nodo, tarea, indice });
    });
  }
  const puestos = datos.nodos.filter((x) => coincide(`${x.titulo} ${x.rol ?? ""}`, ps));
  const personas = datos.personas.filter((p) => coincide(`${nombreCompleto(p)} ${p.empresa ?? ""}`, ps));
  return { documentos: docs, tareas, puestos, personas, total: docs.length + tareas.length + puestos.length + personas.length };
}

// ── Versiones ────────────────────────────────────────────────────────────────

function mismo<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Lo que cambió de `antes` a `despues`, en frases que entiende cualquiera. */
export function diffVersiones(antes: Nodo[], despues: Nodo[]): Cambio[] {
  const cambios: Cambio[] = [];
  const titulo = (nodos: Nodo[], clave: string | null) => nodoDe(nodos, clave)?.titulo ?? "la raíz";
  for (const d of despues) {
    const a = nodoDe(antes, d.clave);
    if (!a) {
      cambios.push({ tipo: "nuevo", nodo: d.clave, detalle: `${d.titulo}, debajo de ${titulo(despues, d.dependeDe)}` });
      continue;
    }
    if (a.dependeDe !== d.dependeDe) {
      cambios.push({ tipo: "movido", nodo: d.clave, detalle: `De ${titulo(antes, a.dependeDe)} a ${titulo(despues, d.dependeDe)}` });
    }
    const partes: string[] = [];
    if (a.titulo !== d.titulo) partes.push(`antes «${a.titulo}»`);
    if ((a.rol ?? "") !== (d.rol ?? "")) partes.push("rol");
    if ((a.mision ?? "") !== (d.mision ?? "")) partes.push("misión");
    if (!mismo(a.tareas, d.tareas)) {
      const textosA = new Set(a.tareas.map((t) => t.texto));
      const nuevas = d.tareas.filter((t) => !textosA.has(t.texto));
      const textosD = new Set(d.tareas.map((t) => t.texto));
      const quitadas = a.tareas.filter((t) => !textosD.has(t.texto));
      if (nuevas.length === 1 && quitadas.length === 0 && d.tareas.length === a.tareas.length + 1) partes.push(`+1 tarea: ${nuevas[0].texto}`);
      else {
        if (nuevas.length) partes.push(`+${plural(nuevas.length, "tarea", "tareas")}`);
        if (quitadas.length) partes.push(`−${plural(quitadas.length, "tarea", "tareas")}`);
        if (!nuevas.length && !quitadas.length) partes.push("tareas reordenadas o con otros documentos");
      }
    }
    if (!mismo(a.noHace, d.noHace)) partes.push("qué NO hace");
    if (!mismo(a.kpis, d.kpis)) partes.push("KPIs");
    if ((a.notaDiseno ?? "") !== (d.notaDiseno ?? "")) partes.push("nota de diseño");
    if (partes.length) cambios.push({ tipo: "modificado", nodo: d.clave, detalle: partes.join(" · ") });
  }
  for (const a of antes) {
    if (!nodoDe(despues, a.clave)) cambios.push({ tipo: "eliminado", nodo: a.clave, detalle: a.titulo });
  }
  // Primero lo estructural (nuevo, movido, eliminado) y después las fichas tocadas.
  const ORDEN: Record<Cambio["tipo"], number> = { nuevo: 0, movido: 1, eliminado: 2, modificado: 3 };
  return cambios.sort((x, y) => ORDEN[x.tipo] - ORDEN[y.tipo]);
}

/** La marca que lleva una tarjeta en el borrador («nuevo», «movido», «modificado»). */
export function marcasDeCambio(cambios: Cambio[]): Map<string, Cambio["tipo"]> {
  const m = new Map<string, Cambio["tipo"]>();
  for (const c of cambios) if (!m.has(c.nodo) || c.tipo === "nuevo") m.set(c.nodo, c.tipo);
  return m;
}

// ── Formato ──────────────────────────────────────────────────────────────────

/** 2026-08-01 → 01/08 (o 01/08/2026 con `anio`). */
export function fechaCorta(iso: string, anio = false): string {
  const [a, m, d] = iso.split("-");
  return anio ? `${d}/${m}/${a}` : `${d}/${m}`;
}

/** 2021-03-01 → 03/2021. */
export function mesAnio(iso: string): string {
  const [a, m] = iso.split("-");
  return `${m}/${a}`;
}

/** «11 5555-0142» → «+5491155550142» para tel: y WhatsApp. */
export function telefonoInternacional(tel: string): string {
  const digitos = tel.replace(/\D/g, "");
  return `+549${digitos}`;
}
