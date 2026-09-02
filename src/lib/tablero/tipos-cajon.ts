// Cajón de planificación: lo que hay en el panel de abajo del tablero.
//
// Dos cosas independientes y las dos GENERALES —no cuelgan de una semana—: los
// pendientes del que planifica y los criterios que no vencen. Viven en Supabase
// (plan_cajon_notas, plan_cajon_pendientes); ver la migración 20260901000002.

/** Los criterios. Es UNA sola nota compartida, no una lista. */
export type NotaCajon = {
  texto: string;
  /**
   * Sello de la última escritura. Viaja de vuelta en el guardado y es lo que detecta
   * que otro editó mientras tanto: sin esto el autoguardado pisa en silencio.
   */
  updatedAt: string;
  autorNombre: string | null;
};

export type Pendiente = {
  id: string;
  texto: string;
  hecho: boolean;
  posicion: number;
  /** Cuándo se tildó. Es lo que usa la purga de los 30 días. */
  hechoAt: string | null;
  autorNombre: string | null;
};

export type Cajon = {
  nota: NotaCajon;
  pendientes: Pendiente[];
};

/** Lo que se puede cambiar de un pendiente ya creado. */
export type CambioPendiente = { hecho?: boolean; texto?: string };

/**
 * A los cuántos días se borra solo un pendiente ya tildado.
 *
 * El riesgo de esta lista no es perder datos: es podrirse. Sin corte por semana nada la
 * limpia, y una lista general con ochenta tildados deja de abrirse. Treinta días es
 * bastante más que el horizonte que se planifica y bastante menos que "para siempre".
 */
export const DIAS_RETENCION_HECHOS = 30;
