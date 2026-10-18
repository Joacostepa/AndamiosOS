// Días hábiles y la hora de Argentina, para las reglas de guardias y comodines.
//
// "DÍA HÁBIL" ACÁ ES DE LUNES A SÁBADO SIN FERIADOS. El sábado se trabaja como un día más
// (guardias-datos.md §1) y el domingo no. Es DISTINTO de siguienteDiaLaboral (bloques.ts),
// que sólo saltea el domingo y trata el feriado como hábil: ésa es la regla del reparto de
// una obra de varias jornadas y la decisión de feriados/argentina.ts ("el feriado es sólo una
// marca visual"). Las guardias sí miran el feriado —nunca van en uno— y los plazos ("3 días
// hábiles", "7 días hábiles esperando") tampoco lo cuentan.
//
// LOS FERIADOS ENTRAN POR PARÁMETRO, como un Set de "yyyy-MM-dd": este archivo es puro (se
// prueba con node --test, sin red). Quien llama los trae con feriadosDelRango() en el
// servidor o con useFeriados() en el tablero.
//
// LA HORA ES LA DE BUENOS AIRES SIN HORARIO DE VERANO (UTC−3 fijo). Argentina no lo usa desde
// 2009; si volviera, el único lugar que hay que tocar es OFFSET_BA.

import { addDays, format, parseISO } from "date-fns";

export type Feriados = ReadonlySet<string>;

/** Argentina, en horas respecto de UTC. */
const OFFSET_BA = -3;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function diaIso(fecha: string): number {
  const d = parseISO(fecha).getDay();
  return d === 0 ? 7 : d;
}

export function esDiaHabil(fecha: string, feriados: Feriados): boolean {
  return diaIso(fecha) !== 7 && !feriados.has(fecha);
}

export function sumarDias(fecha: string, n: number): string {
  return iso(addDays(parseISO(fecha), n));
}

/** El lunes de la semana de `fecha` (el domingo pertenece a la semana que termina). */
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -(diaIso(fecha) - 1));
}

/** El día de esa semana con ese número ISO (1 = lunes … 6 = sábado). */
export function diaDeSemana(lunes: string, iso: number): string {
  return sumarDias(lunes, iso - 1);
}

/** El primer día hábil DESPUÉS de `fecha`. */
export function siguienteDiaHabil(fecha: string, feriados: Feriados): string {
  let f = sumarDias(fecha, 1);
  // Un tope de cinturón: no hay año con un mes de feriados seguidos.
  for (let i = 0; i < 31 && !esDiaHabil(f, feriados); i++) f = sumarDias(f, 1);
  return f;
}

/** El último día hábil ANTES de `fecha`. */
export function anteriorDiaHabil(fecha: string, feriados: Feriados): string {
  let f = sumarDias(fecha, -1);
  for (let i = 0; i < 31 && !esDiaHabil(f, feriados); i++) f = sumarDias(f, -1);
  return f;
}

/**
 * Cuántos días hábiles hay DESPUÉS de `desde` y hasta `hasta` inclusive. 0 si `hasta` no es
 * posterior. Es la cuenta de "hace cuántos días hábiles": una OT creada hoy lleva 0; creada
 * el jueves, el lunes lleva 3 (viernes, sábado, lunes).
 */
export function diasHabilesEntre(desde: string, hasta: string, feriados: Feriados): number {
  if (hasta <= desde) return 0;
  let n = 0;
  for (let f = sumarDias(desde, 1); f <= hasta; f = sumarDias(f, 1)) {
    if (esDiaHabil(f, feriados)) n++;
  }
  return n;
}

/** Los próximos `n` días hábiles desde `fecha` INCLUSIVE (si `fecha` es hábil, es el primero). */
export function proximosDiasHabiles(fecha: string, n: number, feriados: Feriados): string[] {
  const dias: string[] = [];
  let f = fecha;
  for (let i = 0; dias.length < n && i < n * 3 + 31; i++) {
    if (esDiaHabil(f, feriados)) dias.push(f);
    f = sumarDias(f, 1);
  }
  return dias;
}

/** La fecha de hoy en Buenos Aires, para un instante dado (ISO o Date). */
export function hoyBA(ahora: Date | string = new Date()): string {
  const ms = (typeof ahora === "string" ? new Date(ahora) : ahora).getTime();
  return new Date(ms + OFFSET_BA * 3_600_000).toISOString().slice(0, 10);
}

/** El instante (ISO UTC) de "esa fecha a esa hora de Buenos Aires". */
export function instanteBA(fecha: string, hora: number): string {
  // 13 h de acá = 16 UTC.
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + (hora - OFFSET_BA) * 3_600_000).toISOString();
}

/**
 * La fecha de Buenos Aires de un `create_date` de Odoo. Odoo lo guarda en UTC y lo devuelve
 * como "2026-10-15 23:30:00" (sin zona): a las 23:30 UTC acá todavía es el 15 a las 20:30.
 * Acepta también un ISO con zona.
 */
export function fechaBADeOdoo(valor: string): string {
  const conZona = /[zZ]|[+-]\d{2}:?\d{2}$/.test(valor) ? valor : `${valor.replace(" ", "T")}Z`;
  return hoyBA(conZona);
}
