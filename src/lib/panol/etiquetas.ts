// Etiquetas QR del Pañol: qué se imprime, con qué nombre, y cómo entra en una hoja A4.
// Lógica pura (sin red ni React): la usan la vista previa, el PDF y etiquetas.test.ts, así
// lo que se ve en pantalla es exactamente lo que sale de la impresora.
//
// LAS MEDIDAS VAN EN MILÍMETROS hasta el último momento. Una etiqueta de 25 mm tiene que
// medir 25 mm con la regla en la mano; el PDF convierte a puntos (mmAPt) al dibujar.

import QRCode from "qrcode";
import type { TipoUbicacion } from "./tipos.ts";

// ─── Qué se imprime ─────────────────────────────────────────────────────────

export type TipoEtiqueta = "estantes" | "cajones" | "herramientas" | "credenciales";

/** El `tipo` de pan_codigos de cada cosa que se etiqueta. */
export type TipoCodigo = "ubicacion" | "unidad" | "persona" | "externa";

export type Tamano = 25 | 50;
export type Correccion = "Q" | "H";

export const TIPOS_ETIQUETA: Record<TipoEtiqueta, { titulo: string; ayuda: string; tamano: Tamano; correccion: Correccion }> = {
  estantes: { titulo: "Estanterías y estantes", ayuda: "Un QR por estante: al escanearlo muestra lo que hay", tamano: 50, correccion: "Q" },
  cajones: { titulo: "Cajones", ayuda: "Un QR por cajón", tamano: 25, correccion: "Q" },
  // H: la herramienta se golpea y se ensucia; con H el QR se sigue leyendo con un 30 % roto.
  herramientas: { titulo: "Herramientas con número", ayuda: "Un QR por unidad", tamano: 25, correccion: "H" },
  credenciales: { titulo: "Credenciales", ayuda: "Para el llavero o el carnet", tamano: 25, correccion: "Q" },
};

export function esTipoEtiqueta(x: unknown): x is TipoEtiqueta {
  return typeof x === "string" && x in TIPOS_ETIQUETA;
}

/** Una cosa que se puede etiquetar. `codigo` null = todavía no tiene: se crea al descargar. */
export type Candidato = {
  /** `${tipoCodigo}:${entidadId}`: la clave de la selección y del parámetro ?sel= */
  clave: string;
  tipoCodigo: TipoCodigo;
  entidadId: string;
  nombre: string;
  codigo: string | null;
  /** Ya se imprimió su código activo. */
  impreso: boolean;
};

export const claveDe = (tipo: TipoCodigo, id: string) => `${tipo}:${id}`;

/** "Sólo las nuevas": las que no tienen código o cuyo código nunca se imprimió. */
export const esNueva = (c: Candidato) => !c.codigo || !c.impreso;

// Lo mínimo que hace falta de cada fila; así este archivo no depende de los hooks.
type UbicacionMin = { id: string; padre_id: string | null; nombre: string; tipo: TipoUbicacion; orden: number; activo: boolean };
type ArticuloMin = { id: string; nombre: string; ubicacion_id: string | null; activo: boolean };
type UnidadMin = { id: string; articulo_id: string; numero: string; estado: string; activo: boolean };
type PersonaMin = { tipo: "persona" | "externa"; id: string; nombre: string; apellido: string; activo: boolean };
export type CodigoMin = { codigo: string; tipo: string; entidad_id: string; activo: boolean; impreso_at: string | null };

export type Fuentes = {
  ubicaciones: UbicacionMin[];
  articulos: ArticuloMin[];
  unidades: UnidadMin[];
  personas: PersonaMin[];
  codigos: CodigoMin[];
};

const ESTADOS_SIN_ETIQUETA = new Set(["baja", "perdida"]);

/**
 * La lista de lo que se puede imprimir de un tipo, con su nombre corto y su código activo.
 * El orden es el de la estantería (por `orden` y nombre), que es como se pegan.
 */
export function candidatos(tipo: TipoEtiqueta, f: Fuentes): Candidato[] {
  const activo = new Map<string, CodigoMin>();
  for (const c of f.codigos) if (c.activo) activo.set(claveDe(c.tipo as TipoCodigo, c.entidad_id), c);
  const armar = (tipoCodigo: TipoCodigo, entidadId: string, nombre: string): Candidato => {
    const clave = claveDe(tipoCodigo, entidadId);
    const c = activo.get(clave);
    return { clave, tipoCodigo, entidadId, nombre, codigo: c?.codigo ?? null, impreso: !!c?.impreso_at };
  };
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es", { numeric: true });

  if (tipo === "estantes" || tipo === "cajones") {
    const porId = new Map(f.ubicaciones.map((u) => [u.id, u]));
    const quiero: TipoUbicacion[] = tipo === "estantes" ? ["estanteria", "estante"] : ["cajon"];
    return f.ubicaciones
      .filter((u) => u.activo && quiero.includes(u.tipo))
      .sort((a, b) => rutaOrden(a, porId).localeCompare(rutaOrden(b, porId), "es", { numeric: true }))
      .map((u) => armar("ubicacion", u.id, nombreUbicacion(u, porId, f.articulos)));
  }
  if (tipo === "herramientas") {
    const art = new Map(f.articulos.map((a) => [a.id, a]));
    return f.unidades
      .filter((u) => u.activo && !ESTADOS_SIN_ETIQUETA.has(u.estado))
      .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }))
      .map((u) => armar("unidad", u.id, `#${u.numero} · ${art.get(u.articulo_id)?.nombre ?? ""}`.replace(/ · $/, "")));
  }
  return f.personas
    .filter((p) => p.activo)
    .map((p) => ({ ...p, nombre: `${p.nombre} ${p.apellido}`.trim() }))
    .sort(porNombre)
    .map((p) => armar(p.tipo, p.id, p.nombre));
}

/** Clave para ordenar por el árbol: el orden de cada antepasado, con ceros. */
function rutaOrden(u: UbicacionMin, porId: Map<string, UbicacionMin>): string {
  const partes: string[] = [];
  let x: UbicacionMin | undefined = u;
  for (let i = 0; x && i < 10; i++) {
    partes.unshift(`${String(x.orden).padStart(6, "0")}-${x.nombre}`);
    x = x.padre_id ? porId.get(x.padre_id) : undefined;
  }
  return partes.join("/");
}

/**
 * El nombre que va debajo del QR. Un estante suelto ("Estante 2") no dice de cuál
 * estantería es: se le antepone. Un cajón de un solo insumo lleva el insumo, que es lo que
 * busca quien lo mira.
 */
export function nombreUbicacion(u: UbicacionMin, porId: Map<string, UbicacionMin>, articulos: ArticuloMin[]): string {
  const padre = u.padre_id ? porId.get(u.padre_id) : undefined;
  if (u.tipo === "estante" && padre && padre.tipo === "estanteria") return `${padre.nombre} · ${u.nombre}`;
  if (u.tipo === "cajon") {
    const adentro = articulos.filter((a) => a.activo && a.ubicacion_id === u.id);
    if (adentro.length === 1) return `${u.nombre} · ${adentro[0].nombre}`;
  }
  return u.nombre;
}

// ─── El QR ──────────────────────────────────────────────────────────────────

/** Lo que codifica el QR: la dirección corta que abre la ficha con la cámara del celular. */
export function urlCodigo(origen: string, codigo: string): string {
  return `${origen.replace(/\/+$/, "")}/p/${codigo}`;
}

/** Módulos de silencio alrededor del QR. El estándar pide 4; con la etiqueta en blanco alrededor, 2 alcanzan. */
export const MARGEN_QR = 2;

export type MatrizQr = { size: number; data: ArrayLike<number> };

export function matrizQr(texto: string, correccion: Correccion): MatrizQr {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: correccion });
  return { size: modules.size, data: modules.data };
}

/**
 * La matriz como UN path SVG, una tira horizontal por cada racha de módulos negros. Sirve
 * igual para el <svg> de la vista previa y para el <Path> del PDF: vectorial, sin imagen,
 * así no se pixela al imprimir. Coordenadas en módulos, con el margen de silencio incluido
 * (viewBox `0 0 lado lado` con lado = size + 2·MARGEN_QR).
 */
export function pathQr(m: MatrizQr, margen = MARGEN_QR): string {
  let d = "";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.data[y * m.size + x]) { x++; continue; }
      let n = 1;
      while (x + n < m.size && m.data[y * m.size + x + n]) n++;
      d += `M${x + margen} ${y + margen}h${n}v1h-${n}z`;
      x += n;
    }
  }
  return d;
}

export const ladoQr = (m: MatrizQr, margen = MARGEN_QR) => m.size + 2 * margen;

// ─── La hoja ────────────────────────────────────────────────────────────────

export const A4 = { ancho: 210, alto: 297 } as const;

export type OpcionesHoja = {
  tamano: Tamano;
  /** Margen de la hoja, en mm (lo que la impresora no imprime, más aire). */
  margen: number;
  /** Separación entre etiquetas, en mm: lo que se pierde al cortar. */
  separacion: number;
};

export type Grilla = {
  columnas: number;
  filas: number;
  porHoja: number;
  /** La celda de una etiqueta: QR + código + nombre + relleno. */
  celdaAncho: number;
  celdaAlto: number;
  /** Alto del texto debajo del QR. */
  texto: number;
  relleno: number;
  /** Para centrar la grilla en la hoja. */
  izquierda: number;
  arriba: number;
};

/** Alto del bloque de texto (código + nombre) según el tamaño del QR. */
const TEXTO_MM: Record<Tamano, number> = { 25: 8, 50: 11 };
const RELLENO_MM: Record<Tamano, number> = { 25: 2, 50: 2 };

export function grilla(o: OpcionesHoja): Grilla {
  const margen = Math.max(0, o.margen);
  const sep = Math.max(0, o.separacion);
  const relleno = RELLENO_MM[o.tamano];
  const texto = TEXTO_MM[o.tamano];
  const celdaAncho = o.tamano + 2 * relleno;
  const celdaAlto = o.tamano + texto + 2 * relleno;
  const util = { ancho: A4.ancho - 2 * margen, alto: A4.alto - 2 * margen };
  const columnas = Math.max(1, Math.floor((util.ancho + sep) / (celdaAncho + sep)));
  const filas = Math.max(1, Math.floor((util.alto + sep) / (celdaAlto + sep)));
  const ocupaAncho = columnas * celdaAncho + (columnas - 1) * sep;
  const ocupaAlto = filas * celdaAlto + (filas - 1) * sep;
  return {
    columnas, filas, porHoja: columnas * filas, celdaAncho, celdaAlto, texto, relleno,
    izquierda: Math.max(0, (A4.ancho - ocupaAncho) / 2),
    arriba: Math.max(0, (A4.alto - ocupaAlto) / 2),
  };
}

/** Dónde va la celda i de una hoja (mm desde arriba a la izquierda). */
export function posicion(g: Grilla, i: number, separacion: number): { x: number; y: number } {
  const col = i % g.columnas;
  const fila = Math.floor(i / g.columnas);
  return { x: g.izquierda + col * (g.celdaAncho + separacion), y: g.arriba + fila * (g.celdaAlto + separacion) };
}

/**
 * Reparte las etiquetas en hojas. `saltear` deja libres las primeras posiciones de la
 * primera hoja: así se aprovecha una plancha de vinilo que ya se usó a medias.
 * Las posiciones salteadas son `null`.
 */
export function paginar<T>(items: T[], porHoja: number, saltear = 0): (T | null)[][] {
  if (porHoja < 1) throw new Error("porHoja tiene que ser al menos 1");
  const libres = Math.max(0, Math.min(Math.floor(saltear), porHoja - 1));
  const todo: (T | null)[] = [...Array<null>(libres).fill(null), ...items];
  if (items.length === 0) return [];
  const hojas: (T | null)[][] = [];
  for (let i = 0; i < todo.length; i += porHoja) hojas.push(todo.slice(i, i + porHoja));
  return hojas;
}

export function resumenHojas(cantidad: number, porHoja: number, saltear = 0): string {
  const hojas = cantidad === 0 ? 0 : paginar(Array(cantidad).fill(0), porHoja, saltear).length;
  const etiquetas = cantidad === 1 ? "1 etiqueta" : `${cantidad} etiquetas`;
  return `${etiquetas} en ${hojas} ${hojas === 1 ? "hoja A4" : "hojas A4"}`;
}

/** Cuántos caracteres del nombre entran debajo del QR sin pisar la etiqueta de al lado. */
export const LARGO_NOMBRE: Record<Tamano, number> = { 25: 24, 50: 32 };

export function recortar(texto: string, max: number): string {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export const mmAPt = (mm: number) => (mm * 72) / 25.4;
