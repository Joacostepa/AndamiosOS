// La regla que protege los partes ya cargados (B1 de la revisión de la Hoja del día).
//
// "Cerrar jornada" (POST /api/planificacion/partes) CREA un parte. Nunca reescribe uno que
// ya existe: reescribir es PATCH con el id del parte, y lo pide quien está mirando ese
// parte ("Ver parte" → "Editar"). Antes, un POST sobre una asignación que ya tenía parte
// lo pisaba entero (encabezado y líneas) con lo que hubiera en el formulario: si el
// formulario se abría vacío o precargado desde la Hoja del día, el parte original (horas,
// fletes, incidencias) se perdía.
//
// Pura y sin imports: la usan la ruta (para el 409) y los tests.

export class ParteYaCargadoError extends Error {
  readonly parteId: number;
  constructor(parteId: number) {
    super(`Esta jornada ya tiene parte (#${parteId}). Abrilo con «Ver parte» para verlo o corregirlo.`);
    this.name = "ParteYaCargadoError";
    this.parteId = parteId;
  }
}

/** El POST de cierre sólo sigue si la asignación todavía no tiene parte vinculado. */
export function exigirSinParte(parteVinculado: number | null): void {
  if (parteVinculado !== null) throw new ParteYaCargadoError(parteVinculado);
}
