// Aritmética de fracciones de jornada del tablero.
//
// REGLA DE NEGOCIO: una jornada son 8 horas efectivas (8–12 y 13–17). La capacidad
// diaria de una cuadrilla es 1,00. La suma puede superarla —a veces la jornada se
// estira— pero se marca en rojo: se permite y se advierte, no se bloquea.

import { parseISO } from "date-fns";

export type FraccionStr =
  | "0.10"
  | "0.25"
  | "0.375"
  | "0.50"
  | "0.625"
  | "0.75"
  | "0.875"
  | "1";

/**
 * `horas` es la lectura de negocio, no la multiplicación: el mínimo no son 0,8 h (0,10 ×
 * 8) sino ~1,5 h, porque lo que hace corta a esa jornada es el viaje, no el trabajo. Va
 * en la tabla y no calculado en cada pantalla para que ese criterio viva en un solo lado.
 *
 * LOS OCTAVOS VAN EXACTOS (0,375 y no 0,38) y por eso todo el módulo cuenta con TRES
 * decimales. Con dos, 3 h + 5 h da 1,01 y la celda se pinta de sobreasignada cuando en
 * realidad es una jornada perfecta: el redondeo se comía justo el caso para el que se
 * agregaron. 0,375 × 8 = 3 al centavo, y ¼ + 3 h + ½ cierra igual de bien.
 *
 * Las tres nuevas no tienen glifo —3/8 no existe en Unicode— y se nombran por sus horas,
 * que además es como se piensan: nadie planifica "tres octavos de jornada".
 */
export const FRACCIONES: { value: FraccionStr; label: string; detalle: string; horas: number }[] = [
  { value: "0.10", label: "mín", detalle: "Mínimo · ~1,5 h con viaje", horas: 1.5 },
  { value: "0.25", label: "¼", detalle: "Un cuarto · 2 h", horas: 2 },
  { value: "0.375", label: "3h", detalle: "Tres horas", horas: 3 },
  { value: "0.50", label: "½", detalle: "Media · 4 h", horas: 4 },
  { value: "0.625", label: "5h", detalle: "Cinco horas", horas: 5 },
  { value: "0.75", label: "¾", detalle: "Tres cuartos · 6 h", horas: 6 },
  { value: "0.875", label: "7h", detalle: "Siete horas", horas: 7 },
  { value: "1", label: "1", detalle: "Jornada completa · 8 h", horas: 8 },
];

/** La escala como tupla, para que las validaciones de las APIs salgan de acá y no se copien. */
export const VALORES_FRACCION = FRACCIONES.map((f) => f.value) as [FraccionStr, ...FraccionStr[]];

/**
 * LA ESCALA GRUESA, que es OTRA COSA y a propósito.
 *
 * Son dos escalas porque son dos manos distintas. El tamaño de una obra lo estima
 * COMERCIAL en Odoo (x_duracion_est) y sirve para clasificarla: en qué balde cae en la
 * bandeja, cuántos días proponer al arrastrarla. Ese número nunca se midió con precisión
 * de una hora, así que fingir que distingue 3 h de 4 h sería inventar detalle que no
 * existe — y de paso llenaría el filtro de la bandeja de chips que no separan nada.
 *
 * La escala fina es de OPERACIONES y vive en la tarjeta: ahí sí se sabe que esa cuadrilla
 * ese día tiene tres horas de trabajo, y ahí sí importa al centavo porque es lo que
 * decide la disponibilidad del día.
 */
export const FRACCIONES_ESTIMADO = FRACCIONES.filter(
  (f) => f.value === "0.10" || f.value === "0.25" || f.value === "0.50" || f.value === "0.75" || f.value === "1",
);

export const CAPACIDAD_DIARIA = 1;

/**
 * Redondeo de toda la aritmética de fracciones.
 *
 * TRES decimales, no dos: ver el comentario de FRACCIONES. El redondeo existe porque en
 * punto flotante 0,375 + 0,625 da 0,9999999999999999 y la celda se leería como incompleta.
 */
export function redondearFraccion(n: number): number {
  return Number(n.toFixed(3));
}

/**
 * Capacidad de una cuadrilla sobre un rango de días.
 *
 * REGLA DE NEGOCIO: el domingo no suma capacidad salvo que esa cuadrilla tenga trabajo
 * ese día. Si no, un domingo trabajado se leería como sobreasignación cuando en realidad
 * es capacidad extra que alguien decidió poner.
 *
 * `conTrabajo` son las fechas en las que ESA fila tiene algo asignado, no el tablero
 * entero: que otra cuadrilla trabaje el domingo no le agrega capacidad a esta.
 */
export function capacidadDelRango(fechas: string[], conTrabajo: Set<string>): number {
  const dias = fechas.filter((f) => parseISO(f).getDay() !== 0 || conTrabajo.has(f)).length;
  return dias * CAPACIDAD_DIARIA;
}

// Sale de FRACCIONES y no se escribe aparte: una escala con dos listas se desincroniza el
// día que alguien agrega un tamaño. La clave es el número normalizado ("0.375", "0.5").
const GLIFOS: Record<string, string> = Object.fromEntries(
  FRACCIONES.map((f) => [String(Number(f.value)), f.label]),
);

/** Número → glifo de fracción ("½", "3h"). Si no cae en la escala, devuelve el porcentaje. */
export function fraccionLabel(n: number): string {
  const g = GLIFOS[String(redondearFraccion(n))];
  return g ?? `${Math.round(n * 100)}%`;
}

const HORAS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/**
 * Lo que SOBRA de una celda: el glifo si el hueco cae en la escala, y si no, las horas.
 *
 * El porcentaje suelto no servía para lo único que se hace con este número, que es
 * decidir si entra otra obra: una celda con 5 h y 2 h decía "queda 13%" cuando lo que
 * queda es UNA HORA. Con los tamaños por hora los huecos fuera de la escala son el caso
 * normal, no la excepción, así que el fallback es el que más se lee.
 */
function huecoLabel(n: number): string {
  return GLIFOS[String(redondearFraccion(n))] ?? `${HORAS.format(redondearFraccion(n * 8))} h`;
}

/** Fracción válida más cercana a un número arbitrario (para repartir jornadas fraccionarias). */
export function fraccionMasCercana(
  n: number,
  escala: typeof FRACCIONES = FRACCIONES,
): FraccionStr {
  return escala.reduce((mejor, f) =>
    Math.abs(Number(f.value) - n) < Math.abs(Number(mejor.value) - n) ? f : mejor,
  ).value;
}

/** Número → la fracción de la escala fina que le corresponde. */
export function aFraccionStr(n: number): FraccionStr {
  const r = redondearFraccion(n);
  return FRACCIONES.find((f) => Number(f.value) === r)?.value ?? fraccionMasCercana(n);
}

/**
 * Reparte la duración estimada de una OT en fracciones por jornada.
 * REGLA DE NEGOCIO: una obra de más de una jornada ocupa 1,00 en cada día que abarca;
 * el resto fraccionario (ej. 2,5 jornadas) cae en el último día.
 *
 * VA CONTRA LA ESCALA GRUESA: lo que entra es el estimado de Comercial, y redondearlo a
 * la escala fina lo haría parecer más preciso de lo que es (2,4 jornadas saldría como
 * "2 días y 3 h"). Operaciones afina después en la tarjeta, que es donde se sabe.
 */
export function repartirJornadas(duracion: number): FraccionStr[] {
  if (!Number.isFinite(duracion) || duracion <= 0) return ["1"];
  if (duracion < 1) return [fraccionMasCercana(duracion, FRACCIONES_ESTIMADO)];

  const completas = Math.floor(duracion);
  const resto = redondearFraccion(duracion - completas);
  const dias: FraccionStr[] = Array.from({ length: completas }, () => "1" as FraccionStr);
  if (resto >= 0.05) dias.push(fraccionMasCercana(resto, FRACCIONES_ESTIMADO));
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
  const total = redondearFraccion(fracciones.reduce((s, f) => s + f, 0));
  const pct = Math.round(total * 100);

  if (total === 0) return { total, pct: 0, nivel: "libre", label: "libre" };
  if (total > CAPACIDAD_DIARIA) return { total, pct, nivel: "sobre", label: "SOBREASIGNADA" };
  if (total === CAPACIDAD_DIARIA) return { total, pct, nivel: "completa", label: "completa" };

  const queda = redondearFraccion(CAPACIDAD_DIARIA - total);
  return { total, pct, nivel: "parcial", label: `${pct}% · queda ${huecoLabel(queda)}` };
}
