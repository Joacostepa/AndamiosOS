// Agrupación de asignaciones en "bloques" y colocación en la grilla semanal.
//
// Una obra de varias jornadas son N registros de asignación (uno por día). En el
// tablero se ven como UNA sola tarjeta que abarca las celdas contiguas: se arrastra
// completa y se mueven todos sus días juntos. Este módulo hace esa traducción.
//
// REGLA DE NEGOCIO: las obras se planifican en días corridos y el domingo no se
// trabaja, así que "el día siguiente" saltea el domingo. La discontinuidad real se
// registra después en los partes diarios, no acá.

import { addDays, format, parseISO } from "date-fns";
import type { AsignacionTablero, EstadoAsignacion } from "./tipos";

export function esDomingo(fecha: string): boolean {
  return parseISO(fecha).getDay() === 0;
}

/** Día laboral siguiente (saltea domingo). */
export function siguienteDiaLaboral(fecha: string): string {
  const d = addDays(parseISO(fecha), 1);
  return format(d.getDay() === 0 ? addDays(d, 1) : d, "yyyy-MM-dd");
}

/** Las N fechas corridas que ocuparía una obra que arranca en `inicio`. */
export function fechasDeJornadas(inicio: string, n: number): string[] {
  const fechas: string[] = [];
  // Si el drop cae en domingo, la obra arranca el lunes.
  let f = esDomingo(inicio) ? format(addDays(parseISO(inicio), 1), "yyyy-MM-dd") : inicio;
  for (let i = 0; i < n; i++) {
    fechas.push(f);
    f = siguienteDiaLaboral(f);
  }
  return fechas;
}

export type Bloque = {
  /** Estable mientras no cambien los ids: sirve de key de React y de id de drag. */
  key: string;
  ids: number[];
  otId: number;
  cuadrillaId: number | null;
  /** Fechas del bloque, ordenadas y corridas. */
  fechas: string[];
  /** Parte diario de cada día, en el mismo orden que `ids` y `fechas`. null = abierto. */
  partes: (number | null)[];
  /** Fracción que ocupa por día (un bloque multi-jornada ocupa 1,00 en cada día). */
  fraccion: number;
  /** La fracción real de cada día, que es la que se edita y la que suma capacidad. */
  fraccionesPorDia: number[];
  estado: EstadoAsignacion;
  ordenDia: number;
  notas: string | null;
  multiDia: boolean;
};

/**
 * Agrupa las asignaciones de una misma OT y cuadrilla en tramos de días corridos.
 * Dos tramos separados de la misma OT (p. ej. lunes y jueves) dan dos bloques: cada
 * uno se arrastra por su cuenta.
 */
export function agruparBloques(asignaciones: AsignacionTablero[]): Bloque[] {
  const porGrupo = new Map<string, AsignacionTablero[]>();
  for (const a of asignaciones) {
    const k = `${a.otId}:${a.cuadrillaId ?? "sin"}`;
    const lista = porGrupo.get(k);
    if (lista) lista.push(a);
    else porGrupo.set(k, [a]);
  }

  const bloques: Bloque[] = [];
  for (const lista of porGrupo.values()) {
    const ordenadas = [...lista].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
    let tramo: AsignacionTablero[] = [];

    const cerrar = () => {
      if (tramo.length === 0) return;
      const primera = tramo[0];
      bloques.push({
        key: tramo.map((t) => t.id).join("-"),
        ids: tramo.map((t) => t.id),
        partes: tramo.map((t) => t.parteId),
        otId: primera.otId,
        cuadrillaId: primera.cuadrillaId,
        fechas: tramo.map((t) => t.fecha),
        fraccion: tramo.length > 1 ? 1 : primera.fraccion,
        fraccionesPorDia: tramo.map((t) => t.fraccion),
        // Un bloque es tentativo mientras alguno de sus días lo sea.
        estado: tramo.every((t) => t.estado === "confirmada") ? "confirmada" : "tentativa",
        ordenDia: primera.ordenDia,
        notas: primera.notas,
        multiDia: tramo.length > 1,
      });
      tramo = [];
    };

    for (const a of ordenadas) {
      const previa = tramo[tramo.length - 1];
      if (previa && a.fecha !== siguienteDiaLaboral(previa.fecha)) cerrar();
      tramo.push(a);
    }
    cerrar();
  }

  return bloques;
}

export type Colocacion = {
  /** Índice (0-based) de la primera columna visible que ocupa el bloque. */
  colInicio: number;
  /** Cantidad de columnas visibles que abarca. */
  span: number;
  /** El bloque empieza antes / termina después del rango visible. */
  vieneDeAntes: boolean;
  sigueDespues: boolean;
};

/**
 * Ubica un bloque sobre las columnas visibles. Si el domingo está oculto, un bloque
 * de viernes a lunes abarca tres columnas contiguas (vie, sáb, lun): el span se mide
 * sobre lo que se ve, no sobre el calendario.
 * Devuelve null si el bloque no toca el rango visible.
 */
export function colocarBloque(fechas: string[], fechasVisibles: string[]): Colocacion | null {
  const indices = fechas
    .map((f) => fechasVisibles.indexOf(f))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (indices.length === 0) return null;

  const colInicio = indices[0];
  const colFin = indices[indices.length - 1];
  return {
    colInicio,
    span: colFin - colInicio + 1,
    vieneDeAntes: fechas[0] < fechasVisibles[0],
    sigueDespues: fechas[fechas.length - 1] > fechasVisibles[fechasVisibles.length - 1],
  };
}

/**
 * Reparte los bloques de una cuadrilla en carriles (filas internas de la grilla) para
 * que dos bloques que comparten un día no se pisen: el primer carril libre gana. El
 * orden de apilado representa el orden previsto del día (x_orden_dia).
 */
export function repartirEnCarriles(
  bloques: Bloque[],
  fechasVisibles: string[],
): { bloque: Bloque; colocacion: Colocacion; carril: number }[] {
  const ubicados = bloques
    .map((bloque) => ({ bloque, colocacion: colocarBloque(bloque.fechas, fechasVisibles) }))
    .filter((x): x is { bloque: Bloque; colocacion: Colocacion } => x.colocacion !== null)
    .sort(
      (a, b) =>
        a.colocacion.colInicio - b.colocacion.colInicio ||
        a.bloque.ordenDia - b.bloque.ordenDia ||
        a.bloque.ids[0] - b.bloque.ids[0],
    );

  const carriles: number[][] = []; // por carril, las columnas ocupadas
  return ubicados.map(({ bloque, colocacion }) => {
    const columnas = Array.from({ length: colocacion.span }, (_, i) => colocacion.colInicio + i);
    let carril = carriles.findIndex((ocupadas) => columnas.every((c) => !ocupadas.includes(c)));
    if (carril === -1) {
      carril = carriles.length;
      carriles.push([]);
    }
    carriles[carril].push(...columnas);
    return { bloque, colocacion, carril };
  });
}
