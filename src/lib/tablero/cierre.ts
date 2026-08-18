// Qué ofrece la tarjeta según el estado de cierre de sus jornadas.
//
// REGLA DE NEGOCIO: el parte se crea SOLO manualmente y solo desde una fecha que ya
// llegó. La planificación es un borrador que se mueve: crear partes por adelantado deja
// registros huérfanos cuando algo se reprograma.
//
// Un bloque multi-jornada tiene un parte POR DÍA. Cerrar el día 3 de una obra de 4 no
// toca a los otros tres.

import type { Bloque } from "./bloques";

export type AccionCierre =
  | { tipo: "cerrar"; asignacionId: number; fecha: string }
  | { tipo: "ver"; parteId: number; asignacionId: number; fecha: string }
  | null;

/**
 * Primera jornada del bloque que ya ocurrió y sigue abierta. Si están todas cerradas,
 * devuelve la última para poder ver su parte. Si ninguna llegó todavía, no hay acción.
 */
export function accionDeCierre(bloque: Bloque, hoy: string): AccionCierre {
  const pasadas = bloque.fechas
    .map((fecha, i) => ({ fecha, i }))
    .filter(({ fecha }) => fecha <= hoy);
  if (pasadas.length === 0) return null;

  const abierta = pasadas.find(({ i }) => bloque.partes[i] == null);
  if (abierta) {
    return { tipo: "cerrar", asignacionId: bloque.ids[abierta.i], fecha: abierta.fecha };
  }

  const ultima = pasadas[pasadas.length - 1];
  const parteId = bloque.partes[ultima.i];
  return parteId == null
    ? null
    : { tipo: "ver", parteId, asignacionId: bloque.ids[ultima.i], fecha: ultima.fecha };
}

/** ¿Cuántas jornadas del bloque tienen parte cargado? */
export function jornadasCerradas(bloque: Bloque): number {
  return bloque.partes.filter((p) => p != null).length;
}

/**
 * Ids de las jornadas del bloque que se pueden liberar: las que NO tienen parte.
 *
 * Una obra que se arranca y se suspende sin fecha de vuelta libera lo que queda por
 * ejecutar y conserva lo hecho. Borrar también las cerradas dejaría los partes
 * huérfanos y haría que la obra vuelva a la bandeja como si nunca se hubiera empezado.
 */
export function jornadasLiberables(bloque: Bloque): number[] {
  return bloque.ids.filter((_, i) => bloque.partes[i] == null);
}

/** El bloque se considera cerrado cuando TODAS sus jornadas tienen parte. */
export function bloqueCerrado(bloque: Bloque): boolean {
  return bloque.partes.length > 0 && bloque.partes.every((p) => p != null);
}
