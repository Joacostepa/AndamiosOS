// Los recorridos del día: qué tramos hay que pedirle a Google (sólo los que se usan) y los
// links a Maps de cada viaje, de cada camión y del chofer.
//
// PURO (usa estado.ts): lo usan el servidor (rutas-servidor.ts arma `DiaHoja.tiempos` con
// `paresDelDia`), el celular (vista.ts) y la pantalla de Camiones.
//
// QUÉ TRAMOS. Los que entran en una cuenta y nada más (cada uno es un "elemento" que se
// paga): las paradas seguidas de cada camión (calcVeh) y su vuelta al depósito cuando se
// estima (con la llegada cargada a mano no hace falta), y por cada cuadrilla que trabaja,
// una obra → la siguiente (el manejo entre obras de la tarjeta). Ir del depósito a la
// primera obra ya es la parada del "lleva" del camión; volver de la última no lo usa nadie.
// Sin repetir, y sólo si los dos puntos tienen coordenadas.
//
// Imports relativos y con extensión: este archivo corre en `node --test` sin Next.

import type { DiaHoja, Minutos, TiempoTramo } from "./tipos.ts";
import {
  calcVeh, cuadrillasActivas, filasCamiones, llegadaCargada, lugarDeKey, obrasCon, viajesChofer, type ViajeCalc,
} from "./estado.ts";
import { claveTramo, esHoraDeLlegada, tramoGoogle } from "./tiempos.ts";
import { urlComoLlegar, urlRecorrido, type PuntoMaps } from "./maps.ts";

/** Un tramo para pedir: claves de lugar, coordenadas y a qué hora sale (minutos de la hoja). */
export type ParTramo = {
  desde: string;
  hacia: string;
  o: { lat: number; lng: number };
  d: { lat: number; lng: number };
  salida: Minutos;
};

/** Manejo que se supone antes de una hora de llegada, sólo para elegir la franja del tránsito. */
const MANEJO_SUPUESTO = 30;

/** La clave del depósito tal como la usa estado.ts ("l:<id>" o "dep" si no está cargado). */
export function depKeyDe(dia: DiaHoja): string {
  const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo);
  return dep ? `l:${dep.id}` : "dep";
}

/** ¿Falta ubicar el depósito? (sin él, ningún tramo que sale o vuelve ahí tiene tiempo real). */
export function depositoSinUbicar(dia: DiaHoja): boolean {
  const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo);
  return !dep || dep.lat == null || dep.lng == null;
}

/** Los tramos que se usan ese día, sin repetir (el primero que aparece manda la hora). */
export function paresDelDia(dia: DiaHoja): ParTramo[] {
  const out = new Map<string, ParTramo>();
  const sumar = (desde: string, hacia: string, salida: Minutos) => {
    if (!desde || !hacia || desde === hacia) return;
    const k = claveTramo(desde, hacia);
    if (out.has(k)) return;
    const a = lugarDeKey(dia, desde);
    const b = lugarDeKey(dia, hacia);
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return;
    out.set(k, { desde, hacia, o: { lat: a.lat, lng: a.lng }, d: { lat: b.lat, lng: b.lng }, salida });
  };
  const dep = depKeyDe(dia);

  // Los camiones: cada parada desde la anterior y la vuelta al depósito (si no tiene la
  // llegada cargada: conVuelta no la usa). Lo hecho ya no cambia ninguna hora (cuenta la
  // hora de "Hecho"), salvo su vuelta.
  for (const veh of filasCamiones(dia)) {
    for (const v of calcVeh(dia, veh)) {
      if (v.estado === "planeado") sumar(v.desdeKey, v.haciaKey, esHoraDeLlegada(v.tipo, !!v.hora) ? v.t - MANEJO_SUPUESTO : v.t);
      if (v.vuelta && v.estado !== "no_pudo" && llegadaCargada(v, v.finParada) == null) sumar(v.haciaKey, dep, v.finParada);
    }
  }

  // Las cuadrillas: pasar de una obra a otra (la tarjeta muestra ese manejo).
  for (const c of cuadrillasActivas(dia)) {
    const ob = obrasCon(dia, c);
    const k = (otId: number) => `o:${otId}`;
    for (let i = 1; i < ob.length; i++) sumar(k(ob[i - 1].o.otId), k(ob[i].o.otId), ob[i - 1].fin);
  }
  return [...out.values()];
}

// ─── Lo que se muestra ──────────────────────────────────────────────────────

/** El tramo real entre dos lugares (null si Google no lo calculó). */
export const tramoEntre = (dia: DiaHoja, desdeKey: string, haciaKey: string): TiempoTramo | null =>
  tramoGoogle(dia.tiempos, desdeKey, haciaKey);

/**
 * El tiempo de un viaje para mostrar al lado de la hora: el manejo de Google si lo hay, si
 * no la duración típica del viaje (con la parada). null si no se sabe de dónde sale.
 */
export function tramoDe(dia: DiaHoja, v: ViajeCalc): TiempoTramo | null {
  if (!v.desdeKey) return null;
  return tramoEntre(dia, v.desdeKey, v.haciaKey) ?? (v.dur > 0 ? { min: v.dur, m: null, fuente: "tipica" } : null);
}

/** Un lugar como punto de Maps: coordenadas, dirección o el texto escrito. El depósito sin dirección no se ubica. */
export function puntoDeKey(dia: DiaHoja, key: string): PuntoMaps | null {
  if (!key) return null;
  const l = lugarDeKey(dia, key);
  if (l.lat != null && l.lng != null) return { lat: l.lat, lng: l.lng, dir: l.dir };
  if (l.dir) return { lat: null, lng: null, dir: l.dir };
  if (l.tipo === "deposito" || l.n === "—") return null;
  return { lat: null, lng: null, dir: l.n };
}

/** "Cómo llegar" a un viaje desde donde sale (el menú del viaje en Camiones). */
export const comoLlegarViaje = (dia: DiaHoja, v: ViajeCalc): string | null =>
  urlComoLlegar(puntoDeKey(dia, v.haciaKey), puntoDeKey(dia, v.desdeKey));

/**
 * El recorrido de una lista de viajes en orden: de dónde sale el primero que falta, cada
 * destino y, si el último vuelve, el depósito. Si ya no falta ninguno, el del día entero.
 */
function recorrido(dia: DiaHoja, vs: ViajeCalc[]): string | null {
  const vivos = vs.filter((v) => v.estado !== "anulado");
  const pend = vivos.filter((v) => v.estado === "planeado");
  const usa = pend.length ? pend : vivos;
  if (!usa.length) return null;
  const ult = usa[usa.length - 1];
  return urlRecorrido([
    puntoDeKey(dia, usa[0].desdeKey),
    ...usa.map((v) => puntoDeKey(dia, v.haciaKey)),
    ...(ult.vuelta ? [puntoDeKey(dia, depKeyDe(dia))] : []),
  ]);
}

/** "Ver el recorrido en Maps" del chofer (su celular y el botón de Telegram). */
export const recorridoChofer = (dia: DiaHoja, ch: string): string | null => recorrido(dia, viajesChofer(dia, ch));
/** El recorrido de un camión (el menú de la fila en Camiones). */
export const recorridoCamion = (dia: DiaHoja, veh: string): string | null => recorrido(dia, calcVeh(dia, veh));
