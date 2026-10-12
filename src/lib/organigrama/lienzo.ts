// Operaciones puras del «Lienzo vivo» (docs/organigrama/propuesta.md § 7): crear desde la caja
// de herramientas, mover con la rama, eliminar (subiendo o la rama entera), ubicar personas
// arrastrando, el historial de deshacer/rehacer y los contadores. Sin React: tests con node:test.
//
// Igual que en el mapa, la ESTRUCTURA va al borrador y la OCUPACIÓN es inmediata: estas
// funciones devuelven nodos u ocupantes nuevos y el lienzo decide a dónde despacharlos.

import { cargaPorPersona, claveNueva, creaCiclo, descendientes, estadoPuesto, hijos, nodoDe, ocupantesVigentes, pendientes } from "./arbol.ts";
import type { ColorArea, DatosOrg, Modalidad, Nodo, Ocupante } from "./tipos.ts";

// ── Herramientas ─────────────────────────────────────────────────────────────

export type Herramienta = "puesto" | "vacante" | "area";

export const TITULO_HERRAMIENTA: Record<Herramienta, string> = {
  puesto: "Puesto nuevo",
  vacante: "Vacante",
  area: "Área nueva",
};

const ORDEN_COLORES: ColorArea[] = ["azul", "teal", "ambar", "violeta", "verde", "rosa", "gris"];

/** El primer color de la paleta que no usa ningún área (si están todos, el que menos se repite). */
export function colorLibre(nodos: Nodo[]): ColorArea {
  const usos = new Map<ColorArea, number>(ORDEN_COLORES.map((c) => [c, 0]));
  for (const n of nodos) if (n.tipo !== "puesto" && n.color) usos.set(n.color, (usos.get(n.color) ?? 0) + 1);
  return [...ORDEN_COLORES].sort((a, b) => usos.get(a)! - usos.get(b)!)[0];
}

/** ¿Se puede soltar esta herramienta sobre `destino`? Un área nueva va debajo de la Dirección o de otra área. */
export function destinoValidoHerramienta(nodos: Nodo[], herramienta: Herramienta, destino: string): boolean {
  const d = nodoDe(nodos, destino);
  if (!d) return false;
  if (herramienta === "area") return d.tipo !== "puesto";
  return true;
}

/** El nodo que nace al soltar una herramienta (todavía sin agregar). */
export function nodoDeHerramienta(nodos: Nodo[], herramienta: Herramienta, padre: string): Nodo {
  const base = herramienta === "area" ? "area_nueva" : herramienta === "vacante" ? "vacante" : "puesto_nuevo";
  const orden = Math.max(-1, ...hijos(nodos, padre).map((h) => h.orden)) + 1;
  const comun = { clave: claveNueva(nodos, base), dependeDe: padre, orden, tareas: [], noHace: [], kpis: [] };
  if (herramienta === "area") return { ...comun, tipo: "area", titulo: "Área nueva", color: colorLibre(nodos) };
  if (herramienta === "vacante") return { ...comun, tipo: "puesto", titulo: "Vacante", rol: "A cubrir", notaInterna: "Búsqueda abierta" };
  return { ...comun, tipo: "puesto", titulo: "Puesto nuevo" };
}

/** Agrega el nodo de una herramienta debajo de `padre`. */
export function crearDesdeHerramienta(nodos: Nodo[], herramienta: Herramienta, padre: string): { nodos: Nodo[]; clave: string } {
  if (!destinoValidoHerramienta(nodos, herramienta, padre)) throw new Error("Ahí no se puede crear eso");
  const nuevo = nodoDeHerramienta(nodos, herramienta, padre);
  return { nodos: [...nodos, nuevo], clave: nuevo.clave };
}

export function renombrar(nodos: Nodo[], clave: string, titulo: string): Nodo[] {
  const t = titulo.trim();
  if (!t) return nodos;
  return nodos.map((n) => (n.clave === clave ? { ...n, titulo: t } : n));
}

// ── Mover y eliminar ─────────────────────────────────────────────────────────

/** ¿`clave` se puede soltar sobre `destino`? No sobre sí mismo, sus descendientes ni su padre actual. */
export function destinoValidoNodo(nodos: Nodo[], clave: string, destino: string): boolean {
  const n = nodoDe(nodos, clave);
  if (!n || !n.dependeDe || !nodoDe(nodos, destino)) return false;
  if (n.dependeDe === destino) return false;
  return !creaCiclo(nodos, clave, destino);
}

/** Saca un nodo y TODO lo que depende de él. La raíz no se puede borrar. */
export function eliminarRama(nodos: Nodo[], clave: string): Nodo[] {
  const n = nodoDe(nodos, clave);
  if (!n) throw new Error("Ese puesto no existe");
  if (!n.dependeDe) throw new Error("La Dirección no se puede eliminar");
  const fuera = new Set([clave, ...descendientes(nodos, clave).map((d) => d.clave)]);
  return nodos.filter((x) => !fuera.has(x.clave));
}

// ── Personas ─────────────────────────────────────────────────────────────────

/** Se puede ubicar a alguien a mano en este nodo (Montajes sale de las cuadrillas). */
export function aceptaPersonas(nodos: Nodo[], clave: string): boolean {
  const n = nodoDe(nodos, clave);
  return !!n && n.fuenteOcupantes !== "cuadrillas";
}

/**
 * ¿Se la puede ubicar en un puesto a mano? Todos menos el plantel externo de una cuadrilla
 * tercerizada (id «e:…»): ese sale en vivo de Configuración › Cuadrillas.
 */
export function seUbicaAMano(persona: string): boolean {
  return !persona.startsWith("e:");
}

/** ¿Soltar a `persona` en `destino` cambia algo? (No, si ya está ahí.) */
export function destinoValidoPersona(datos: DatosOrg, persona: string, destino: string): boolean {
  if (!seUbicaAMano(persona) || !aceptaPersonas(datos.nodos, destino)) return false;
  return !ocupantesVigentes(datos, destino).some((o) => o.persona === persona);
}

export type Ubicar = {
  nodo: string;
  persona: string;
  /** reemplazar: termina a los titulares vigentes; compartir: se suma; interino: se suma como interino. */
  modo: "reemplazar" | "compartir" | "interino";
  /** Si viene arrastrada desde otro puesto, ese ocupante termina (la persona se mueve). */
  desdeOcupante?: string;
  id: string;
  hoy: string;
};

export function ubicarPersona(ocupantes: Ocupante[], u: Ubicar): Ocupante[] {
  const modalidad: Modalidad = u.modo === "interino" ? "interino" : "titular";
  const terminar = (o: Ocupante) =>
    !o.hasta &&
    // Reemplazar termina a todos los vigentes del puesto (titulares e interino).
    (o.id === u.desdeOcupante || (u.modo === "reemplazar" && o.nodo === u.nodo));
  return [
    ...ocupantes.map((o) => (terminar(o) ? { ...o, hasta: u.hoy } : o)),
    { id: u.id, nodo: u.nodo, persona: u.persona, modalidad, desde: u.hoy },
  ];
}

/** Devuelve a la persona al banco: el ocupante termina hoy. */
export function quitarOcupante(ocupantes: Ocupante[], id: string, hoy: string): Ocupante[] {
  return ocupantes.map((o) => (o.id === id && !o.hasta ? { ...o, hasta: hoy } : o));
}

/** Si al soltar hay que preguntar Reemplazar / Compartir: el puesto ya tiene titular. */
export function hayQuePreguntar(datos: DatosOrg, nodo: string, desdeOcupante?: string): boolean {
  return ocupantesVigentes(datos, nodo).some((o) => o.modalidad === "titular" && o.id !== desdeOcupante);
}

// ── Contadores ───────────────────────────────────────────────────────────────

export type Resumen = {
  puestos: number;
  areas: number;
  /** Personas activas con al menos un puesto. */
  conPuesto: number;
  activos: number;
  sinPuesto: number;
  /** Puestos sin titular (incluye los cubiertos por interino). */
  vacantes: number;
  conInterino: number;
};

export function resumen(datos: DatosOrg, hoy: string): Resumen {
  const p = pendientes(datos, hoy);
  const carga = cargaPorPersona(datos);
  const activos = datos.personas.filter((x) => x.activo);
  return {
    puestos: datos.nodos.filter((n) => n.tipo === "puesto").length,
    areas: datos.nodos.filter((n) => n.tipo === "area").length,
    conPuesto: activos.filter((x) => carga.has(x.id)).length,
    activos: activos.length,
    sinPuesto: p.sinPuesto.length,
    vacantes: p.vacantes.length,
    conInterino: p.vacantes.filter((v) => v.interino).length,
  };
}

/**
 * Lo que cuenta una rama (un área en el recorrido o lejos, en el zoom semántico): puestos,
 * personas distintas (con el plantel de las cuadrillas) y puestos sin titular.
 */
export function estadisticaRama(datos: DatosOrg, clave: string): { puestos: number; personas: number; vacantes: number } {
  const rama = [nodoDe(datos.nodos, clave), ...descendientes(datos.nodos, clave)].filter((n): n is Nodo => !!n);
  const personas = new Set<string>();
  for (const n of rama) {
    for (const o of ocupantesVigentes(datos, n.clave)) personas.add(o.persona);
    if (n.fuenteOcupantes === "cuadrillas") for (const c of datos.cuadrillas) c.plantel.forEach((p) => personas.add(p));
  }
  const puestos = rama.filter((n) => n.tipo === "puesto");
  return { puestos: puestos.length, personas: personas.size, vacantes: puestos.filter((n) => estadoPuesto(datos, n.clave).vacante).length };
}

// ── Historial (deshacer / rehacer) ───────────────────────────────────────────

export type Historial<T> = { pasado: T[]; futuro: T[] };

export const LIMITE_HISTORIAL = 60;

export function historialVacio<T>(): Historial<T> {
  return { pasado: [], futuro: [] };
}

/** Guarda la foto de ANTES de un cambio. Un cambio nuevo borra lo rehacible. */
export function registrar<T>(h: Historial<T>, antes: T, limite = LIMITE_HISTORIAL): Historial<T> {
  return { pasado: [...h.pasado, antes].slice(-limite), futuro: [] };
}

export function deshacer<T>(h: Historial<T>, actual: T): { historial: Historial<T>; foto: T } | null {
  const foto = h.pasado.at(-1);
  if (foto === undefined) return null;
  return { historial: { pasado: h.pasado.slice(0, -1), futuro: [actual, ...h.futuro] }, foto };
}

export function rehacer<T>(h: Historial<T>, actual: T): { historial: Historial<T>; foto: T } | null {
  const [foto, ...resto] = h.futuro;
  if (foto === undefined) return null;
  return { historial: { pasado: [...h.pasado, actual], futuro: resto }, foto };
}
