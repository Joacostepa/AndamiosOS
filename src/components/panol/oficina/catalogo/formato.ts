// Fechas y textos cortos de la oficina del pañol. Todo en hora de Buenos Aires: un retiro
// de las 22 h es de "hoy" para quien lo mira acá, no de mañana en UTC.

import { diasEntre, hoyBA } from "@/lib/panol/estado";

const HORA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
const DIA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
const DIA_ANIO = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

/** "hoy 09:12" · "ayer 16:10" · "08/10 07:05" · "08/10/2025" (otro año). */
export function cuando(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const hoy = hoyBA(ahora);
  const dia = hoyBA(d);
  const dif = diasEntre(dia, hoy);
  if (dif === 0) return `hoy ${HORA.format(d)}`;
  if (dif === 1) return `ayer ${HORA.format(d)}`;
  if (dia.slice(0, 4) !== hoy.slice(0, 4)) return DIA_ANIO.format(d);
  return `${DIA.format(d)} ${HORA.format(d)}`;
}

/** "08/10/2026" para una fecha YYYY-MM-DD (sin hora). */
export function fecha(f: string | null | undefined): string {
  if (!f) return "—";
  const [a, m, d] = f.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "hace 3 días" / "hoy" desde una fecha ISO. */
export function haceDias(iso: string, ahora: Date = new Date()): string {
  const n = diasEntre(hoyBA(new Date(iso)), hoyBA(ahora));
  if (n <= 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} días`;
}

/** Número de un string de formulario ("1.234,5" o "1234.5"); null si está vacío o no es número. */
export function numero(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export const UNIDADES_RETIRO = [
  { valor: "u.", texto: "unidad" },
  { valor: "m", texto: "metro" },
  { valor: "rollo", texto: "rollo" },
  { valor: "par", texto: "par" },
  { valor: "kg", texto: "kg" },
  { valor: "l", texto: "litro" },
] as const;
