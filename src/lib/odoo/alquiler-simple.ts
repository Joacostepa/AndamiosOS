// Odoo para el alquiler simple que cotiza Tomás (docs/sofia/alquiler-simple-propuesta.md §5 y §10).
//
// Qué hay acá:
//   · el mapa CodigoPieza → producto de Odoo (los mismos que usa Tamara en las órdenes «Simple»);
//   · los fletes por barrio (métodos de envío 354 a 450, la tanda del 31/3/2026) y cómo se elige
//     el del barrio de la dirección. Sólo CABA: no se entrega ni se retira en provincia (JS,
//     12/11): los métodos del conurbano de la lista no se usan;
//   · de la dirección al barrio (CABA) o la localidad (GBA), con USIG y Places de respaldo;
//   · las líneas de la orden tal como las arman hoy en Odoo (pura, con tests);
//   · crear la orden EN BORRADOR y adjuntarle los documentos del cliente. Si retira en el
//     depósito, sin flete ni método de envío y con la dirección como las marca hoy Tamara.
//
// Lo que vio Claude en Odoo el 12/11 está en docs/sofia/alquiler-simple-odoo.md.
//
// SÓLO server-side (usa la API key de Odoo). Lo puro no toca red: los tests importan este archivo,
// por eso los imports llevan la extensión .ts y no hay alias «@/» (node --experimental-strip-types
// no los resuelve). Lo que necesita Places se importa al vuelo, sólo cuando hace falta.
//
// PRINCIPIO QUE NO SE ROMPE: nada de esto se le devuelve a Tomás. Los precios del flete, las
// líneas y el neto son para la tarjeta de aprobación y para Odoo; el modelo no ve plata (§1 y
// src/lib/clientes/filtro-salida.ts).

import { createHash } from "node:crypto";
import { executeKw, type OpcionesRpc } from "./client.ts";
import { limpiarDireccion, traeLocalidad, type Punto } from "./geocodificar-reglas.ts";

const ESCRITURA: OpcionesRpc = { timeoutMs: 45_000 };
const LECTURA: OpcionesRpc = { timeoutMs: 20_000 };

type M2O = [number, string] | false;

// ── Productos ───────────────────────────────────────────────────────────────────────────

/** Los códigos que produce el motor (src/lib/clientes/alquiler-simple.ts). Compartidos: no cambiarlos. */
export type CodigoPieza =
  | "modulo_130x250"
  | "modulo_090x250"
  | "modulo_130x150"
  | "modulo_090x150"
  | "baranda_130"
  | "baranda_090"
  | "tablon_250"
  | "tablon_150"
  | "ruedas_juego"
  | "tornillones_juego";

export const CODIGOS_PIEZA: readonly CodigoPieza[] = [
  "modulo_130x250", "modulo_090x250", "modulo_130x150", "modulo_090x150",
  "baranda_130", "baranda_090", "tablon_250", "tablon_150", "ruedas_juego", "tornillones_juego",
];

/**
 * Pieza → product.product de Odoo, POR ID FIJO.
 *
 * POR QUÉ ID FIJO Y NO BUSCAR: ninguno de estos productos tiene `default_code` en Odoo (verificado
 * el 12/11), así que la única otra forma sería buscar por nombre, y los nombres tienen erratas
 * («MODULO BARANDA ... STD 1,30 X 2,50 X 1,80» mide 1,00 de alto) que alguien puede corregir
 * cualquier día y romper la búsqueda en silencio. Un id no cambia nunca. Es la misma regla del
 * asistente comercial: los ids salen de una tabla verificada, nunca de lo que escriba la IA
 * (supabase/migrations/20260926000001_parametros_cotizacion.sql, cotizacion_productos_odoo).
 * `verificarProductosAlquilerSimple()` chequea contra Odoo que sigan activos, alquilables y con
 * el nombre esperado: un producto archivado se ve antes de cotizar, no al aprobar.
 *
 * Son los que usa Tamara en las 117 órdenes «Simple» desde mayo de 2026 (ver el doc).
 */
export const PRODUCTOS_ALQUILER_SIMPLE: Record<CodigoPieza, number> = {
  modulo_130x250: 138, // MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80
  modulo_090x250: 139, // MODULO DE ANDAMIO PASILLO 0,90 X 2,50 X 1,80
  modulo_130x150: 142, // MODULO DE ANDAMIO JUNIOR 1,30 X 1,50 X 1,80
  modulo_090x150: 148, // MODULO DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,80
  baranda_130: 149, // MODULO BARANDA DE ANDAMIO STD 1,30 X 2,50 X 1,80 (el nombre dice 1,80; es de 1 m)
  baranda_090: 150, // MODULO BARANDA DE ANDAMIO PASILLO 0,90 X 2,50 X 1,00
  tablon_250: 119, // TABLON METALICO 2.50 m
  tablon_150: 117, // TABLON METALICO 1.50 m
  ruedas_juego: 141, // JUEGO DE RUEDAS DE ANDAMIO STANDARD (4 U)
  tornillones_juego: 176, // TORNILLON DE 600 mm. POR UNIDAD (BASE FIJA): va por unidad, 4 por juego
};

/**
 * La baranda del angosto junior (0,90 × 1,50) sí existe como módulo en Odoo. La del estándar
 * junior (1,30 × 1,50) NO: Tamara la arma con 2 bastidores baranda de 1,30 y 2 riendas JR
 * (S02997), y así va (ver `lineasOrdenAlquilerSimple` y el doc). El módulo de 2,50 trae riendas
 * de 2,50, que no entran en una torre de 1,50: si el depósito arma la orden sin leer un aviso,
 * carga la baranda equivocada.
 */
export const PRODUCTO_BARANDA_090_JUNIOR = 171; // MODULO BARANDA DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,00
export const PRODUCTO_BASTIDOR_BARANDA_130 = 8; // BASTIDOR BARANDA - 1,30m. x 1.00 h
export const PRODUCTO_RIENDA_JR_HORIZONTAL = 105; // RIENDA ANDAMIO JR 1.50 m - HORIZONTAL

/** Las líneas que no son piezas. */
export const PRODUCTO_FLETE = 2; // [Delivery_007] Envío estándar (flete): el de todos los métodos de envío
export const PRODUCTO_MINIMO_OPERATIVO = 170; // MÍNIMO OPERATIVO Andamios Bs. As.
export const PRODUCTO_RENOVACION = 193; // RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)
/**
 * El recargo por la franja de una hora (§6) NO tiene producto propio en Odoo. Va con el servicio
 * extra que ya existe, con la descripción del recargo. Si JS quiere uno propio, se crea a mano en
 * Odoo y se cambia este id (nunca se crean productos desde acá).
 */
export const PRODUCTO_RECARGO_FRANJA = 178; // ADICIONAL VARIOS - SERVICIOS EXTRA - MANO DE OBRA

/** Los nombres tal cual están en Odoo (12/11): van en la descripción de cada línea, como en la UI. */
export const NOMBRES_PRODUCTOS: Record<number, string> = {
  138: "MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80",
  139: "MODULO DE ANDAMIO PASILLO 0,90 X 2,50 X 1,80",
  142: "MODULO DE ANDAMIO JUNIOR 1,30 X 1,50 X 1,80",
  148: "MODULO DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,80",
  149: "MODULO BARANDA DE ANDAMIO STD 1,30 X 2,50 X 1,80",
  150: "MODULO BARANDA DE ANDAMIO PASILLO 0,90 X 2,50 X 1,00",
  171: "MODULO BARANDA DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,00",
  8: "BASTIDOR BARANDA - 1,30m. x 1.00 h",
  105: "RIENDA ANDAMIO JR 1.50 m - HORIZONTAL",
  119: "TABLON METALICO 2.50 m",
  117: "TABLON METALICO 1.50 m",
  141: "JUEGO DE RUEDAS DE ANDAMIO STANDARD (4 U)",
  176: "TORNILLON DE 600 mm. POR UNIDAD (BASE FIJA)",
  170: "MÍNIMO OPERATIVO Andamios Bs. As.",
  193: "RENOVACIÓN ALQUILER SIMPLE (SIN MONTAJE)",
  178: "ADICIONAL VARIOS - SERVICIOS EXTRA - MANO DE OBRA",
};

/** Piezas que en Odoo van por unidad aunque el motor las cuente por juego. */
const UNIDADES_POR_JUEGO: Partial<Record<CodigoPieza, number>> = { tornillones_juego: 4 };

/** Lo que va igual en toda orden simple (visto en las órdenes reales; ver el doc). */
export const ODOO_ALQUILER_SIMPLE = {
  contrato: "Simple", // x_studio_tipo_de_contrato
  etiquetaSimple: 4, // crm.tag «SIMPLE»
  plantilla: 9, // sale.order.template «Plantilla Simples»: de acá sale el texto de las condiciones
  validezDias: 15, // number_of_days de la plantilla
  impuestoIva: 88, // el mismo de Parámetros (odoo_impuesto_iva_id)
  fletesDesde: 354, // la tanda del 31/3/2026 (JS, 12/11). 159-255 son los viejos (un 20 % más baratos)
  fletesHasta: 450,
} as const;

/**
 * Chequea contra Odoo que los productos sigan como se vieron el 12/11: activos, alquilables y con
 * el mismo nombre. Devuelve los problemas en castellano (vacío = todo bien). Sólo lectura.
 */
export async function verificarProductosAlquilerSimple(): Promise<string[]> {
  const ids = Object.keys(NOMBRES_PRODUCTOS).map(Number);
  const filas = await executeKw<{ id: number; name: string; active: boolean; rent_ok: boolean }[]>(
    "product.product", "read", [ids], { fields: ["name", "active", "rent_ok"], context: { active_test: false } }, LECTURA,
  );
  const problemas: string[] = [];
  for (const id of ids) {
    const p = filas.find((f) => f.id === id);
    if (!p) problemas.push(`El producto ${id} (${NOMBRES_PRODUCTOS[id]}) ya no existe en Odoo.`);
    else if (!p.active) problemas.push(`El producto ${id} (${p.name}) está archivado en Odoo.`);
    else if (!p.rent_ok) problemas.push(`El producto ${id} (${p.name}) no se puede alquilar en Odoo.`);
    else if (p.name !== NOMBRES_PRODUCTOS[id]) problemas.push(`El producto ${id} se llama «${p.name}» y se esperaba «${NOMBRES_PRODUCTOS[id]}».`);
  }
  return problemas;
}

// ── Fletes ──────────────────────────────────────────────────────────────────────────────

/** Un método de envío de la lista por barrio. El precio es neto, cubre la entrega y el retiro (§5). */
export type Flete = { carrierId: number; nombre: string; precio: number };

export type CarrierOdoo = { id: number; name: string; active?: boolean; product_id?: M2O };
export type ReglaPrecioOdoo = {
  carrier_id: M2O;
  variable: string;
  operator: string;
  max_value: number;
  list_base_price: number;
  list_price: number;
};

/**
 * Los métodos de envío de la tanda del 31/3/2026 que son barrios de CABA (51 de los 97, leídos el
 * 12/11), normalizados con `normalizarLugar`. Los otros 46 son localidades del conurbano y NO se
 * usan: no se entrega ni se retira fuera de CABA (JS, 12/11). Es una lista de los que SÍ, y no de
 * los que no: un método nuevo que nadie revisó va a un vendedor en vez de cotizarse solo.
 * «RETIRO» (418) es el barrio de Retiro, no el retiro en el depósito.
 */
export const BARRIOS_CABA_EN_LISTA: ReadonlySet<string> = new Set([
  "AGRONOMIA", "ALMAGRO", "BALVANERA", "BARRACAS", "BARRIO NORTE", "BELGRANO C", "BELGRANO R", "BOEDO", "CABALLITO",
  "CHACARITA", "COGHLAN", "COLEGIALES", "CONTITUCION", "FLORES", "FLORESTA", "LA BOCA", "LAS CANITAS", "LINIERS",
  "MATADEROS", "MONSERRAT", "MONTE CASTRO", "NUEVA POMPEYA", "NUNEZ", "PALERMO", "PARQUE AVELLANEDA", "PARQUE CHACABUCO",
  "PARQUE CHAS", "PARQUE PATRICIOS", "PATERNAL", "PUERTO MADERO", "RECOLETA", "RETIRO", "SAAVEDRA", "SAN CRISTOBAL",
  "SAN NICOLAS", "SAN TELMO", "VELEZ SARSFIELD", "VERSALLES", "VILLA CRESPO", "VILLA DEL PARQUE", "VILLA DEVOTO",
  "VILLA LUGANO", "VILLA LURO", "VILLA MITRE", "VILLA ORTUZAR", "VILLA PUEYRREDON", "VILLA REAL", "VILLA RIACHUELO",
  "VILLA SANTA RITA", "VILLA SOLDATI", "VILLA URQUIZA",
]);

/**
 * De los métodos de envío y sus reglas de precio, la lista de fletes. PURA.
 *
 * En Odoo los 97 métodos son «base_on_rule» con `fixed_price` en 0: el precio es el
 * `list_base_price` de su única regla («cantidad >= 0», sin precio variable). Si un método no
 * tiene exactamente esa regla, o no usa el producto de flete, se descarta: mejor que vaya a un
 * vendedor que cobrar un flete que no sabemos leer. Los que no son de CABA, también.
 */
export function armarFletes(carriers: CarrierOdoo[], reglas: ReglaPrecioOdoo[]): { fletes: Flete[]; descartados: string[] } {
  const fletes: Flete[] = [];
  const descartados: string[] = [];
  for (const c of carriers) {
    if (c.active === false) { descartados.push(`${c.name} (archivado)`); continue; }
    if (Array.isArray(c.product_id) && c.product_id[0] !== PRODUCTO_FLETE) { descartados.push(`${c.name} (otro producto)`); continue; }
    if (!BARRIOS_CABA_EN_LISTA.has(normalizarLugar(c.name))) { descartados.push(`${c.name} (no es de CABA: no se entrega)`); continue; }
    const rs = reglas.filter((r) => Array.isArray(r.carrier_id) && r.carrier_id[0] === c.id);
    const r = rs[0];
    const simple = rs.length === 1 && r.variable === "quantity" && r.operator === ">=" && !r.max_value && !r.list_price;
    if (!simple || !(r.list_base_price > 0)) { descartados.push(`${c.name} (regla de precio rara)`); continue; }
    fletes.push({ carrierId: c.id, nombre: c.name.trim(), precio: r.list_base_price });
  }
  return { fletes, descartados };
}

const VIDA_FLETES_MS = 10 * 60_000;
let fletesGuardados: { valor: Flete[]; at: number } | null = null;

/**
 * Los fletes de la tanda del 31/3/2026 (métodos 354 a 450), leídos de Odoo. En memoria 10 min:
 * Tomás cotiza seguido y la lista cambia una vez por año. Sólo lectura.
 */
export async function fletesAlquilerSimple(): Promise<Flete[]> {
  if (fletesGuardados && Date.now() - fletesGuardados.at < VIDA_FLETES_MS) return fletesGuardados.valor;
  const dominio = [["id", ">=", ODOO_ALQUILER_SIMPLE.fletesDesde], ["id", "<=", ODOO_ALQUILER_SIMPLE.fletesHasta]];
  const carriers = await executeKw<CarrierOdoo[]>(
    "delivery.carrier", "search_read", [dominio], { fields: ["name", "active", "product_id"], order: "id" }, LECTURA,
  );
  const reglas = await executeKw<ReglaPrecioOdoo[]>(
    "delivery.price.rule", "search_read",
    [[["carrier_id", "in", carriers.map((c) => c.id)]]],
    { fields: ["carrier_id", "variable", "operator", "max_value", "list_base_price", "list_price"] }, LECTURA,
  );
  const { fletes } = armarFletes(carriers, reglas);
  fletesGuardados = { valor: fletes, at: Date.now() };
  return fletes;
}

/** Mayúsculas, sin tildes ni puntos, un espacio entre palabras: «Núñez» → «NUNEZ», «José C. Paz» → «JOSE C PAZ». */
export function normalizarLugar(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.'´`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Cómo se llama en la lista lo que devuelven USIG o el cliente, cuando no es igual. Sólo los
 * obvios: el mismo lugar con otro nombre. Clave y valor ya normalizados. Sólo CABA: los del
 * conurbano se sacaron el 12/11, cuando JS decidió que no se entrega en provincia.
 *
 * «BELGRANO» a secas (USIG dice sólo «Belgrano»): en la lista hay BELGRANO C (130.800) y
 * BELGRANO R (124.200). JS decidió el 12/11 que se cobra siempre BELGRANO C, el más caro (fila 16
 * de la §11 de docs/sofia/alquiler-simple-propuesta.md). Antes iba a un vendedor.
 *
 * NO están, a propósito: «CAPITAL», «CABA» o «CAPITAL FEDERAL», que no son un barrio.
 */
const ALIAS_LUGAR: Record<string, string> = {
  // CABA: cómo los escribe USIG (datos_utiles) o la gente
  "BELGRANO": "BELGRANO C",
  "CONSTITUCION": "CONTITUCION", // así está en Odoo, con la errata
  "MONTSERRAT": "MONSERRAT",
  "LA PATERNAL": "PATERNAL",
  "VILLA GRAL MITRE": "VILLA MITRE",
  "VILLA GENERAL MITRE": "VILLA MITRE",
  "BOCA": "LA BOCA",
  "POMPEYA": "NUEVA POMPEYA",
  "PALERMO SOHO": "PALERMO",
  "PALERMO HOLLYWOOD": "PALERMO",
  "PALERMO CHICO": "PALERMO",
  "PALERMO VIEJO": "PALERMO",
  "PALERMO NUEVO": "PALERMO",
  "MICROCENTRO": "SAN NICOLAS",
  "ONCE": "BALVANERA",
};

/** Lo que se le saca al final («… Este», «… Oeste»), por si el lugar viene escrito así. */
const CALIFICATIVOS = /\s(ESTE|OESTE|NORTE|SUR|CENTRO)$/;

/**
 * El flete del barrio. PURA. Busca en la lista que le pasen: la de `fletesAlquilerSimple` ya
 * viene sin el conurbano.
 *
 * Compara normalizado (sin tildes, mayúsculas ni puntos), después por alias y por último sin el
 * «Este/Oeste/Norte/Sur/Centro» del final. Lo que va después de una coma o un paréntesis se
 * ignora («Palermo, CABA»). Null si no está o si hay más de uno que coincide: ese pedido va a un
 * vendedor (§5 y §8: «si el barrio no está en la lista, va a un vendedor»).
 */
export function buscarFletePorBarrio(fletes: Flete[], barrioOLocalidad: string | null | undefined): Flete | null {
  if (!barrioOLocalidad) return null;
  const base = normalizarLugar(barrioOLocalidad.split(/[,(]/)[0] ?? "");
  if (!base) return null;
  const candidatos: string[] = [base];
  const sinPrefijo = base.replace(/^(BARRIO|LOCALIDAD( DE)?)\s+/, "");
  if (sinPrefijo !== base) candidatos.push(sinPrefijo);
  for (const c of [...candidatos]) if (ALIAS_LUGAR[c]) candidatos.push(ALIAS_LUGAR[c]);
  for (const c of [...candidatos]) {
    const sin = c.replace(CALIFICATIVOS, "");
    if (sin !== c) { candidatos.push(sin); if (ALIAS_LUGAR[sin]) candidatos.push(ALIAS_LUGAR[sin]); }
  }
  for (const c of candidatos) {
    const hits = fletes.filter((f) => normalizarLugar(f.nombre) === c);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null; // dos métodos con el mismo nombre: que lo vea una persona
  }
  return null;
}

// ── De la dirección al barrio o la localidad ───────────────────────────────────────────

/** Dónde cae la dirección, con lo que hace falta para el flete. */
export type Ubicacion = {
  enCaba: boolean;
  /** El barrio oficial (sólo CABA), como lo escribe USIG: «Palermo», «Villa Gral. Mitre». */
  barrio: string | null;
  /** La localidad (sólo GBA): «Olivos», «Temperley». */
  localidad: string | null;
  /** El partido (sólo GBA): «Vicente López». Para la tarjeta, no para el flete. */
  partido: string | null;
  /** La dirección normalizada («DORREGO AV. 3307, CABA»). */
  direccion: string;
  punto: Punto | null;
  fuente: "usig" | "places";
};

export type ResultadoUbicacion =
  | { estado: "ok"; ubicacion: Ubicacion }
  | { estado: "ambigua"; opciones: string[] }
  | { estado: "no_encontrada"; motivo: string };

/** Una de las `direccionesNormalizadas` del normalizador de USIG (la parte que se usa). */
export type NormalizadaUsig = {
  tipo?: string;
  direccion?: string;
  cod_partido?: string;
  nombre_partido?: string;
  nombre_localidad?: string;
  coordenadas?: { x: string | number; y: string | number } | null;
};

/** El punto de una normalizada (USIG manda las coordenadas de CABA como texto). */
export function puntoUsig(n: NormalizadaUsig): Punto | null {
  const lng = Number(n.coordenadas?.x);
  const lat = Number(n.coordenadas?.y);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null;
}

/**
 * Cuál de las normalizadas de USIG es la obra. PURA.
 *
 * «Dorrego 3307» existe en CABA, Monte Grande, San Andrés y San Miguel. La regla es la de
 * geocodificar-reglas.ts: sin localidad escrita, es CABA. Con localidad escrita USIG ya filtra;
 * si igual vuelven varias, se busca la que coincide con lo escrito después de la coma. Si no se
 * puede decidir, «ambigua» con las opciones para preguntarle al cliente.
 */
export function elegirNormalizada(
  resultados: NormalizadaUsig[],
  texto: string,
): { elegida: NormalizadaUsig } | { ambigua: string[] } | null {
  const utiles = resultados.filter((r) => r.tipo === "calle_altura" || r.tipo === "calle_y_calle");
  if (!utiles.length) return null;
  if (utiles.length === 1) return { elegida: utiles[0] };
  if (!traeLocalidad(texto)) {
    const caba = utiles.filter((r) => r.cod_partido === "caba");
    if (caba.length === 1) return { elegida: caba[0] };
  } else {
    const despuesDeComa = normalizarLugar(texto.split(",").slice(1).join(" "));
    if (despuesDeComa) {
      const coinciden = utiles.filter((r) =>
        [r.nombre_localidad, r.nombre_partido].some((n) => n && despuesDeComa.includes(normalizarLugar(n))),
      );
      if (coinciden.length === 1) return { elegida: coinciden[0] };
    }
  }
  return { ambigua: utiles.map((r) => r.direccion ?? "").filter(Boolean).slice(0, 5) };
}

/** El lugar de la obra, para Tomás y la tarjeta: el barrio en CABA, la localidad afuera. PURA. */
export function lugarParaFlete(u: Ubicacion): string | null {
  return u.enCaba ? u.barrio : u.localidad;
}

/**
 * El flete de una ubicación ya resuelta. PURA. Null: en CABA, el barrio no está en la lista (va
 * a un vendedor); fuera de CABA, siempre: no se entrega ni se retira en provincia (JS, 12/11) y
 * Tomás le ofrece retirarlo en el depósito.
 */
export function fleteParaUbicacion(fletes: Flete[], u: Ubicacion): Flete | null {
  if (!u.enCaba) return null;
  return buscarFletePorBarrio(fletes, lugarParaFlete(u));
}

const USIG_NORMALIZAR = "https://servicios.usig.buenosaires.gob.ar/normalizar/";
const USIG_DATOS_UTILES = "https://ws.usig.buenosaires.gob.ar/datos_utiles";
const CABECERAS_USIG = { "User-Agent": "Mozilla/5.0 (compatible; AndamiosOS/1.0)", Accept: "application/json" };

async function pedirUsig<T>(url: string, fetchImpl: typeof fetch): Promise<T | null> {
  const res = await fetchImpl(url, { headers: CABECERAS_USIG, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null; // USIG contesta HTML de ayuda cuando no entiende los parámetros
  }
}

/** El barrio oficial de un punto de CABA (USIG datos_utiles). */
async function barrioDePunto(p: Punto, fetchImpl: typeof fetch): Promise<string | null> {
  const r = await pedirUsig<{ barrio?: string }>(`${USIG_DATOS_UTILES}?x=${p.lng}&y=${p.lat}`, fetchImpl);
  return r?.barrio?.trim() || null;
}

/** De una normalizada de USIG a la ubicación, con el barrio si es CABA. */
async function ubicacionDeNormalizada(n: NormalizadaUsig, fuente: Ubicacion["fuente"], fetchImpl: typeof fetch, punto?: Punto): Promise<Ubicacion> {
  const p = punto ?? puntoUsig(n);
  const enCaba = n.cod_partido === "caba";
  return {
    enCaba,
    barrio: enCaba && p ? await barrioDePunto(p, fetchImpl) : null,
    localidad: enCaba ? null : n.nombre_localidad?.trim() || null,
    partido: enCaba ? null : n.nombre_partido?.trim() || null,
    direccion: n.direccion ?? "",
    punto: p,
    fuente,
  };
}

/**
 * El barrio (CABA) o la localidad (GBA) de una dirección, para el flete.
 *
 * POR QUÉ USIG Y NO SÓLO geocodificar.ts: geocodificar devuelve un punto, no el barrio, y pedirle
 * el barrio a Places es pagar otra consulta (addressComponents). USIG (GCBA) es gratis, sin clave
 * y cubre el AMBA: el normalizador da la localidad y el partido del conurbano, y datos_utiles el
 * barrio oficial de CABA. Es la misma fuente que ya usa el catastro (src/lib/catastro/caba.ts).
 *
 * Si USIG no la encuentra (un country, un nombre propio), se geocodifica con Places
 * (`geocodificarDireccion`, el mismo de la Hoja del día, con su caché) y se le pregunta a USIG
 * por ese punto. `places: false` lo apaga (para los scripts y los tests).
 */
export async function barrioDeDireccion(
  direccion: string,
  opciones: { fetchImpl?: typeof fetch; places?: boolean } = {},
): Promise<ResultadoUbicacion> {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  // «Calle Doctor Juan Felipe Aranguren 1712» (S03023): con «Calle» adelante USIG no la encuentra.
  const limpia = limpiarDireccion(direccion).replace(/^calle\s+/i, "");
  if (!limpia) return { estado: "no_encontrada", motivo: "No hay dirección." };

  const r = await pedirUsig<{ direccionesNormalizadas?: NormalizadaUsig[] }>(
    `${USIG_NORMALIZAR}?direccion=${encodeURIComponent(limpia)}&geocodificar=true&maxOptions=10`, fetchImpl,
  ).catch(() => null);
  const eleccion = elegirNormalizada(r?.direccionesNormalizadas ?? [], limpia);
  if (eleccion && "ambigua" in eleccion) return { estado: "ambigua", opciones: eleccion.ambigua };
  if (eleccion) {
    const u = await ubicacionDeNormalizada(eleccion.elegida, "usig", fetchImpl);
    if (u.punto || !u.enCaba) return { estado: "ok", ubicacion: u };
  }

  if (opciones.places === false) return { estado: "no_encontrada", motivo: `USIG no reconoce «${limpia}».` };
  // Places de respaldo: import al vuelo, así los tests (que no lo usan) no cargan geocodificar.ts.
  const { geocodificarDireccion } = await import("./geocodificar");
  const g = await geocodificarDireccion(limpia);
  if (g.estado !== "ok") return { estado: "no_encontrada", motivo: `No se encontró «${limpia}» (ni en USIG ni en Google).` };
  const rev = await pedirUsig<NormalizadaUsig>(`${USIG_NORMALIZAR}?lat=${g.punto.lat}&lng=${g.punto.lng}`, fetchImpl).catch(() => null);
  if (!rev?.cod_partido) return { estado: "no_encontrada", motivo: `«${limpia}» queda fuera de lo que cubre USIG (el AMBA).` };
  return { estado: "ok", ubicacion: await ubicacionDeNormalizada({ ...rev, direccion: rev.direccion ?? limpia }, "places", fetchImpl, g.punto) };
}

// ── Las líneas de la orden ─────────────────────────────────────────────────────────────

/** Una pieza de la cotización: lo que sale del motor. `precioUnitario` es neto, por 30 días. */
export type PiezaCotizada = { codigo: CodigoPieza; cantidad: number; precioUnitario: number };

/** La franja de entrega en hora argentina, «HH:MM». Las de siempre: 08-12 y 13-16 (§6). */
export type Franja = { desde: string; hasta: string };
export const FRANJA_MANANA: Franja = { desde: "08:00", hasta: "12:00" };
export const FRANJA_TARDE: Franja = { desde: "13:00", hasta: "16:00" };
/** Las del depósito (Maturín 2570): de 10 a 12 y de 13 a 16, de 12 a 13 para (JS, 12/11). */
export const FRANJA_DEPOSITO_MANANA: Franja = { desde: "10:00", hasta: "12:00" };
export const FRANJA_DEPOSITO_TARDE: Franja = { desde: "13:00", hasta: "16:00" };

/**
 * Cómo se marca hoy en Odoo una orden que retira en el depósito (visto el 12/11, sólo lectura):
 * sin método de envío ni línea de flete, y con la dirección de la obra «RETIRA DE CUCHA CUCHA
 * 2345» o «RETIRA CUCHA CUCHA 2345 - DEPOSITO ANDAMIOS BUENOS AIRES» (S03008, S02929, S02769,
 * S01665, S01563). No hay un campo ni una etiqueta propia. Se sigue esa marca con el depósito que
 * dio JS el 12/11 (Maturín 2570); la diferencia con Cucha Cucha está en el handoff.
 */
export const DIRECCION_RETIRA_EN_DEPOSITO = "RETIRA DE MATURÍN 2570 - DEPÓSITO ANDAMIOS BUENOS AIRES";

export type CotizacionParaOdoo = {
  piezas: PiezaCotizada[];
  /** null: retira en el depósito (sin línea de flete ni método de envío). */
  flete: Flete | null;
  /** La diferencia hasta el mínimo, neta (0 si el material más el flete ya llega). */
  minimoOperativo: number;
  /** El recargo sobre el total del servicio si pidió la franja de una hora (0 si no). */
  recargoFranja: number;
  /**
   * El porcentaje del recargo, para la descripción de la línea. Es un parámetro
   * (alquiler_simple_recargo_franja, §10): si JS lo cambia, la orden tiene que decir lo mismo que
   * el mensaje que le llegó al cliente.
   */
  recargoFranjaPct: number;
  /** AAAA-MM-DD: el día de la entrega. */
  entrega: string;
  /** AAAA-MM-DD: el fin del período (la entrega + 30 días, §5). */
  fin: string;
  franja: Franja;
};

export type LineaOdooAlquiler = {
  productId: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  esFlete: boolean;
  secuencia: number;
};

export type LineasAlquilerSimple = {
  lineas: LineaOdooAlquiler[];
  /** rental_start_date / rental_return_date, en UTC como los guarda Odoo («AAAA-MM-DD HH:MM:SS»). */
  inicioUtc: string;
  finUtc: string;
  /** null: retira en el depósito. */
  carrierId: number | null;
  retiraEnDeposito: boolean;
  /** El valor de x_studio_horario_entrega, o false si la franja no está en la lista de Odoo. */
  horarioEntrega: string | false;
  /** La suma de las líneas, neta. Tiene que dar el total del motor. */
  neto: number;
  /** Lo que una persona tiene que mirar antes de confirmar (va a la tarjeta y a la nota). */
  avisos: string[];
};

/** Argentina no tiene horario de verano desde 2009: UTC−3 fijo. */
const OFFSET_AR_HORAS = 3;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «2026-11-12» + «08:00» (hora argentina) → «2026-11-12 11:00:00» (UTC, como Odoo). */
export function utcOdoo(fecha: string, hora: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, h + OFFSET_AR_HORAS, min));
  return t.toISOString().slice(0, 19).replace("T", " ");
}

/** «2026-11-12» + «08:00» → «12/11/2026 08:00», como lo escribe Odoo en la descripción. */
function fechaHoraAr(fecha: string, hora: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a} ${hora}`;
}

/** Las franjas que tiene el desplegable «Horario Entrega» de Odoo (x_studio_horario_entrega). */
const HORARIOS_ODOO = ["08:00 - 12:00", "09:00 - 13:00", "10:00 - 14:00", "13:00 - 16:00", "08:00 - 17:00"];

export function horarioEntregaOdoo(f: Franja): string | false {
  const v = `${f.desde} - ${f.hasta}`;
  return HORARIOS_ODOO.includes(v) ? v : false;
}

/** El orden de las líneas, como la «Plantilla Simples»: módulos, baranda, tablones, ruedas. */
const ORDEN: CodigoPieza[] = [
  "modulo_130x250", "modulo_090x250", "modulo_130x150", "modulo_090x150",
  "baranda_130", "baranda_090", "tablon_250", "tablon_150", "ruedas_juego", "tornillones_juego",
];

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Las líneas de sale.order.line de un alquiler simple, tal como las arma hoy Tamara. PURA.
 *
 * Lo que copia de las órdenes reales (S02365, S03023, S03026, S02997; ver el doc):
 *   · cada pieza es una línea de alquiler con su producto, la cantidad y el precio por 30 días, y la
 *     descripción «NOMBRE\ndel DD/MM/AAAA HH:MM al DD/MM/AAAA HH:MM» (hora argentina);
 *   · el MÍNIMO OPERATIVO es otra línea de alquiler, por la diferencia;
 *   · el flete es UNA línea (`is_delivery`) con el producto de envío, el nombre del barrio como
 *     descripción y el precio de la lista; la orden lleva además el método de envío (`carrier_id`).
 *
 * Lo propio:
 *   · los tornillones van por unidad (4 por juego, a un cuarto del precio del juego);
 *   · la baranda del angosto va como «junior» si TODOS los módulos angostos son junior; la del
 *     estándar junior no existe en Odoo y, si TODOS los estándar son junior, va como en S02997:
 *     por cada una, 2 bastidores baranda de 1,30 y 2 riendas JR de 1,50, con el precio de la pieza
 *     repartido entre las 4 unidades (el neto no cambia). Con torres mezcladas queda la de 2,50 y
 *     un aviso (ver PRODUCTO_BARANDA_090_JUNIOR);
 *   · el recargo de la franja de una hora va con PRODUCTO_RECARGO_FRANJA y la franja en la descripción;
 *   · si retira en el depósito (`flete` null): sin línea de flete ni carrier_id, con el mínimo
 *     operativo igual (todo material + mínimo) y sin recargo de franja (no aplica en el depósito).
 *
 * Tira si la cotización no tiene sentido (es un error del motor, no del cliente).
 */
export function lineasOrdenAlquilerSimple(
  c: CotizacionParaOdoo,
  productos: Record<CodigoPieza, number> = PRODUCTOS_ALQUILER_SIMPLE,
): LineasAlquilerSimple {
  if (!FECHA.test(c.entrega) || !FECHA.test(c.fin)) throw new Error("Las fechas de entrega y de fin van como AAAA-MM-DD.");
  if (c.fin <= c.entrega) throw new Error("El fin del alquiler tiene que ser después de la entrega.");
  if (!HORA.test(c.franja.desde) || !HORA.test(c.franja.hasta) || c.franja.hasta <= c.franja.desde) {
    throw new Error("La franja de entrega va como HH:MM a HH:MM.");
  }
  if (!c.piezas.length) throw new Error("La cotización no tiene piezas.");
  for (const p of c.piezas) {
    if (!CODIGOS_PIEZA.includes(p.codigo)) throw new Error(`Pieza desconocida: ${String(p.codigo)}.`);
    if (!Number.isInteger(p.cantidad) || p.cantidad <= 0) throw new Error(`Cantidad inválida para ${p.codigo}: ${p.cantidad}.`);
    if (!Number.isFinite(p.precioUnitario) || p.precioUnitario < 0) throw new Error(`Precio inválido para ${p.codigo}.`);
  }
  if (c.flete && (!(c.flete.precio > 0) || !c.flete.carrierId)) throw new Error("Falta el flete.");
  if (c.minimoOperativo < 0 || c.recargoFranja < 0) throw new Error("El mínimo y el recargo no pueden ser negativos.");
  const deposito = c.flete === null;
  if (deposito && c.recargoFranja > 0) throw new Error("En el depósito no hay recargo de franja.");

  const periodo = `del ${fechaHoraAr(c.entrega, c.franja.desde)} al ${fechaHoraAr(c.fin, c.franja.desde)}`;
  const avisos: string[] = [];
  const hay = (codigo: CodigoPieza) => c.piezas.some((p) => p.codigo === codigo);

  const productoDe = (codigo: CodigoPieza): number => {
    if (codigo === "baranda_090" && hay("modulo_090x150")) {
      if (!hay("modulo_090x250")) return PRODUCTO_BARANDA_090_JUNIOR;
      avisos.push("Hay torres angostas de 2,50 y junior: todas las barandas angostas quedaron de 2,50. Revisá cuántas son junior.");
    }
    if (codigo === "baranda_130" && hay("modulo_130x150") && hay("modulo_130x250")) {
      avisos.push("Hay torres estándar de 2,50 y junior: todas las barandas estándar quedaron de 2,50. Revisá cuántas son junior.");
    }
    return productos[codigo];
  };
  // La baranda estándar cuando todas las torres estándar son junior: se arma con sus partes.
  const barandaJuniorEnPartes = hay("modulo_130x150") && !hay("modulo_130x250");

  const lineas: LineaOdooAlquiler[] = [];
  let secuencia = 10;
  const piezas = [...c.piezas].sort((a, b) => ORDEN.indexOf(a.codigo) - ORDEN.indexOf(b.codigo));
  for (const p of piezas) {
    if (p.codigo === "baranda_130" && barandaJuniorEnPartes) {
      // 2 bastidores + 2 riendas por baranda: a + b = la mitad del precio, sin perder centavos.
      const bastidor = redondear(p.precioUnitario / 4);
      const rienda = redondear(p.precioUnitario / 2 - bastidor);
      for (const [productId, precioUnitario] of [[PRODUCTO_BASTIDOR_BARANDA_130, bastidor], [PRODUCTO_RIENDA_JR_HORIZONTAL, rienda]] as const) {
        lineas.push({
          productId,
          descripcion: `${NOMBRES_PRODUCTOS[productId]}\n${periodo}`,
          cantidad: p.cantidad * 2,
          precioUnitario,
          esFlete: false,
          secuencia: secuencia++,
        });
      }
      continue;
    }
    const productId = productoDe(p.codigo);
    const porJuego = UNIDADES_POR_JUEGO[p.codigo] ?? 1;
    lineas.push({
      productId,
      descripcion: `${NOMBRES_PRODUCTOS[productId] ?? p.codigo}\n${periodo}`,
      cantidad: p.cantidad * porJuego,
      precioUnitario: redondear(p.precioUnitario / porJuego),
      esFlete: false,
      secuencia: secuencia++,
    });
  }
  if (c.minimoOperativo > 0) {
    lineas.push({
      productId: PRODUCTO_MINIMO_OPERATIVO,
      descripcion: `${NOMBRES_PRODUCTOS[PRODUCTO_MINIMO_OPERATIVO]}\n${periodo}`,
      cantidad: 1,
      precioUnitario: redondear(c.minimoOperativo),
      esFlete: false,
      secuencia: secuencia++,
    });
  }
  const horarioEntrega = horarioEntregaOdoo(c.franja);
  if (c.recargoFranja > 0) {
    lineas.push({
      productId: PRODUCTO_RECARGO_FRANJA,
      descripcion: `RECARGO POR FRANJA HORARIA PACTADA (entrega de ${c.franja.desde} a ${c.franja.hasta} h, ${String(c.recargoFranjaPct).replace(".", ",")} % del servicio)\n${periodo}`,
      cantidad: 1,
      precioUnitario: redondear(c.recargoFranja),
      esFlete: false,
      secuencia: secuencia++,
    });
    if (horarioEntrega) avisos.push(`Hay recargo por franja pactada pero la franja (${c.franja.desde} a ${c.franja.hasta}) es una de las de siempre.`);
  } else if (!horarioEntrega && !deposito) {
    // En el depósito, la mañana (10 a 12) no está en el desplegable y no hace falta avisar.
    avisos.push(`La franja ${c.franja.desde} a ${c.franja.hasta} no es una de las de siempre y no tiene recargo.`);
  }
  if (c.flete) {
    lineas.push({
      productId: PRODUCTO_FLETE,
      descripcion: c.flete.nombre,
      cantidad: 1,
      precioUnitario: redondear(c.flete.precio),
      esFlete: true,
      secuencia: secuencia++,
    });
  }

  return {
    lineas,
    inicioUtc: utcOdoo(c.entrega, c.franja.desde),
    finUtc: utcOdoo(c.fin, c.franja.desde),
    carrierId: c.flete?.carrierId ?? null,
    retiraEnDeposito: deposito,
    horarioEntrega,
    neto: redondear(lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)),
    avisos,
  };
}

/**
 * La línea de renovación (más de 30 días, o vencido sin aviso, §5). PURA. Así la cargan hoy: una
 * línea más en la MISMA orden, cantidad 1, por el monto (total con flete ÷ 30 × días), con el
 * período completo hasta la nueva devolución (S02761, S02872). La orden ya está confirmada a esa
 * altura: escribirla la hace una persona; esto sólo arma la línea.
 */
export function lineaRenovacion(p: { monto: number; inicio: string; finNuevo: string; hora: string; secuencia?: number }): LineaOdooAlquiler {
  if (!FECHA.test(p.inicio) || !FECHA.test(p.finNuevo) || !HORA.test(p.hora)) throw new Error("Fechas como AAAA-MM-DD y hora como HH:MM.");
  if (!(p.monto > 0)) throw new Error("El monto de la renovación tiene que ser positivo.");
  return {
    productId: PRODUCTO_RENOVACION,
    descripcion: `${NOMBRES_PRODUCTOS[PRODUCTO_RENOVACION]}\ndel ${fechaHoraAr(p.inicio, p.hora)} al ${fechaHoraAr(p.finNuevo, p.hora)}`,
    cantidad: 1,
    precioUnitario: redondear(p.monto),
    esFlete: false,
    secuencia: p.secuencia ?? 50,
  };
}

// ── Escribir en Odoo ───────────────────────────────────────────────────────────────────
// SÓLO LAS LLAMA LA APROBACIÓN DE UNA PERSONA (la tarjeta de la bandeja, §10). Nada de acá se
// dispara desde una herramienta de Tomás.

export type DatosOrdenAlquilerSimple = {
  /**
   * La marca de idempotencia (x_asistente_ref), única por cotización: por ejemplo
   * «tomas-as:<id de la cotización>». Un reintento con la misma marca encuentra la orden en vez de
   * crear otra, igual que el borrador del asistente comercial (presupuestos.ts, `ordenPorRef`).
   */
  marca: string;
  partnerId: number;
  /** El vendedor (res.users). Las de Tomás, siempre Tamara (73): VENDEDORA_ALQUILER_SIMPLE en aprobar.ts. Null: el de Odoo. */
  vendedorUserId: number | null;
  cotizacion: CotizacionParaOdoo;
  /**
   * La dirección de entrega: la de los servicios del cliente si ya los mandó (§6). Si retira en
   * el depósito, la orden lleva DIRECCION_RETIRA_EN_DEPOSITO y esta va entre paréntesis (si hay).
   */
  direccionEntrega: string;
  enCaba: boolean;
  /** El «Origen» de la orden. Tamara pone «NOMBRE - SIMPLE». */
  origen: string;
  /** AAAA-MM-DD: de acá sale la validez (15 días, como la plantilla). */
  hoy: string;
  /** HTML para el chatter (nota interna, no le llega al cliente). Se publica sólo al crear. */
  notaInterna?: string | null;
  impuestoIvaId?: number;
};

export type OrdenAlquilerSimpleGuardada = {
  id: number;
  nombre: string;
  estado: string;
  neto: number;
  creada: boolean;
  /** true si la orden ya existía y no está en borrador: no se tocó. */
  intacta: boolean;
  avisos: string[];
};

let notaPlantilla: string | null | undefined;

/** El texto de condiciones de la «Plantilla Simples» (el mismo que tienen las órdenes de Tamara). */
async function condicionesSimples(): Promise<string | null> {
  if (notaPlantilla !== undefined) return notaPlantilla;
  const [t] = await executeKw<{ note: string | false }[]>(
    "sale.order.template", "read", [[ODOO_ALQUILER_SIMPLE.plantilla]], { fields: ["note"] }, LECTURA,
  ).catch(() => []);
  notaPlantilla = typeof t?.note === "string" && t.note.trim() ? t.note : null;
  return notaPlantilla;
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Los valores de sale.order. PURA (la exporta para los tests). */
export function valoresOrdenAlquilerSimple(
  d: DatosOrdenAlquilerSimple,
  armado: LineasAlquilerSimple,
  condiciones: string | null,
  reemplazarLineas: boolean,
): Record<string, unknown> {
  const iva = d.impuestoIvaId ?? ODOO_ALQUILER_SIMPLE.impuestoIva;
  const lineas = armado.lineas.map((l) => [0, 0, {
    product_id: l.productId,
    name: l.descripcion,
    product_uom_qty: l.cantidad,
    price_unit: l.precioUnitario,
    // En las órdenes reales TODAS las líneas son de alquiler, el flete también (S02365).
    is_rental: true,
    is_delivery: l.esFlete,
    sequence: l.secuencia,
    tax_ids: [[6, 0, [iva]]],
  }]);
  return {
    partner_id: d.partnerId,
    is_rental_order: true,
    x_studio_tipo_de_contrato: ODOO_ALQUILER_SIMPLE.contrato,
    ...(d.vendedorUserId ? { user_id: d.vendedorUserId } : {}),
    tag_ids: [[6, 0, [ODOO_ALQUILER_SIMPLE.etiquetaSimple]]],
    // Retira en el depósito: sin método de envío, como las órdenes de Tamara (false lo borra si
    // un reintento la reescribe después de haber sido con envío).
    carrier_id: armado.carrierId ?? false,
    rental_start_date: armado.inicioUtc,
    rental_return_date: armado.finUtc,
    x_studio_horario_entrega: armado.horarioEntrega,
    x_direccion_obra: armado.retiraEnDeposito
      ? `${DIRECCION_RETIRA_EN_DEPOSITO}${d.direccionEntrega.trim() ? ` (obra: ${d.direccionEntrega.trim()})` : ""}`
      : d.direccionEntrega,
    x_obra_provincia: d.enCaba ? "Ciudad Autónoma de Buenos Aires" : "Buenos Aires",
    origin: d.origen,
    x_asistente_ref: d.marca,
    validity_date: sumarDias(d.hoy, ODOO_ALQUILER_SIMPLE.validezDias),
    // La plantilla NO se asigna (sale_order_template_id): no sabemos si en Odoo 19 agrega sus
    // líneas al crear por API, y serían 3 módulos y 3 tablones de más. Se copia su texto.
    ...(condiciones ? { note: condiciones } : {}),
    order_line: reemplazarLineas ? [[5, 0, 0], ...lineas] : lineas,
  };
}

async function ordenPorMarca(marca: string): Promise<{ id: number; name: string; state: string } | null> {
  const [o] = await executeKw<{ id: number; name: string; state: string }[]>(
    "sale.order", "search_read", [[["x_asistente_ref", "=", marca]]], { fields: ["id", "name", "state"], limit: 1, order: "id desc" }, LECTURA,
  );
  return o ?? null;
}

/**
 * Crea la orden de alquiler simple EN BORRADOR (cotización). Nunca la confirma: la confirma una
 * persona en Odoo cuando el cliente acepta y mandó los documentos (§6).
 *
 * IDEMPOTENTE por `marca` (x_asistente_ref): si un intento anterior ya la creó, la encuentra. Si
 * sigue en borrador, le reescribe los datos y las líneas (la cotización pudo cambiar); si ya la
 * confirmaron o cancelaron, no la toca y lo devuelve (`intacta`).
 *
 * Devuelve el neto que calculó Odoo: si no da lo mismo que las líneas, va un aviso para la tarjeta.
 */
export async function crearOrdenAlquilerSimple(d: DatosOrdenAlquilerSimple): Promise<OrdenAlquilerSimpleGuardada> {
  if (!d.marca.trim()) throw new Error("Falta la marca de la orden (x_asistente_ref).");
  const armado = lineasOrdenAlquilerSimple(d.cotizacion);
  const avisos = [...armado.avisos];

  const ya = await ordenPorMarca(d.marca);
  if (ya && ya.state !== "draft" && ya.state !== "sent") {
    const [o] = await executeKw<{ amount_untaxed: number }[]>("sale.order", "read", [[ya.id]], { fields: ["amount_untaxed"] }, LECTURA);
    return { id: ya.id, nombre: ya.name, estado: ya.state, neto: o?.amount_untaxed ?? 0, creada: false, intacta: true, avisos: [`La ${ya.name} ya existe y no está en borrador: no se modificó.`] };
  }

  const condiciones = await condicionesSimples();
  let id: number;
  let creada = false;
  if (ya) {
    id = ya.id;
    await executeKw("sale.order", "write", [[id], valoresOrdenAlquilerSimple(d, armado, condiciones, true)], {}, ESCRITURA);
  } else {
    id = await executeKw<number>("sale.order", "create", [valoresOrdenAlquilerSimple(d, armado, condiciones, false)], {}, ESCRITURA);
    creada = true;
  }

  const [o] = await executeKw<{ name: string; state: string; amount_untaxed: number }[]>(
    "sale.order", "read", [[id]], { fields: ["name", "state", "amount_untaxed"] }, LECTURA,
  );
  if (Math.abs(o.amount_untaxed - armado.neto) > 1) {
    avisos.push(`Odoo calculó un neto de ${o.amount_untaxed} y las líneas suman ${armado.neto}: revisá la orden antes de mandarla.`);
  }
  if (creada && d.notaInterna?.trim()) {
    await executeKw("sale.order", "message_post", [[id]], { body: d.notaInterna, message_type: "comment", subtype_xmlid: "mail.mt_note" }, ESCRITURA);
  }
  return { id, nombre: o.name, estado: o.state, neto: o.amount_untaxed, creada, intacta: false, avisos };
}

// ── Adjuntos ───────────────────────────────────────────────────────────────────────────

export type ArchivoParaOrden = {
  /** Cómo se ve en Odoo: «DNI frente.jpg», «Servicio 1 - luz.pdf». */
  nombre: string;
  mime: string;
  contenido: Buffer | Uint8Array;
};

/** Lo que se acepta adjuntar: las fotos y los PDF que manda el cliente por WhatsApp (§6). */
export const MIMES_ADJUNTOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** El sha1 en hexa del contenido: es lo que Odoo guarda en `checksum` de ir.attachment. PURA. */
export function checksumOdoo(contenido: Buffer | Uint8Array): string {
  return createHash("sha1").update(contenido).digest("hex");
}

/**
 * Adjunta los documentos del cliente (DNI y servicios, §6) a la orden: ir.attachment con
 * res_model sale.order, como los adjuntos que suben a mano. Quedan en el clip de la orden, que sólo
 * ve quien tiene acceso a Ventas (no son públicos ni tienen token de acceso).
 *
 * IDEMPOTENTE por contenido: Odoo guarda el sha1 en `checksum`; el archivo que ya está en la orden
 * (mismo contenido) no se vuelve a subir. Si `nota` viene y se subió algo, deja una nota interna
 * en el chatter con los archivos, para que se vean sin abrir el clip.
 */
export async function adjuntarArchivosAOrden(
  ordenId: number,
  archivos: ArchivoParaOrden[],
  opciones: { nota?: string | null } = {},
): Promise<{ ids: number[]; subidos: number; yaEstaban: number }> {
  for (const a of archivos) {
    if (!MIMES_ADJUNTOS.includes(a.mime)) throw new Error(`No se adjunta «${a.nombre}»: el tipo ${a.mime} no es una foto ni un PDF.`);
    if (!a.contenido.length) throw new Error(`«${a.nombre}» está vacío.`);
  }
  const [orden] = await executeKw<{ id: number; state: string }[]>("sale.order", "read", [[ordenId]], { fields: ["state"] }, LECTURA);
  if (!orden) throw new Error(`La orden ${ordenId} no existe en Odoo.`);

  const conSuma = archivos.map((a) => ({ ...a, checksum: checksumOdoo(a.contenido) }));
  const previos = await executeKw<{ id: number; checksum: string | false }[]>(
    "ir.attachment", "search_read",
    [[["res_model", "=", "sale.order"], ["res_id", "=", ordenId], ["checksum", "in", conSuma.map((a) => a.checksum)]]],
    { fields: ["checksum"] }, LECTURA,
  );
  const porSuma = new Map(previos.map((p) => [p.checksum, p.id]));

  const ids: number[] = [];
  const nuevos: number[] = [];
  for (const a of conSuma) {
    const ya = porSuma.get(a.checksum);
    if (ya) { ids.push(ya); continue; }
    const id = await executeKw<number>("ir.attachment", "create", [{
      name: a.nombre,
      type: "binary",
      datas: Buffer.from(a.contenido).toString("base64"),
      res_model: "sale.order",
      res_id: ordenId,
      mimetype: a.mime,
    }], {}, { timeoutMs: 60_000 });
    porSuma.set(a.checksum, id); // el mismo archivo dos veces en la lista: se sube una
    ids.push(id);
    nuevos.push(id);
  }
  if (nuevos.length && opciones.nota?.trim()) {
    await executeKw("sale.order", "message_post", [[ordenId]], {
      body: opciones.nota, message_type: "comment", subtype_xmlid: "mail.mt_note", attachment_ids: nuevos,
    }, ESCRITURA);
  }
  return { ids, subidos: nuevos.length, yaEstaban: ids.length - nuevos.length };
}
