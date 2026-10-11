// Los tiempos de manejo de Google en la cuenta de los camiones, y las claves del caché.
//
// PURO y SIN estado.ts (estado.ts importa de acá: `durDe` y compañía). El servidor
// (rutas-servidor.ts) pide los tramos a la Routes API y los deja en `DiaHoja.tiempos`;
// estado.ts los usa cuando están y, si no, las duraciones típicas de siempre. Así la cuenta
// sigue siendo una sola, la misma en el navegador y en el servidor (decisión 2).
//
// CÓMO ENTRA UN TRAMO EN LA DURACIÓN DE UN VIAJE. Una duración típica es "manejar + lo que
// se hace en la parada" todo junto (lleva 45, busca 30…). Con el tramo real:
// - si la hora del viaje es cuándo SALE (las estimadas y el "lleva", que sale del encuentro):
//   duración = manejo real + la parada;
// - si la hora es cuándo tiene que ESTAR (una fija que no es "lleva": busca, turno de VTV,
//   horario prometido): el manejo va ANTES de la hora (llega = libre + manejo, y si no da,
//   el aviso de choque) y la duración es sólo la parada.
//
// Imports relativos y con extensión: este archivo corre en `node --test` sin Next.

import type { Fecha, Minutos, TiempoTramo, TipoViaje } from "./tipos.ts";

/** "o:12>l:abc": la clave de un tramo en `DiaHoja.tiempos`. */
export const claveTramo = (desdeKey: string, haciaKey: string) => `${desdeKey}>${haciaKey}`;

/**
 * Lo que se hace en la parada, sin manejar (minutos). Las típicas de la maqueta menos un
 * manejo típico; "busca" y "trae" quedan con lo que tarda subir gente o cargar.
 */
export const PARADA_MIN: Record<TipoViaje, number> = {
  lleva: 10, busca: 10, mueve: 10, lleva_material: 30, trae_material: 30,
  compra: 30, entre_depositos: 30, taller: 60, otro: 30,
};

/** ¿La hora del viaje es cuándo tiene que estar ahí (y no cuándo sale)? */
export const esHoraDeLlegada = (tipo: TipoViaje, fija: boolean) => fija && tipo !== "lleva";

type Tiempos = Record<string, TiempoTramo> | null | undefined;

/** El tramo de Google, si lo hay (de un lugar a sí mismo no hay tramo). */
export function tramoGoogle(tiempos: Tiempos, desdeKey: string, haciaKey: string): TiempoTramo | null {
  if (!tiempos || !desdeKey || !haciaKey || desdeKey === haciaKey) return null;
  const t = tiempos[claveTramo(desdeKey, haciaKey)];
  return t && t.fuente === "google" && Number.isFinite(t.min) ? t : null;
}

/** La duración de un viaje con el tramo real; null = no hay tramo (va la típica). */
export function durConTramo(tiempos: Tiempos, tipo: TipoViaje, fija: boolean, desdeKey: string, haciaKey: string): number | null {
  const t = tramoGoogle(tiempos, desdeKey, haciaKey);
  if (!t) return null;
  return esHoraDeLlegada(tipo, fija) ? PARADA_MIN[tipo] : t.min + PARADA_MIN[tipo];
}

/** Cuándo llega a un viaje de hora fija si queda libre a `libre` (con el tramo real, si lo hay). */
export function llegadaCon(tiempos: Tiempos, tipo: TipoViaje, fija: boolean, desdeKey: string, haciaKey: string, libre: Minutos): Minutos {
  const t = esHoraDeLlegada(tipo, fija) ? tramoGoogle(tiempos, desdeKey, haciaKey) : null;
  return t ? libre + t.min : libre;
}

/** La vuelta al depósito con el tramo real; null = la del parámetro. */
export const vueltaCon = (tiempos: Tiempos, haciaKey: string, depKey: string): number | null =>
  tramoGoogle(tiempos, haciaKey, depKey)?.min ?? null;

/**
 * Un hueco entre dos viajes sirve para otro si es de al menos `param` minutos (45) y, con el
 * tramo real, si alcanza por lo menos para llegar a lo que sigue.
 */
export const huecoMinimo = (tiempos: Tiempos, desdeKey: string, haciaKey: string, param: number) =>
  Math.max(param, tramoGoogle(tiempos, desdeKey, haciaKey)?.min ?? 0);

// ─── Cómo se dice ───────────────────────────────────────────────────────────

/** 35 → "35 min"; 70 → "1 h 10"; 60 → "1 h". */
export function minTxt(m: number): string {
  const r = Math.max(1, Math.round(m));
  if (r < 60) return `${r} min`;
  return `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60}` : ""}`;
}
/** "~35 min en auto" (Google) o "~45 min" (la duración típica del viaje, con la parada). */
export const tiempoTxt = (t: TiempoTramo) => (t.fuente === "google" ? `~${minTxt(t.min)} en auto` : `~${minTxt(t.min)}`);
/** El `title` del ícono: de dónde sale el número. */
export const tiempoTitulo = (t: TiempoTramo) =>
  t.fuente === "google"
    ? `Manejando, según Google Maps con el tránsito de esa hora${t.m != null ? ` (${(t.m / 1000).toFixed(1).replace(".", ",")} km)` : ""}`
    : "Duración típica del viaje (parámetro de la hoja): todavía sin el tiempo de Google para este tramo";

// ─── Las claves del caché (memoria y hd_tiempos) ────────────────────────────

/** -34.60351, -58.38157 → "-34.604,-58.382": redondeado a ~100 m. */
export const coordClave = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

/** La franja de media hora (0, 30, …, 1410) de un instante del día de la hoja. */
export function franjaDe(min: Minutos): number {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return Math.floor(m / 30) * 30;
}

export type TipoDia = "habil" | "sabado" | "domingo";

/** Hábil, sábado o domingo de un instante (minutos desde las 0:00 de `fecha`; −60 es el día anterior). */
export function tipoDia(fecha: Fecha, min: Minutos = 0): TipoDia {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(min / 1440));
  const w = d.getUTCDay();
  return w === 0 ? "domingo" : w === 6 ? "sabado" : "habil";
}

/** La clave de un tramo en el caché: "-34.604,-58.382|-34.590,-58.420|450|habil". */
export const claveCache = (origen: string, destino: string, franja: number, tipo: TipoDia) => `${origen}|${destino}|${franja}|${tipo}`;

/**
 * El `departureTime` de la Routes API para un tramo que sale a `min` (minutos de la hoja,
 * Buenos Aires UTC−3): la mitad de su franja, en ISO. null si ya pasó (Google no acepta
 * salidas en el pasado: va sin departureTime, con el tránsito de ahora).
 */
export function salidaIso(fecha: Fecha, min: Minutos, ahoraMs: number): string | null {
  const medio = Math.floor(min / 1440) * 1440 + franjaDe(min) + 15;
  const ms = Date.parse(`${fecha}T00:00:00-03:00`) + medio * 60_000;
  return ms > ahoraMs + 60_000 ? new Date(ms).toISOString() : null;
}
