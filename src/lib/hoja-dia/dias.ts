// Qué día se mira en la Hoja del día (puro: lo usan el encabezado y los tests).
//
// - "Hoy" es la fecha de Buenos Aires (UTC−3 todo el año, como el resto del módulo).
// - Abre en "Hoy" a la mañana y en "Mañana" desde el corte (15:00 por defecto, el mismo
//   `horaCorteManana` de los parámetros).
// - El domingo es un día más (10/10, el dueño: "a veces trabajamos el domingo"). El tablero
//   lo habilita cuando hay obras; la hoja no lo saltea: el sábado, "Mañana" es el domingo, y
//   las flechas ‹ › pasan por él. Si ese domingo no hay obras, la hoja lo dice.

import type { Fecha } from "./tipos";

const MS_DIA = 86_400_000;
const OFFSET_BA = -3 * 3_600_000;

/** La fecha de hoy en Buenos Aires ("2026-10-13"). */
export function hoyBA(ahoraMs: number = Date.now()): Fecha {
  return new Date(ahoraMs + OFFSET_BA).toISOString().slice(0, 10);
}

/** Minutos desde las 0:00 de hoy en Buenos Aires. */
export function minutosDeHoyBA(ahoraMs: number = Date.now()): number {
  const t = ahoraMs + OFFSET_BA;
  return Math.floor((((t % MS_DIA) + MS_DIA) % MS_DIA) / 60_000);
}

const diaSem = (f: Fecha) => new Date(`${f}T12:00:00Z`).getUTCDay();
function sumar(f: Fecha, n: number): Fecha {
  const t = new Date(`${f}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** El día `n` lugares para adelante (o para atrás si n < 0). Incluye el domingo. */
export function diaHabil(fecha: Fecha, n: number): Fecha {
  return sumar(fecha, n);
}

/** "Mañana" vista desde `hoy` (el sábado, el domingo). */
export const mananaDe = (hoy: Fecha) => diaHabil(hoy, 1);

/** ¿Es domingo? (para avisar cuando el tablero no tiene obras ese día). */
export const esDomingo = (f: Fecha) => diaSem(f) === 0;

/** El día con el que abre la hoja: hoy hasta el corte, mañana desde el corte. */
export function diaPorDefecto(ahoraMs: number = Date.now(), corteMin = 15 * 60): Fecha {
  const hoy = hoyBA(ahoraMs);
  return minutosDeHoyBA(ahoraMs) >= corteMin ? mananaDe(hoy) : hoy;
}

/** ¿Es una fecha válida "YYYY-MM-DD"? (lo que viene en `?dia=`). */
export function esFecha(s: string | null | undefined): s is Fecha {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
}

/**
 * ¿Los rojos de este día van a la campanita? (I7) `ahora` en minutos desde las 0:00 del día
 * de la hoja. Sí mientras se puede hacer algo: desde tres días antes (el sábado ya se arma
 * el lunes) hasta que termina. Un día pasado, no: mirarlo no crea alertas.
 */
export const diaAlertable = (ahora: number): boolean => ahora >= -3 * 1440 && ahora < 1440;
