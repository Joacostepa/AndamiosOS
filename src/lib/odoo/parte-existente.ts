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

/**
 * La jornada es de APOYO: no carga parte propio (docs/tablero-planificacion/apoyo.md).
 *
 * Hay un solo parte por obra y día, y lo carga la principal, que le cierra la jornada
 * también al apoyo. Si el apoyo pudiera cerrar la suya, la obra terminaría con dos partes
 * del mismo día —el costo de la gente contado dos veces, el flete también— que es
 * exactamente lo que el apoyo vino a evitar. La ruta contesta 409.
 */
export class ApoyoNoCargaParteError extends Error {
  /** La asignación de la principal, para que la pantalla ofrezca abrir ESA. null = no hay principal. */
  readonly principalAsignacionId: number | null;
  readonly cuadrillaPrincipal: string | null;
  constructor(cuadrillaPrincipal: string | null, principalAsignacionId: number | null) {
    super(mensajeApoyo(cuadrillaPrincipal, principalAsignacionId));
    this.name = "ApoyoNoCargaParteError";
    this.principalAsignacionId = principalAsignacionId;
    this.cuadrillaPrincipal = cuadrillaPrincipal;
  }
}

function mensajeApoyo(cuadrilla: string | null, principal: number | null): string {
  if (principal === null) {
    return "Esta jornada es de apoyo y la obra no tiene cuadrilla principal ese día: corregilo en el tablero antes de cargar el parte.";
  }
  // "lo carga la Cuadrilla 2", como se dice: el nombre en Odoo es "Cuadrilla 2", sin artículo.
  const quien = cuadrilla ? (/^cuadrilla\b/i.test(cuadrilla) ? `la ${cuadrilla}` : cuadrilla) : "la cuadrilla principal";
  return `Esta jornada es de apoyo: el parte lo carga ${quien}.`;
}

/** El POST de cierre sólo sigue si la asignación es la principal de su obra ese día. */
export function exigirPrincipal(
  esApoyo: boolean,
  principal: { asignacionId: number; cuadrilla: string | null } | null,
): void {
  if (!esApoyo) return;
  throw new ApoyoNoCargaParteError(principal?.cuadrilla ?? null, principal?.asignacionId ?? null);
}
