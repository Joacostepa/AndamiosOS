// Reglas puras de la caché de Dirección (las usa cache.ts; acá para poder testearlas sin Next).

import type { PantallaId } from "./tipos.ts";
import { PANTALLAS_IDS } from "./tipos.ts";

/** Cuánto vive el cálculo en vivo de una pantalla. */
export const TTL_PANTALLA_S = 10 * 60;
/** "Actualizar ahora": como mucho una vez cada 5 minutos por usuario y pantalla. */
export const ESPERA_ACTUALIZAR_MS = 5 * 60 * 1000;

export const tagPantalla = (p: PantallaId): string => `direccion:${p}`;
export const TAG_DOLAR = "direccion:dolar";

/**
 * Qué tags invalida "Actualizar ahora" en una pantalla. La semana arma sus cifras con las
 * de las otras pantallas: actualizarla las relee todas. Actualizar cualquier otra también
 * invalida La semana, para que no muestre una cifra distinta de la del detalle.
 */
export function tagsAInvalidar(p: PantallaId): string[] {
  if (p === "semana") return [...PANTALLAS_IDS.map(tagPantalla), TAG_DOLAR];
  return [tagPantalla(p), tagPantalla("semana")];
}

/** ¿Puede actualizar? Con la última vez (ms) que lo hizo, o null si nunca. */
export function puedeActualizar(ultimaMs: number | null, ahoraMs: number): { ok: true } | { ok: false; esperarSeg: number; mensaje: string } {
  if (ultimaMs == null || ahoraMs - ultimaMs >= ESPERA_ACTUALIZAR_MS) return { ok: true };
  const esperarSeg = Math.ceil((ESPERA_ACTUALIZAR_MS - (ahoraMs - ultimaMs)) / 1000);
  const min = Math.ceil(esperarSeg / 60);
  return {
    ok: false,
    esperarSeg,
    mensaje: `Ya se actualizó hace un momento. Podés volver a pedirlo en ${min === 1 ? "1 minuto" : `${min} minutos`}.`,
  };
}

/** La clave de caché de unos parámetros (orden estable, sin vacíos). */
export function claveParams(params: Record<string, string | undefined> = {}): string {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}
