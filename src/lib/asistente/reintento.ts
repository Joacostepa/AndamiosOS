// Reintentar una acción que falló o quedó en duda (auditoría 12/10, 1.3).
//
// ANTES: una acción en error o incierta no se podía volver a ejecutar; el modelo proponía otra
// (otro id) y, con la marca contra duplicados atada a la acción, el reintento creaba otra orden.
// Ahora la marca es el borrador y la MISMA acción se reintenta con el botón de la tarjeta,
// conservando los pasos hechos (cliente creado, orden, nota…): el ejecutor saltea lo que ya está.
//
// Sólo con el botón: un «sí» escrito no reintenta (lo decide la persona mirando la tarjeta, que
// dice qué falló). Lo puro está acá para poder probarlo sin la base.

export const ESTADOS_REINTENTABLES = ["error", "incierto"] as const;
const TIPOS_REINTENTABLES = new Set(["guardar_presupuesto", "reemitir_presupuesto", "enviar_mail"]);
/** Pasado un día, lo que hay en Odoo puede haber cambiado a mano: se propone de nuevo. */
export const VENTANA_REINTENTO_MS = 24 * 3600_000;

type AccionMinima = { tipo: string; estado: string; created_at: string };

/** Lo que la tarjeta usa para mostrar «Reintentar». El servidor lo vuelve a mirar al ejecutar. */
export function esReintentable(a: AccionMinima, ahora = Date.now()): boolean {
  return (ESTADOS_REINTENTABLES as readonly string[]).includes(a.estado)
    && TIPOS_REINTENTABLES.has(a.tipo)
    && ahora - Date.parse(a.created_at) < VENTANA_REINTENTO_MS;
}

/**
 * Por qué no se puede reintentar, o null si se puede. Además de lo de arriba, el presupuesto no
 * tiene que haber cambiado desde que se propuso: el payload es el de esa versión.
 */
export function motivoSinReintento(
  a: AccionMinima & { borrador_version: number | null },
  borrador: { version: number; estado: string } | null,
  ahora = Date.now(),
): string | null {
  if (!(ESTADOS_REINTENTABLES as readonly string[]).includes(a.estado)) {
    return a.estado === "ok" ? "Esa acción ya se ejecutó bien." : `La acción está ${a.estado}: no hay nada que reintentar.`;
  }
  if (!TIPOS_REINTENTABLES.has(a.tipo)) return "Esa acción no se puede reintentar.";
  if (ahora - Date.parse(a.created_at) >= VENTANA_REINTENTO_MS) return "Pasó más de un día: proponela de nuevo con los datos de hoy.";
  if (borrador?.estado === "descartado") return "La orden se siguió editando en otra conversación: no se reintenta.";
  if (borrador && a.borrador_version !== null && borrador.version !== a.borrador_version) {
    return "El presupuesto cambió después de proponer: proponé la acción de nuevo con los datos actuales.";
  }
  return null;
}
