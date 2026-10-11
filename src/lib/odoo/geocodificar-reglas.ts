// Las reglas de la geocodificación de obras, sin Google ni Odoo adentro.
//
// Lo usan el cron (geocodificar.ts → /api/operaciones/geocodificar), la Hoja del día (que
// geocodifica en el momento las obras del día sin coordenadas) y el script
// scripts/geocodificar-obras.mjs. Por eso no importa nada: Google y Odoo entran como
// funciones (`Buscar`, `Odoo`) y los tests le pasan unas de mentira. El script lo carga con
// `--experimental-strip-types`, así que nada de sintaxis que no sea "tipos que se borran"
// (ni enums ni parameter properties).

/** Argentina continental, con margen. */
export const CAJA_AR = { latMin: -56, latMax: -21, lngMin: -74, lngMax: -52 };

/**
 * El AMBA, para cuando la obra dice CABA (o no dice nada y se asume CABA): 70 km desde el
 * Obelisco llega a La Plata (55), Pilar y Escobar (50) y deja afuera a Mar del Plata o a una
 * "Rivadavia 1200" de otra provincia, que es lo que devuelve Google cuando la dirección
 * viene rara y la ciudad no pesa.
 */
export const AMBA = { lat: -34.6037, lng: -58.3816, radioKm: 70 };

/** Cuánto se puede mirar hacia atrás y hacia adelante en el tablero de planificación. */
export const VENTANA_TABLERO = { diasAtras: 7, diasAdelante: 45 };

/**
 * Tope de consultas a Google por corrida (no de ventas: una venta difícil usa hasta
 * MAX_VARIANTES consultas). Es una red contra un error nuestro —un cambio que haga que todo
 * se vea desactualizado y dispare 2000 consultas pagas de una— más que contra el uso normal,
 * que son unas pocas por día. 300 son ~10 USD en el peor caso y entran holgadas en los 300 s
 * del cron (~0,3 s cada una).
 */
export const MAX_CONSULTAS_POR_CORRIDA = 300;

/** Variantes por venta, la original incluida. */
export const MAX_VARIANTES = 6;

/** La ciudad que se asume cuando la venta no tiene ciudad (o tiene basura). */
export const CIUDAD_POR_DEFECTO = "Ciudad Autónoma de Buenos Aires";

export type Punto = { lat: number; lng: number };
export type Buscar = (texto: string) => Promise<Punto | null>;

export type FilaVenta = {
  id: number;
  name: string;
  x_direccion_obra: string | false;
  x_obra_ciudad: string | false;
  x_obra_lat: number | false;
  x_obra_lng: number | false;
  x_obra_geo_dir: string | false;
};

export const CAMPOS_VENTA = ["name", "x_direccion_obra", "x_obra_ciudad", "x_obra_lat", "x_obra_lng", "x_obra_geo_dir"];

const sinTilde = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const espacios = (x: string) => x.replace(/\s+/g, " ").trim();

// ─── La ciudad ──────────────────────────────────────────────────────────────

/**
 * La ciudad, si sirve para acotar. En Odoo hay 2120 ventas sin ciudad y entre las cargadas
 * aparecen "AAN", "BXB", "C1406GXZ" (un código postal) y "--": eso no ayuda a Google, lo
 * confunde. Se pide una palabra de 4 letras o más y que no sea un CPA.
 */
export function ciudadUtil(ciudad: string | false | null | undefined): string | null {
  const c = espacios(typeof ciudad === "string" ? ciudad : "");
  if (!c) return null;
  if (/^[A-Z]\d{4}[A-Z]{3}$/i.test(c)) return null;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{4}/.test(c) && !/^c\.?a\.?b\.?a\.?$/i.test(c)) return null;
  return c;
}

/**
 * ¿La obra es en CABA? También "Buenos Aires" (58 ventas: casi siempre es la Capital, y si
 * es la provincia igual cae en el AMBA) y la ciudad vacía, que se asume CABA.
 */
export function esCaba(ciudad: string | false | null | undefined): boolean {
  const c = ciudadUtil(ciudad);
  if (!c) return true;
  const n = sinTilde(c).replace(/[.\s]/g, "");
  return n === "caba" || n === "capital" || n === "capitalfederal" || n === "buenosaires" ||
    /^(ciudad|cdad)(autonoma)?(de)?buenosaires$/.test(n);
}

// ─── Las consultas ──────────────────────────────────────────────────────────

/** La consulta de siempre (la que se usó hasta ahora): "dirección, ciudad, Argentina". */
export function consultaOriginal(dir: string, ciudad: string | false | null | undefined): string {
  return espacios([dir, typeof ciudad === "string" ? ciudad : "", "Argentina"].filter(Boolean).join(", "));
}

/**
 * La dirección sin lo que Google no sabe leer: piso, departamento, PB, oficina, UF,
 * local y el "02" de "Estados Unidos 02" (un número con cero adelante pegado al final, que
 * no es una altura: la altura ya está antes). No toca la altura principal.
 */
export function limpiarDireccion(dir: string): string {
  // Lo que va entre paréntesis ("(Capilla…, Hospital Rivadavia)", "(RETIRAN ELLOS)"), un
  // "- Lado Jovellanos" después de la altura y un "RETIRA" adelante son notas, no dirección.
  let d = espacios(dir.replace(/\([^)]*\)/g, " ").replace(/^retira\s+/i, "").replace(/(\d)\s+-\s+\D.*$/, "$1"));
  const sufijos = [
    /[,\s]+(piso|p\.)\s*\d+\s*°?\s*[a-z]?\b.*$/i,
    /[,\s]+(dto|dpto|depto|departamento)\.?\s*[\w°]+.*$/i,
    /[,\s]+(pb|p\.b\.|planta baja)\b.*$/i,
    /[,\s]+(of|oficina|uf|u\.f\.|local|lote)\.?\s*\d+.*$/i,
    /[,\s]+\d+\s*°\s*[a-z]?\s*$/i, // "Corrientes 1234 3°B"
    /\s+0\d+\s*$/, // "Estados Unidos 02"
  ];
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const re of sufijos) {
      const n = d.replace(re, "").trim();
      if (n !== d && /\d/.test(n)) { d = n; cambio = true; }
    }
  }
  return d.replace(/[,\s]+$/, "");
}

/** ¿La dirección ya trae la localidad? Una coma después de la altura, o CABA / Bs. As. escrito. */
export function traeLocalidad(dir: string): boolean {
  return /\d[^,]*,\s*\S/.test(dir) || /\b(caba|c\.a\.b\.a\.?|capital federal|buenos aires|bs\.?\s*as\.?|pcia|pvcia|provincia)\b/i.test(dir);
}

/** "X esq. Y" → { calle: "X", cruce: "Y" }; sin esquina, null. */
export function partesEsquina(dir: string): { calle: string; cruce: string } | null {
  const m = espacios(dir).match(/^(.+?)\s*(?:,\s*)?\b(?:esq\.?|esquina|casi)\s+(.+)$/i);
  if (!m) return null;
  const calle = m[1].replace(/[,\s]+$/, "").trim();
  const cruce = m[2].trim();
  return calle && cruce ? { calle, cruce } : null;
}

/**
 * Las consultas que se prueban para una venta, en orden y sin repetir:
 *   1. la de siempre ("dirección, ciudad, Argentina"). Si no hay ciudad (o es basura) y la
 *      dirección no dice dónde, con CABA: sin ciudad, "Sarandí 247, Argentina" caía en
 *      Moreno (33 km) y no en Balvanera;
 *   2. la dirección limpia (sin piso/dto/PB/"02"/notas) con la misma ciudad;
 *   3. con esquina, la primera parte sola ("Ing. Huergo 913"), que tiene la altura;
 *   4. con esquina, "X y Y" ("Ing. Huergo y Estados Unidos"), sin las alturas;
 *   5. cuando se asumió CABA, la limpia con "Buenos Aires" (Google a veces no se lleva con
 *      "Ciudad Autónoma") y al final la de siempre sin ciudad (por si es del conurbano).
 * Las ventas ya resueltas no se rehacen (x_obra_geo_dir), así que el orden nuevo no mueve
 * ningún punto que ya estaba.
 */
export function consultasDe(dir: string, ciudad: string | false | null | undefined): string[] {
  // Sin ciudad, si la dirección ya dice dónde ("Moreno 1228 CABA", "Corrientes 1448,
  // Olivos, Prov. de Bs.As") no se le pega CABA: "…Olivos…, Ciudad Autónoma" confunde.
  const c = ciudadUtil(ciudad) ?? (traeLocalidad(dir) ? null : CIUDAD_POR_DEFECTO);
  const con = (d: string, ciu: string | null = c) => espacios(ciu ? `${d}, ${ciu}, Argentina` : `${d}, Argentina`);
  const limpia = limpiarDireccion(dir);
  const out = [c === CIUDAD_POR_DEFECTO ? con(espacios(dir)) : consultaOriginal(dir, ciudad), con(limpia)];
  const esq = partesEsquina(limpia);
  if (esq) {
    if (/\d/.test(esq.calle)) out.push(con(esq.calle));
    const sinAltura = (x: string) => limpiarDireccion(x).replace(/\s+\d+\s*$/, "").trim();
    out.push(con(`${sinAltura(esq.calle)} y ${sinAltura(esq.cruce)}`));
  }
  if (c === CIUDAD_POR_DEFECTO) out.push(con(esq && /\d/.test(esq.calle) ? esq.calle : limpia, "Buenos Aires"), consultaOriginal(dir, ciudad));
  return [...new Set(out)].slice(0, MAX_VARIANTES);
}

// ─── El punto ───────────────────────────────────────────────────────────────

export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type Veredicto = "ok" | "fuera_de_argentina" | "fuera_del_amba";

/**
 * ¿El punto sirve? Dentro de la caja de Argentina siempre (Google resuelve direcciones
 * ambiguas en otro país —hay "Corrientes 1125" en varios— y un punto en México rompe el
 * encuadre del mapa para todos los demás); si la obra es en CABA (o sin ciudad), además a
 * menos de AMBA.radioKm del Obelisco.
 */
export function validarPunto(p: Punto, ciudad: string | false | null | undefined): Veredicto {
  const dentroAr = p.lat >= CAJA_AR.latMin && p.lat <= CAJA_AR.latMax && p.lng >= CAJA_AR.lngMin && p.lng <= CAJA_AR.lngMax;
  if (!dentroAr) return "fuera_de_argentina";
  if (esCaba(ciudad) && distanciaKm(p, AMBA) > AMBA.radioKm) return "fuera_del_amba";
  return "ok";
}

export type Resolucion =
  | { estado: "ok"; consulta: string; punto: Punto; consultas: number }
  | { estado: "sin_resultado"; consultas: number; probadas: string[] }
  | { estado: Exclude<Veredicto, "ok">; consultas: number; probadas: string[]; consulta: string; punto: Punto };

/**
 * Prueba las consultas en orden hasta que una da un punto válido. Un punto inválido no
 * corta: se sigue con la próxima variante. Si ninguna sirve, el fallo es el último punto
 * inválido (más informativo que "sin resultado") o sin resultado. `maxConsultas` corta antes
 * cuando la corrida se queda sin cupo.
 */
export async function resolverDireccion(
  dir: string,
  ciudad: string | false | null | undefined,
  buscar: Buscar,
  maxConsultas = MAX_VARIANTES,
): Promise<Resolucion> {
  const probadas: string[] = [];
  let malo: { estado: Exclude<Veredicto, "ok">; consulta: string; punto: Punto } | null = null;
  for (const consulta of consultasDe(dir, ciudad).slice(0, Math.max(1, maxConsultas))) {
    probadas.push(consulta);
    const punto = await buscar(consulta);
    if (!punto) continue;
    const v = validarPunto(punto, ciudad);
    if (v === "ok") return { estado: "ok", consulta, punto, consultas: probadas.length };
    malo = { estado: v, consulta, punto };
  }
  return malo ? { ...malo, consultas: probadas.length, probadas } : { estado: "sin_resultado", consultas: probadas.length, probadas };
}

// ─── Qué ventas ─────────────────────────────────────────────────────────────

/**
 * ¿Hay que geocodificarla? Tiene dirección y no tiene punto, o lo tiene pero contra otro
 * texto (le corrigieron la dirección). `x_obra_geo_dir` es lo que hace idempotente todo.
 */
export function necesitaGeo(f: FilaVenta): boolean {
  if (typeof f.x_direccion_obra !== "string" || !f.x_direccion_obra.trim()) return false;
  const tienePunto = Boolean(f.x_obra_lat && f.x_obra_lng);
  return !(tienePunto && f.x_obra_geo_dir === f.x_direccion_obra);
}

/** "2026-10-11" + n días. */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Hoy en Buenos Aires ("2026-10-11"). */
export function hoyAr(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

/**
 * De dos jornadas, la que más apura: la próxima de hoy en adelante; si no hay ninguna por
 * venir, la pasada más reciente.
 */
export function masUrgente(actual: string | undefined, nueva: string, hoy: string): string {
  if (!actual) return nueva;
  if (nueva >= hoy) return actual >= hoy && actual <= nueva ? actual : nueva;
  return actual >= hoy || actual >= nueva ? actual : nueva;
}

/**
 * Las ventas a geocodificar, sin repetir y en orden de urgencia: primero las del tablero
 * (de hoy en adelante, la más próxima primero; después las de los últimos días, la más
 * reciente primero), después las
 * de "Armado" (el mapa, que puede esperar). Si el cupo no alcanza, lo que queda afuera es lo
 * que menos apura. `fechaDe` es la primera jornada de cada venta en la ventana del tablero.
 */
export function elegirVentas(armado: FilaVenta[], planificadas: FilaVenta[], fechaDe: Map<number, string>, hoy: string): FilaVenta[] {
  const orden = (a: FilaVenta, b: FilaVenta) => {
    const fa = fechaDe.get(a.id) ?? "", fb = fechaDe.get(b.id) ?? "";
    if ((fa >= hoy) !== (fb >= hoy)) return fa >= hoy ? -1 : 1;
    return (fa >= hoy ? fa.localeCompare(fb) : fb.localeCompare(fa)) || a.id - b.id;
  };
  const plan = planificadas.filter(necesitaGeo).sort(orden);
  const vistos = new Set(plan.map((f) => f.id));
  return [...plan, ...armado.filter((f) => necesitaGeo(f) && !vistos.has(f.id))];
}

/**
 * Para la Hoja del día: de las ventas de las obras del día sin coordenadas, cuáles
 * geocodificar en esta lectura. A lo sumo `max`, y no una a la que se le intentó hace menos
 * de `esperaMs` (anota el intento en `intentos`, que vive en memoria): una dirección que
 * Google no resuelve no se consulta en cada refresco de la pantalla.
 */
export function elegirAlVuelo(
  obras: { ventaId: number | null; lat: number | null; lng: number | null }[],
  intentos: Map<number, number>,
  ahoraMs: number,
  max = 5,
  esperaMs = 30 * 60_000,
): number[] {
  const out: number[] = [];
  for (const o of obras) {
    if (out.length >= max) break;
    if (o.ventaId == null || (o.lat != null && o.lng != null) || out.includes(o.ventaId)) continue;
    if (ahoraMs - (intentos.get(o.ventaId) ?? -Infinity) < esperaMs) continue;
    out.push(o.ventaId);
  }
  if (intentos.size > 2000) intentos.clear();
  for (const id of out) intentos.set(id, ahoraMs);
  return out;
}

// ─── La corrida (con Google y Odoo inyectados) ──────────────────────────────

type M2O = [number, string] | false;

/** Lo de Odoo que hace falta. `write` puede ser de mentira (el simulacro del script). */
export type Odoo = {
  searchRead: <T>(model: string, domain: unknown[], fields: string[], opts?: { limit?: number }) => Promise<T[]>;
  read: <T>(model: string, ids: number[], fields: string[]) => Promise<T[]>;
  write: (model: string, ids: number[], values: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Las candidatas: las ventas tipo "Obra " en **Armado** (el Mapa de Obras) más las ventas de
 * las OTs con jornadas en el tablero entre VENTANA_TABLERO.diasAtras y diasAdelante (la Hoja
 * del día y sus tiempos de manejo). Asignación → OT (`x_ot_id`) → venta (`x_order_id`).
 */
export async function candidatas(odoo: Odoo, hoy: string): Promise<{ lista: FilaVenta[]; fechaDe: Map<number, string>; armado: number; planificadas: number }> {
  const desde = sumarDias(hoy, -VENTANA_TABLERO.diasAtras);
  const hasta = sumarDias(hoy, VENTANA_TABLERO.diasAdelante);
  const [armado, asigs] = await Promise.all([
    odoo.searchRead<FilaVenta>(
      "sale.order",
      [["x_studio_tipo_de_contrato", "=", "Obra "], ["x_studio_estado_de_obra", "=", "Armado"], ["x_direccion_obra", "!=", false]],
      CAMPOS_VENTA,
      { limit: 3000 },
    ),
    odoo.searchRead<{ x_ot_id: M2O; x_fecha: string | false }>(
      "x_aba_asignacion",
      [["x_fecha", ">=", desde], ["x_fecha", "<=", hasta], ["x_ot_id", "!=", false]],
      ["x_ot_id", "x_fecha"],
      { limit: 5000 },
    ),
  ]);
  const fechaOt = new Map<number, string>();
  for (const a of asigs) {
    if (!Array.isArray(a.x_ot_id) || typeof a.x_fecha !== "string") continue;
    fechaOt.set(a.x_ot_id[0], masUrgente(fechaOt.get(a.x_ot_id[0]), a.x_fecha, hoy));
  }
  const ots = fechaOt.size ? await odoo.read<{ id: number; x_order_id: M2O }>("x_aba_orden_trabajo", [...fechaOt.keys()], ["x_order_id"]) : [];
  const fechaDe = new Map<number, string>();
  for (const o of ots) {
    if (!Array.isArray(o.x_order_id)) continue;
    fechaDe.set(o.x_order_id[0], masUrgente(fechaDe.get(o.x_order_id[0]), fechaOt.get(o.id)!, hoy));
  }
  const planificadas = fechaDe.size
    ? (await odoo.read<FilaVenta>("sale.order", [...fechaDe.keys()], CAMPOS_VENTA)).filter((f) => typeof f.x_direccion_obra === "string" && f.x_direccion_obra.trim())
    : [];
  return { lista: elegirVentas(armado, planificadas, fechaDe, hoy), fechaDe, armado: armado.length, planificadas: planificadas.length };
}

export type Fallo = { venta: string; consulta: string; probadas: string[] };
export type ResultadoGeo = {
  candidatas: number;
  geocodificadas: number;
  consultas: number;
  /** Lo que se resolvió (venta, contra qué consulta, el punto). */
  resueltas: { venta: string; consulta: string; lat: number; lng: number }[];
  sinResultado: Fallo[];
  /** Puntos fuera de la caja de Argentina o, para CABA, fuera del AMBA. */
  fueraDeArgentina: (Fallo & { lat: number; lng: number; motivo: Exclude<Veredicto, "ok"> })[];
  truncado: boolean;
};

/**
 * Geocodifica `filas` (las que lo necesiten) hasta `maxConsultas`, escribiendo en Odoo con
 * `odoo.write`. Guarda en `x_obra_geo_dir` la DIRECCIÓN contra la que se geocodificó (no la
 * variante de la consulta: la idempotencia compara contra `x_direccion_obra`). Nunca tira por
 * una venta: los fallos se devuelven.
 */
export async function geocodificarFilas(filas: FilaVenta[], buscar: Buscar, odoo: Pick<Odoo, "write">, maxConsultas = MAX_CONSULTAS_POR_CORRIDA): Promise<ResultadoGeo> {
  const pendientes = filas.filter(necesitaGeo);
  const out: ResultadoGeo = { candidatas: pendientes.length, geocodificadas: 0, consultas: 0, resueltas: [], sinResultado: [], fueraDeArgentina: [], truncado: false };
  for (const f of pendientes) {
    const cupo = maxConsultas - out.consultas;
    if (cupo <= 0) { out.truncado = true; break; }
    const dir = f.x_direccion_obra as string;
    const r = await resolverDireccion(dir, f.x_obra_ciudad, buscar, cupo);
    out.consultas += r.consultas;
    if (r.estado === "ok") {
      await odoo.write("sale.order", [f.id], { x_obra_lat: r.punto.lat, x_obra_lng: r.punto.lng, x_obra_geo_dir: dir });
      out.geocodificadas++;
      out.resueltas.push({ venta: f.name, consulta: r.consulta, ...r.punto });
    } else if (r.estado === "sin_resultado") {
      out.sinResultado.push({ venta: f.name, consulta: r.probadas[0] ?? "", probadas: r.probadas });
    } else {
      out.fueraDeArgentina.push({ venta: f.name, consulta: r.consulta, probadas: r.probadas, lat: r.punto.lat, lng: r.punto.lng, motivo: r.estado });
    }
  }
  return out;
}

/** El pedido a `places:searchText` (Places API New). `fetchImpl` para el script y los tests. */
export function buscadorPlaces(key: string, fetchImpl: typeof fetch = fetch): Buscar {
  return async (texto) => {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location" },
      body: JSON.stringify({ textQuery: texto, regionCode: "AR", maxResultCount: 1 }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Places API: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const json = (await res.json()) as { places?: { location?: { latitude: number; longitude: number } }[] };
    const loc = json?.places?.[0]?.location;
    return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  };
}
