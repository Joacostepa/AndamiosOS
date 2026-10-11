// Los tiempos de manejo de Google (Routes API, computeRouteMatrix) para la Hoja del día.
//
// SOLO SERVER-SIDE: usa la clave de Google y la service role (hd_tiempos).
//
// NUNCA ROMPE NI DEMORA LA HOJA. Sin clave, con la API apagada (hoy contesta 403
// SERVICE_DISABLED hasta que se habilite "Routes API" en Google Cloud), sin coordenadas o
// si tarda, el día sale igual con las duraciones típicas: `tiemposDelDia` espera a Google
// como mucho TOPE_MS y nunca tira. Lo que llega tarde se guarda igual (en memoria y en
// hd_tiempos, con `after`) y sirve para la próxima lectura. Si Google contesta con un error,
// no se le vuelve a pedir por un rato (APAGADO_MS): una clave mal configurada no suma
// latencia a cada lectura.
//
// SÓLO LA PANTALLA LE PIDE A GOOGLE. Los gestos, los envíos y el link del celular leen el
// día con `soloCache` (leerDia sin `tiempos: "google"`): lo que ya está en memoria y en
// hd_tiempos, sin esperar a nadie. El GET del escritorio (/api/hoja-dia) es el que pide lo
// que falta.
//
// CUÁNTO SE PAGA. Cada elemento (un origen × un destino) se paga. Se piden sólo los tramos
// de `paresDelDia` (rutas.ts) que no estén guardados: caché en memoria por instancia (como
// Odoo en servicio.ts) y persistente en hd_tiempos, por origen/destino redondeados a ~100 m,
// franja de media hora y tipo de día (hábil/sábado/domingo), con vencimiento a los 14 días.
// Un pedido de matriz por franja (Google acepta un solo `departureTime` por pedido) cuando
// la matriz entera son justo los tramos que faltan; si no, un pedido por origen con sus
// destinos (en paralelo): nunca se paga un cruce que nadie usa.
//
// Imports relativos y con extensión (los tests importan el parseo sin Next); Supabase y
// `after` se cargan recién cuando hacen falta.

import type { DiaHoja, TiempoTramo } from "./tipos.ts";
import { paresDelDia, type ParTramo } from "./rutas.ts";
import { claveCache, claveTramo, coordClave, franjaDe, salidaIso, tipoDia, type TipoDia } from "./tiempos.ts";

const URL_MATRIZ = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
/** Cuánto espera la lectura del día a Google. Lo que tarda más llega para la próxima. */
export const TOPE_MS = 2500;
/** Cuánto puede tardar un pedido en segundo plano antes de abandonarlo. */
const ABANDONO_MS = 15_000;
/** Después de un error de Google, cuánto tiempo no se le pide nada. */
const APAGADO_MS = 10 * 60_000;
/** Cuánto vale un tramo guardado. */
export const VIGENCIA_MS = 14 * 24 * 60 * 60_000;
/** Un tramo que no estaba en hd_tiempos no se vuelve a buscar ahí por este rato (lo que escriben otras instancias llega después). */
const RELEER_MS = 10 * 60_000;
/** Cuánto espera una lectura `soloCache` a hd_tiempos (una consulta chica). */
const TOPE_CACHE_MS = 800;
/** Filas por consulta a hd_tiempos: PostgREST corta en 1000 (max_rows). */
const MAX_FILAS = 900;
/** Elementos por pedido (Google acepta hasta 625 con TRAFFIC_AWARE). */
const MAX_ELEMENTOS = 100;

/** La clave: la del servidor si está; si no, la del mapa (que ya está cargada). */
export const claveGoogle = () => process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || null;

// ─── El pedido y la respuesta (puros, con tests) ────────────────────────────

export type Coord = { lat: number; lng: number };

/** El cuerpo de computeRouteMatrix: auto, con tránsito y, si es a futuro, la hora de salida. */
export function cuerpoMatriz(origenes: Coord[], destinos: Coord[], salida: string | null) {
  const wp = (c: Coord) => ({ waypoint: { location: { latLng: { latitude: c.lat, longitude: c.lng } } } });
  return {
    origins: origenes.map(wp),
    destinations: destinos.map(wp),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    ...(salida ? { departureTime: salida } : {}),
  };
}

export type ElementoMatriz = { oi: number; di: number; min: number; m: number | null };

/**
 * La respuesta de computeRouteMatrix (un arreglo de elementos) → los que tienen ruta. En el
 * JSON de Google los valores en cero no vienen (`originIndex` 0 falta). La duración viene
 * como "1234s"; se redondea a minutos (al menos 1).
 */
export function parsearMatriz(json: unknown): ElementoMatriz[] {
  if (!Array.isArray(json)) return [];
  const out: ElementoMatriz[] = [];
  for (const e of json as Record<string, unknown>[]) {
    if (!e || typeof e !== "object") continue;
    const st = e.status as { code?: number } | undefined;
    if (st && st.code) continue;
    if (e.condition && e.condition !== "ROUTE_EXISTS") continue;
    const seg = typeof e.duration === "string" ? Number(e.duration.replace(/s$/, "")) : NaN;
    if (!Number.isFinite(seg) || seg < 0) continue;
    const m = Number(e.distanceMeters);
    out.push({ oi: Number(e.originIndex ?? 0), di: Number(e.destinationIndex ?? 0), min: Math.max(1, Math.round(seg / 60)), m: Number.isFinite(m) ? Math.round(m) : null });
  }
  return out;
}

/** El error de Google en pocas palabras: "403 SERVICE_DISABLED" (para el log). */
export function errorGoogle(status: number, cuerpo: string): string {
  try {
    const j = JSON.parse(cuerpo) as { error?: { status?: string; message?: string; details?: { reason?: string }[] } };
    const razon = j.error?.details?.find((d) => d.reason)?.reason ?? j.error?.status;
    return `${status}${razon ? ` ${razon}` : ""}`;
  } catch {
    return String(status);
  }
}

/** Un pedido de matriz: sus orígenes, sus destinos y bajo qué franja se guarda lo que vuelva. */
export type PedidoMatriz = { franja: number; tipo: TipoDia; salida: string | null; origenes: Coord[]; destinos: Coord[] };

/**
 * Cómo se piden los tramos que faltan: uno por franja y tipo de día (un solo departureTime
 * por pedido). Si la matriz completa (orígenes × destinos) tiene cruces que nadie pidió, o
 * pasa de MAX_ELEMENTOS, un pedido por origen con sus destinos.
 */
export function planDePedidos(faltan: ParTramo[], fecha: string, ahoraMs: number): PedidoMatriz[] {
  const grupos = new Map<string, ParTramo[]>();
  for (const p of faltan) {
    const k = `${franjaDe(p.salida)}|${tipoDia(fecha, p.salida)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const out: PedidoMatriz[] = [];
  for (const ps of grupos.values()) {
    const franja = franjaDe(ps[0].salida);
    const tipo = tipoDia(fecha, ps[0].salida);
    const salida = salidaIso(fecha, ps[0].salida, ahoraMs);
    const unicos = (cs: Coord[]) => [...new Map(cs.map((c) => [coordClave(c.lat, c.lng), c])).values()];
    const O = unicos(ps.map((p) => p.o));
    const D = unicos(ps.map((p) => p.d));
    const tramos = new Set(ps.map((p) => `${coordClave(p.o.lat, p.o.lng)}>${coordClave(p.d.lat, p.d.lng)}`)).size;
    if (O.length * D.length <= Math.min(MAX_ELEMENTOS, tramos)) {
      out.push({ franja, tipo, salida, origenes: O, destinos: D });
      continue;
    }
    for (const o of O) {
      const dests = unicos(ps.filter((p) => coordClave(p.o.lat, p.o.lng) === coordClave(o.lat, o.lng)).map((p) => p.d));
      for (let i = 0; i < dests.length; i += MAX_ELEMENTOS) out.push({ franja, tipo, salida, origenes: [o], destinos: dests.slice(i, i + MAX_ELEMENTOS) });
    }
  }
  return out;
}

// ─── El caché ───────────────────────────────────────────────────────────────

type Guardado = { min: number; m: number | null; at: number };
const memoria = new Map<string, Guardado>();
/** Los tramos que se buscaron en hd_tiempos y no estaban: cuándo (no se insiste por RELEER_MS). */
const buscados = new Map<string, number>();
/** La tabla no existe todavía (migración sin aplicar): no se insiste por un rato. */
let sinTablaHasta = 0;
let apagadoHasta = 0;

const claveDe = (o: Coord, d: Coord, franja: number, tipo: TipoDia) => claveCache(coordClave(o.lat, o.lng), coordClave(d.lat, d.lng), franja, tipo);

function anotar(clave: string, g: Guardado) {
  if (memoria.size > 20_000) memoria.clear();
  memoria.set(clave, g);
}

/** Un tramo como se guarda en hd_tiempos (claves de coordenadas redondeadas). */
export type TramoGuardado = { origen: string; destino: string; franja: number; tipo: TipoDia };
/** Una consulta a hd_tiempos: esa franja y tipo de día, esos orígenes × esos destinos. */
export type LoteLectura = { franja: number; tipo: TipoDia; origenes: string[]; destinos: string[] };

/**
 * Cómo se leen de hd_tiempos SÓLO los tramos del día: por franja y tipo de día, en lotes
 * cuyos orígenes × destinos no pasen `max` filas (PostgREST devuelve como mucho 1000: una
 * consulta sin filtro se cortaba ahí y el resto nunca llegaba a memoria).
 */
export function lotesDeLectura(tramos: TramoGuardado[], max = MAX_FILAS): LoteLectura[] {
  const grupos = new Map<string, TramoGuardado[]>();
  for (const t of tramos) {
    const k = `${t.franja}|${t.tipo}`;
    grupos.set(k, [...(grupos.get(k) ?? []), t]);
  }
  const out: LoteLectura[] = [];
  for (const ts of grupos.values()) {
    let O = new Set<string>(), D = new Set<string>();
    const cerrar = () => { if (O.size) out.push({ franja: ts[0].franja, tipo: ts[0].tipo, origenes: [...O], destinos: [...D] }); O = new Set(); D = new Set(); };
    for (const t of ts) {
      const o = O.size + (O.has(t.origen) ? 0 : 1), d = D.size + (D.has(t.destino) ? 0 : 1);
      if (o * d > max) cerrar();
      O.add(t.origen);
      D.add(t.destino);
    }
    cerrar();
  }
  return out;
}

/**
 * Trae a memoria lo que hd_tiempos tenga (vigente) de estos tramos. Nunca tira; los que no
 * están quedan anotados en `buscados` para no volver a preguntar enseguida.
 */
async function leerGuardados(tramos: TramoGuardado[]): Promise<void> {
  if (!tramos.length || Date.now() < sinTablaHasta) return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    const desde = new Date(Date.now() - VIGENCIA_MS).toISOString();
    const rs = await Promise.all(lotesDeLectura(tramos).map((l) =>
      db.from("hd_tiempos").select("origen, destino, franja, tipo_dia, minutos, metros, actualizado")
        .eq("franja", l.franja).eq("tipo_dia", l.tipo).in("origen", l.origenes).in("destino", l.destinos).gte("actualizado", desde)));
    if (rs.some((r) => r.error)) { sinTablaHasta = Date.now() + RELEER_MS; return; }
    for (const r of rs) {
      for (const f of r.data ?? []) {
        anotar(claveCache(String(f.origen), String(f.destino), Number(f.franja), f.tipo_dia as TipoDia), {
          min: Number(f.minutos), m: f.metros == null ? null : Number(f.metros), at: Date.parse(String(f.actualizado)),
        });
      }
    }
    const ahora = Date.now();
    for (const t of tramos) {
      const k = claveCache(t.origen, t.destino, t.franja, t.tipo);
      if (!memoria.has(k)) buscados.set(k, ahora);
    }
    if (buscados.size > 20_000) buscados.clear();
  } catch {
    sinTablaHasta = Date.now() + RELEER_MS;
  }
}

async function guardarEnBase(filas: { origen: string; destino: string; franja: number; tipo_dia: TipoDia; minutos: number; metros: number | null }[]) {
  if (!filas.length || Date.now() < sinTablaHasta) return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const r = await createAdminClient().from("hd_tiempos").upsert(filas.map((f) => ({ ...f, actualizado: new Date().toISOString() })), { onConflict: "origen,destino,franja,tipo_dia" });
    if (r.error) sinTablaHasta = Date.now() + RELEER_MS;
  } catch {
    sinTablaHasta = Date.now() + RELEER_MS;
  }
}

/** Que lo que llega después de la respuesta se termine de guardar (Vercel corta la función si no). */
async function despues(p: Promise<unknown>) {
  try {
    const { after } = await import("next/server");
    after(() => p);
  } catch {
    // Fuera de un pedido (un script): la promesa sigue sola.
  }
}

// ─── Google ─────────────────────────────────────────────────────────────────

async function pedir(clave: string, p: PedidoMatriz): Promise<void> {
  const r = await fetch(URL_MATRIZ, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": clave,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
    },
    body: JSON.stringify(cuerpoMatriz(p.origenes, p.destinos, p.salida)),
    cache: "no-store",
    signal: AbortSignal.timeout(ABANDONO_MS),
  });
  if (!r.ok) {
    const e = errorGoogle(r.status, await r.text().catch(() => ""));
    if (Date.now() >= apagadoHasta) console.warn(`[hoja-dia] Routes API: ${e}. Van las duraciones típicas; no se pide de nuevo por 10 min.`);
    apagadoHasta = Date.now() + APAGADO_MS;
    return;
  }
  const filas = [];
  const at = Date.now();
  for (const e of parsearMatriz(await r.json())) {
    const o = p.origenes[e.oi];
    const d = p.destinos[e.di];
    if (!o || !d) continue;
    anotar(claveDe(o, d, p.franja, p.tipo), { min: e.min, m: e.m, at });
    filas.push({ origen: coordClave(o.lat, o.lng), destino: coordClave(d.lat, d.lng), franja: p.franja, tipo_dia: p.tipo, minutos: e.min, metros: e.m });
  }
  await guardarEnBase(filas);
}

export type OpcionesTiempos = {
  /** Cuánto se espera a Google (y a hd_tiempos) como mucho. */
  topeMs?: number;
  /** Sólo lo que ya está en memoria y en hd_tiempos: no se le pide nada a Google (gestos, envíos, el celular). */
  soloCache?: boolean;
};

/**
 * Los tiempos de Google de los tramos que usa el día (`DiaHoja.tiempos`). Lo guardado (en
 * memoria o en hd_tiempos) sale al instante; lo que falta, salvo con `soloCache`, se pide y
 * se espera como mucho `topeMs`. Nunca tira: sin nada, devuelve {} y estado.ts usa las
 * duraciones típicas.
 */
export async function tiemposDelDia(dia: DiaHoja, op: OpcionesTiempos = {}): Promise<Record<string, TiempoTramo>> {
  const topeMs = op.topeMs ?? TOPE_MS;
  try {
    const clave = claveGoogle();
    if (!clave) return {};
    // Sobre una copia: estado.ts guarda sus cuentas por objeto, y `dia` todavía no tiene los tiempos.
    const pares = paresDelDia({ ...dia, tiempos: undefined });
    if (!pares.length) return {};
    const inicio = Date.now();

    // Lo que no está en memoria se busca en hd_tiempos (sólo esos tramos).
    const ahora = Date.now();
    const aBuscar: TramoGuardado[] = [];
    for (const p of pares) {
      const t = { origen: coordClave(p.o.lat, p.o.lng), destino: coordClave(p.d.lat, p.d.lng), franja: franjaDe(p.salida), tipo: tipoDia(dia.fecha, p.salida) };
      const k = claveCache(t.origen, t.destino, t.franja, t.tipo);
      const g = memoria.get(k);
      if (g && ahora - g.at < VIGENCIA_MS) continue;
      if (ahora - (buscados.get(k) ?? -Infinity) < RELEER_MS) continue;
      aBuscar.push(t);
    }
    if (aBuscar.length) await conTope(leerGuardados(aBuscar), op.soloCache ? Math.min(topeMs, TOPE_CACHE_MS) : topeMs);

    const leer = (out: Record<string, TiempoTramo>) => {
      const faltan: ParTramo[] = [];
      for (const p of pares) {
        const g = memoria.get(claveDe(p.o, p.d, franjaDe(p.salida), tipoDia(dia.fecha, p.salida)));
        if (g && Date.now() - g.at < VIGENCIA_MS) out[claveTramo(p.desde, p.hacia)] = { min: g.min, m: g.m, fuente: "google" };
        else faltan.push(p);
      }
      return faltan;
    };
    const out: Record<string, TiempoTramo> = {};
    const faltan = leer(out);
    if (op.soloCache || !faltan.length || Date.now() < apagadoHasta) return out;

    const todo = Promise.all(planDePedidos(faltan, dia.fecha, Date.now()).map((p) => pedir(clave, p).catch(() => {
      // Red caída o abandono: la próxima lectura vuelve a probar.
    })));
    void despues(todo);
    const resto = topeMs - (Date.now() - inicio);
    if (resto > 0 && (await conTope(todo.then(() => true), resto))) leer(out);
    return out;
  } catch {
    return {};
  }
}

/** Espera `p` como mucho `ms`; true si terminó a tiempo. Nunca tira. */
function conTope(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(false), ms);
    p.then(() => { clearTimeout(t); ok(true); }, () => { clearTimeout(t); ok(false); });
  });
}

/** Para los tests: vacía el caché y el corte. */
export function _reiniciarCache() {
  memoria.clear();
  buscados.clear();
  sinTablaHasta = 0;
  apagadoHasta = 0;
}
