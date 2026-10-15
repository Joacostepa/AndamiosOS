// Contrato de los nodos de desglose (drill-down §7.3: cifra → desglose → lista → Odoo).
//
// UN NODO es un `tipo` registrado con un resolvedor que, con los parámetros del NodoRef,
// arma el panel: título, cifra, secciones de filas (cada una puede abrir otro nodo o un
// registro de Odoo) y el control de cierre "Total = la cifra ✓".
//
//  · Lo pide el cliente con GET /api/direccion/desglose?nodo=<tipo>&<param>=<valor>&pagina=N.
//  · La API chequea permisos (reservado → sólo socios), cachea con el tag de la pantalla
//    del nodo (10 min) y completa el link a Odoo de cada fila (urlOdoo).
//  · Listas largas: paginar de a 50 con `paginar()`; el cierre se calcula sobre TODO, no
//    sobre la página.
//  · Mismas reglas que los calculadores: sólo odoo-lectura.ts, sin datos inventados, JSON.
//  · Para no recalcular, un nodo de nivel 1 puede salir del resultado de su pantalla:
//    `await ctx.pantalla("cobranzas")` (cacheado) y armar las filas desde `detalle`.

import type { CtxCalculo } from "../calculo/contrato.ts";
import type { NodoDesglose, NodoRef, PantallaId } from "../tipos.ts";

export const POR_PAGINA = 50;

export type CtxNodo = CtxCalculo & { pagina: number };

export type DefNodo = {
  tipo: string;
  /** La pantalla dueña: su tag de caché y su "Actualizar ahora" lo invalidan. */
  pantalla: PantallaId;
  /** Sólo socios (retiros, dividendos, política, circuitos de facturación). */
  reservado?: boolean;
  resolver: (ref: NodoRef, ctx: CtxNodo) => Promise<NodoDesglose>;
};

export function definirNodo(d: DefNodo): DefNodo {
  return d;
}

/** Corta una lista en páginas de POR_PAGINA. `pagina` empieza en 1. */
export function paginar<T>(filas: readonly T[], pagina: number): { filas: T[]; pagina: NonNullable<NodoDesglose["pagina"]> } {
  const total = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), total);
  return { filas: filas.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA), pagina: { actual, total, filas: filas.length } };
}

/** NodoRef → query string (?nodo=…&v=…). Claves reservadas: nodo, pagina. */
export function refAQuery(ref: NodoRef, pagina = 1): string {
  const q = new URLSearchParams();
  q.set("nodo", ref.tipo);
  for (const [k, v] of Object.entries(ref)) if (k !== "tipo" && k !== "nodo" && k !== "pagina" && v != null) q.set(k, v);
  if (pagina > 1) q.set("pagina", String(pagina));
  return q.toString();
}

const FECHA_O_MES = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const CLAVE = /^[A-Za-z0-9_-]{1,40}$/;
/** Texto libre corto (nombre de cliente, de orden, de tipo): sin caracteres de control. */
const TEXTO = /^[^\u0000-\u001f\u007f<>]{1,120}$/;

/**
 * Los parámetros que aceptan los nodos y su formato. Cada combinación nueva es una entrada
 * de caché y, en algunos nodos, una lectura a Odoo: una clave desconocida o un valor con
 * otro formato se descarta acá (no llega al nodo ni a la clave de caché). Si un nodo nuevo
 * usa otra clave, se agrega acá (lo controla desglose.test.ts).
 */
export const PARAMS_NODO: Readonly<Record<string, RegExp>> = {
  v: TEXTO, // el "qué": id de cuenta o proveedor, nombre de cliente, orden (S00128)…
  c: TEXTO, // cliente (En la calle)
  t: TEXTO, // tipo de contrato
  g: CLAVE, f: CLAVE, s: CLAVE, e: CLAVE, fuente: CLAVE, rubro: CLAVE,
  desde: FECHA_O_MES, hasta: FECHA_O_MES,
  mes: /^\d{4}-(0[1-9]|1[0-2])$/,
  // El período de Ventas (los nodos de Ventas lo reciben como parámetros del cálculo).
  p: /^(\d{4}(-(0[1-9]|1[0-2])|-Q[1-4]|-\d{2}-\d{2})?)$/,
  vs: /^(anterior|anioAnterior|promedio6)$/,
};

/** query string → NodoRef + página. null si falta el nodo. Sólo pasan los parámetros conocidos y bien formados. */
export function queryARef(q: URLSearchParams): { ref: NodoRef; pagina: number } | null {
  const tipo = q.get("nodo");
  if (!tipo || !/^[A-Za-z0-9_-]{1,60}$/.test(tipo)) return null;
  const ref: NodoRef = { tipo };
  for (const [k, v] of q.entries()) {
    const formato = Object.prototype.hasOwnProperty.call(PARAMS_NODO, k) ? PARAMS_NODO[k] : null;
    if (formato && formato.test(v)) ref[k] = v;
  }
  const pagina = Math.min(1000, Math.max(1, Math.floor(Number(q.get("pagina"))) || 1));
  return { ref, pagina };
}
