// Constantes y helpers puros de la jornada de trabajo (07:00–17:00, almuerzo 12–13, 8h netas).

export const JORNADA_INICIO = "07:00";
export const JORNADA_FIN = "17:00";
export const ALMUERZO_DESDE = "12:00";
export const ALMUERZO_HASTA = "13:00";
export const HORAS_NETAS = 8;

// "HH:MM" → minutos desde medianoche.
export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}

// minutos → "HH:MM".
export function aHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Duración en horas entre dos "HH:MM" (puede ser decimal, ej 3.5).
export function duracionHoras(desde: string, hasta: string): number {
  return Math.max(0, (aMinutos(hasta) - aMinutos(desde)) / 60);
}

export type Franja = { desde: string; hasta: string };

// Regla del spec: se pisan si a.desde < b.hasta && a.hasta > b.desde.
export function franjasSuperpuestas(a: Franja, b: Franja): boolean {
  return aMinutos(a.desde) < aMinutos(b.hasta) && aMinutos(a.hasta) > aMinutos(b.desde);
}

// ¿La franja nueva se pisa con alguna de las existentes?
export function haySuperposicion(nueva: Franja, existentes: Franja[]): boolean {
  return existentes.some((f) => franjasSuperpuestas(nueva, f));
}

// Posición de una hora en la barra visual de jornada (07:00 = 0%, 17:00 = 100%).
export function posicionPct(hhmm: string): number {
  const ini = aMinutos(JORNADA_INICIO);
  const fin = aMinutos(JORNADA_FIN);
  const v = aMinutos(hhmm);
  return Math.min(100, Math.max(0, ((v - ini) / (fin - ini)) * 100));
}

// Ancho de un bloque de N horas como % de la barra de jornada.
export function anchoPct(horas: number): number {
  const totalHoras = (aMinutos(JORNADA_FIN) - aMinutos(JORNADA_INICIO)) / 60; // 10h reloj
  return Math.min(100, Math.max(0, (horas / totalHoras) * 100));
}

// Capacidad de una cuadrilla en un día: ocupadas (asignaciones) + bloqueadas.
export function capacidadCuadrilla(
  horasAsignadas: number[],
  bloqueos: Franja[],
): { ocupadas: number; bloqueadas: number; disponibles: number; pct: number } {
  const ocupadas = horasAsignadas.reduce((s, h) => s + h, 0);
  const bloqueadas = bloqueos.reduce((s, b) => s + duracionHoras(b.desde, b.hasta), 0);
  const disponibles = HORAS_NETAS - ocupadas - bloqueadas;
  const pct = Math.round(((ocupadas + bloqueadas) / HORAS_NETAS) * 100);
  return { ocupadas, bloqueadas, disponibles, pct };
}

// Capacidad de un camión: suma de las franjas de sus viajes (sobre 8h netas).
export function capacidadCamion(viajes: Franja[]): {
  ocupadas: number;
  disponibles: number;
  pct: number;
} {
  const ocupadas = viajes.reduce((s, v) => s + duracionHoras(v.desde, v.hasta), 0);
  const disponibles = HORAS_NETAS - ocupadas;
  const pct = Math.round((ocupadas / HORAS_NETAS) * 100);
  return { ocupadas, disponibles, pct };
}

// Duración total de la OT expresada en días (8h netas por día).
export function otDuracionDias(horasEstimadas: number | null | undefined): number | null {
  if (!horasEstimadas || horasEstimadas <= 0) return null;
  return Math.ceil(horasEstimadas / HORAS_NETAS);
}

// MEJORA — encadenar hora de inicio: sugiere el inicio de una nueva jornada en la
// cuadrilla a partir de las horas ya asignadas ese día, salteando el almuerzo.
export function sugerirHoraInicio(horasYaAsignadas: number): string {
  let min = aMinutos(JORNADA_INICIO) + horasYaAsignadas * 60;
  // Si cae dentro del almuerzo, empujar a las 13:00.
  if (min >= aMinutos(ALMUERZO_DESDE) && min < aMinutos(ALMUERZO_HASTA)) {
    min = aMinutos(ALMUERZO_HASTA);
  } else if (min > aMinutos(ALMUERZO_DESDE)) {
    // Ya pasó el mediodía: sumar la hora de almuerzo al desplazamiento.
    min += 60;
  }
  return aHHMM(Math.min(min, aMinutos(JORNADA_FIN)));
}
