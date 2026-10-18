/**
 * Sistemas: de una ruta de la app a lo que se dice de ella. La pantalla para los títulos de
 * los avisos y para «Mis reportes», el módulo que se guarda en sis_reportes.modulo, y para el
 * prompt de Claude Code la carpeta de docs/ y el archivo de página más probable.
 *
 * PURA (la importan la API y los tests de node:test): sin React, sin Next, sin Supabase. La
 * pantalla sale SIEMPRE de acá, nunca de un texto que mande el navegador: el título de un
 * aviso lo ve cualquier admin y no puede llevar lo que se le ocurra a quien reporta.
 */

import { moduloDeRuta as moduloDeAcceso } from "../auth/acceso.ts";

/** El pathname de una ruta: sin query, sin hash, con «/» al principio y sin «/» al final. */
export function pathnameDe(ruta: string | null | undefined): string {
  let p = (ruta ?? "").trim();
  // Una URL entera (por si algún día llega así): se queda con el path.
  const m = p.match(/^https?:\/\/[^/]+(\/[^?#]*)?/i);
  if (m) p = m[1] ?? "/";
  p = p.split(/[?#]/)[0] ?? "";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** El módulo de acceso.ts que le corresponde a la ruta (gana la ruta más larga). */
export function moduloDeRuta(ruta: string | null | undefined): { id: string; titulo: string } | null {
  const m = moduloDeAcceso(pathnameDe(ruta));
  return m ? { id: m.id, titulo: m.titulo } : null;
}

/**
 * Pantallas con nombre propio, más finas que el módulo o fuera de todo módulo. Gana el
 * prefijo más largo. Lo que no está acá se llama como su módulo.
 */
const PANTALLAS: Record<string, string> = {
  "/alertas": "Alertas",
  "/sistemas": "Mis reportes",
  "/sistemas/mis-reportes": "Mis reportes",
  "/sistemas/revision": "Sistemas · Revisión",
  "/planificacion": "Planificación",
  "/planificacion/hoja": "Hoja del día",
  "/planificacion/hoja/camiones": "Hoja del día · Camiones",
  "/planificacion/autorizaciones": "Autorizaciones de guardias",
  "/configuracion/usuarios": "Usuarios",
  "/configuracion/cuadrillas": "Cuadrillas",
  "/configuracion/agentes-ia": "Agentes IA",
  "/configuracion/empresa": "Datos de la empresa",
  "/configuracion/lista-precios": "Lista de precios",
  "/configuracion/fletes": "Fletes por zona",
  "/configuracion/imagenes": "Imágenes de referencia",
  "/p": "Pañol (QR)",
  "/fichadas/escanear": "Fichadas · Escanear",
  "/organigrama/imprimir": "Organigrama · Imprimir",
  "/deposito/panol": "Pañol",
};
const PREFIJOS_PANTALLA = Object.keys(PANTALLAS).sort((a, b) => b.length - a.length);

function coincide(prefijo: string, pathname: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** «Planificación», «Hoja del día», «Mis reportes»… Para los avisos y las tarjetas. */
export function pantallaDeRuta(ruta: string | null | undefined): string {
  const p = pathnameDe(ruta);
  if (p === "/") return "Inicio";
  const propio = PREFIJOS_PANTALLA.find((x) => coincide(x, p));
  if (propio) return PANTALLAS[propio];
  const modulo = moduloDeAcceso(p);
  if (modulo) return modulo.titulo;
  // Fuera de todo módulo: la primera parte de la ruta, legible («/cotizador» → «Cotizador»).
  const primero = decodeURIComponentSeguro(p.split("/")[1] ?? "").replace(/[-_]+/g, " ").trim();
  return primero ? primero.charAt(0).toUpperCase() + primero.slice(1) : "Otra pantalla";
}

function decodeURIComponentSeguro(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * La carpeta de docs/ de cada módulo, para que Claude Code lea el handoff antes de tocar.
 * Los que no tienen carpeta propia no van.
 */
const DOCS: Record<string, string> = {
  partes: "docs/partes/",
  planificacion: "docs/tablero-planificacion/",
  "ordenes-trabajo": "docs/tablero-planificacion/",
  "planificacion-autoriza": "docs/tablero-planificacion/",
  "hoja-dia": "docs/equipos-del-dia/",
  computos: "docs/computo-materiales/",
  "clientes-whatsapp": "docs/sofia/",
  "mapa-obras": "docs/mapa-obras/",
  habilitaciones: "docs/habilitaciones/",
  panol: "docs/panol/",
  "panol-kiosco": "docs/panol/",
  direccion: "docs/direccion/",
  "direccion-socios": "docs/direccion/",
  modelador: "docs/oficina-tecnica/",
  organigrama: "docs/organigrama/",
  "informes-obra": "docs/informe-de-obra/",
  "permisos-via-publica": "docs/permisos/",
  "asistente-comercial": "docs/asistente-comercial/",
  sistemas: "docs/sistemas/",
};

/** Rutas con docs propios aunque su módulo no los tenga (Configuración › Cuadrillas). */
const DOCS_DE_RUTA: Record<string, string> = {
  "/configuracion/cuadrillas": "docs/cuadrillas/",
  "/sistemas": "docs/sistemas/",
};

export function docsDeModulo(modulo: string | null | undefined, ruta?: string | null): string | null {
  if (ruta) {
    const p = pathnameDe(ruta);
    const propio = Object.keys(DOCS_DE_RUTA).sort((a, b) => b.length - a.length).find((x) => coincide(x, p));
    if (propio) return DOCS_DE_RUTA[propio];
  }
  return (modulo && DOCS[modulo]) || null;
}

/** Fuera del grupo (dashboard): las pantallas sin sesión o sin el layout de la app. */
const FUERA_DEL_DASHBOARD = new Set(["h", "kiosco", "permiso", "endosos", "cotizador", "prueba"]);

/** El nombre del segmento dinámico cuando no es [id]. La clave es la ruta del padre. */
const PARAMETRO: Record<string, string> = {
  "/p": "[codigo]",
  "/h": "[token]",
  "/permiso": "[token]",
  "/endosos": "[token]",
  "/informes-obra": "[saleOrderId]",
  "/oficina-tecnica/computos": "[obraId]",
  "/habilitaciones": "[otId]",
};

/** ¿Este pedazo de ruta es un id (uuid, número, código con dígitos) y no un nombre de carpeta? */
function pareceId(segmento: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segmento)
    || /^\d+$/.test(segmento)
    || (/\d/.test(segmento) && /^[A-Za-z0-9_-]{4,}$/.test(segmento) && !/^[a-z]+-?\d$/.test(segmento));
}

/**
 * El page.tsx que más probablemente dibuja esa ruta. Es una suposición (los ids pasan a
 * [id] o al nombre conocido del parámetro): el prompt la presenta como «probable».
 */
export function archivoDePagina(ruta: string | null | undefined): string {
  const p = pathnameDe(ruta);
  const partes = p.split("/").filter(Boolean).map(decodeURIComponentSeguro);
  const salida: string[] = [];
  let padre = "";
  for (const s of partes) {
    const conocido = PARAMETRO[padre];
    if (conocido && (padre === "/p" || padre === "/h" || padre === "/permiso" || padre === "/endosos" || pareceId(s))) salida.push(conocido);
    else salida.push(pareceId(s) ? "[id]" : s);
    padre = `${padre}/${s}`;
  }
  const raiz = partes.length && FUERA_DEL_DASHBOARD.has(partes[0]) ? "src/app" : "src/app/(dashboard)";
  return [raiz, ...salida, "page.tsx"].join("/");
}
