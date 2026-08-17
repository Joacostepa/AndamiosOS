// Aritmética de fracciones de jornada del tablero.
//
// REGLA DE NEGOCIO: una jornada son 8 horas efectivas (8–12 y 13–17). La capacidad
// diaria de una cuadrilla es 1,00. La suma puede superarla —a veces la jornada se
// estira— pero se marca en rojo: se permite y se advierte, no se bloquea.

export type FraccionStr = "0.10" | "0.25" | "0.50" | "0.75" | "1";

export const FRACCIONES: { value: FraccionStr; label: string; detalle: string }[] = [
  { value: "0.10", label: "mín", detalle: "Mínimo · ~1,5 h con viaje" },
  { value: "0.25", label: "¼", detalle: "Un cuarto · 2 h" },
  { value: "0.50", label: "½", detalle: "Media · 4 h" },
  { value: "0.75", label: "¾", detalle: "Tres cuartos · 6 h" },
  { value: "1", label: "1", detalle: "Jornada completa · 8 h" },
];

export const CAPACIDAD_DIARIA = 1;

const GLIFOS: Record<string, string> = {
  "0.1": "mín",
  "0.25": "¼",
  "0.5": "½",
  "0.75": "¾",
  "1": "1",
};

/** Número → glifo de fracción ("½"). Si no cae en la escala, devuelve el porcentaje. */
export function fraccionLabel(n: number): string {
  const g = GLIFOS[String(Number(n.toFixed(2)))];
  return g ?? `${Math.round(n * 100)}%`;
}

/** Fracción válida más cercana a un número arbitrario (para repartir jornadas fraccionarias). */
export function fraccionMasCercana(n: number): FraccionStr {
  return FRACCIONES.reduce((mejor, f) =>
    Math.abs(Number(f.value) - n) < Math.abs(Number(mejor.value) - n) ? f : mejor,
  ).value;
}

export function aFraccionStr(n: number): FraccionStr {
  const s = n.toFixed(2);
  if (s === "0.10") return "0.10";
  if (s === "0.25") return "0.25";
  if (s === "0.50") return "0.50";
  if (s === "0.75") return "0.75";
  if (s === "1.00") return "1";
  return fraccionMasCercana(n);
}

/**
 * Reparte la duración estimada de una OT en fracciones por jornada.
 * REGLA DE NEGOCIO: una obra de más de una jornada ocupa 1,00 en cada día que abarca;
 * el resto fraccionario (ej. 2,5 jornadas) cae en el último día.
 */
export function repartirJornadas(duracion: number): FraccionStr[] {
  if (!Number.isFinite(duracion) || duracion <= 0) return ["1"];
  if (duracion < 1) return [aFraccionStr(duracion)];

  const completas = Math.floor(duracion);
  const resto = Number((duracion - completas).toFixed(2));
  const dias: FraccionStr[] = Array.from({ length: completas }, () => "1" as FraccionStr);
  if (resto >= 0.05) dias.push(aFraccionStr(resto));
  return dias;
}

export type OcupacionCelda = {
  total: number;
  pct: number;
  /** libre = nada asignado; parcial < 100%; completa = 100%; sobre > 100%. */
  nivel: "libre" | "parcial" | "completa" | "sobre";
  label: string;
};

/** Suma de fracciones de una celda (cuadrilla × día) + su lectura para la barra. */
export function ocupacionCelda(fracciones: number[]): OcupacionCelda {
  const total = Number(fracciones.reduce((s, f) => s + f, 0).toFixed(2));
  const pct = Math.round(total * 100);

  if (total === 0) return { total, pct: 0, nivel: "libre", label: "libre" };
  if (total > CAPACIDAD_DIARIA) return { total, pct, nivel: "sobre", label: "SOBREASIGNADA" };
  if (total === CAPACIDAD_DIARIA) return { total, pct, nivel: "completa", label: "completa" };

  const queda = Number((CAPACIDAD_DIARIA - total).toFixed(2));
  return { total, pct, nivel: "parcial", label: `${pct}% · queda ${fraccionLabel(queda)}` };
}
