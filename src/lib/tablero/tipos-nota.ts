// Notas de la jornada: lo que hay que tener en cuenta un día, y que no es una obra.
//
// "Llevar material a Turme", "el chofer de la 2 se va 14h", "Juan de licencia del 12 al
// 20". Viven en Supabase (plan_notas_dia); ver la migración 20260831000002.
//
// Los tipos van acá y no en el servicio para que el bundle del browser no tenga que
// tocar el módulo server-only, igual que tipos.ts.

export type NotaJornada = {
  id: string;
  /** Primer día que la nota cubre, en yyyy-MM-dd. */
  desde: string;
  /** Último día que cubre, inclusive. Igual a `desde` cuando es de un solo día. */
  hasta: string;
  /** null = la nota es del día entero. Con valor, es de esa cuadrilla (id de Odoo). */
  cuadrillaId: number | null;
  texto: string;
  autorNombre: string | null;
  createdAt: string;
};

export type NuevaNotaJornada = {
  desde: string;
  hasta: string;
  cuadrillaId: number | null;
  texto: string;
};

/** ¿Esta nota cubre ese día? El rango es cerrado en los dos extremos. */
export function cubre(nota: NotaJornada, fecha: string): boolean {
  return nota.desde <= fecha && fecha <= nota.hasta;
}

/**
 * Las notas que aplican a una celda del tablero.
 *
 * Una nota del día entero aplica a TODAS las cuadrillas: es la mitad del punto de que
 * exista el alcance "día". Por eso la comparación de cuadrilla sólo filtra cuando la
 * nota tiene una.
 */
export function notasDe(
  notas: NotaJornada[],
  fecha: string,
  cuadrillaId?: number,
): NotaJornada[] {
  return notas.filter(
    (n) =>
      cubre(n, fecha) &&
      (n.cuadrillaId === null || cuadrillaId === undefined || n.cuadrillaId === cuadrillaId),
  );
}

/** Sólo las de esa cuadrilla, sin las del día entero. Es lo que marca la celda. */
export function notasDeCuadrilla(
  notas: NotaJornada[],
  fecha: string,
  cuadrillaId: number,
): NotaJornada[] {
  return notas.filter((n) => n.cuadrillaId === cuadrillaId && cubre(n, fecha));
}
