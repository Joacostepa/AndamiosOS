// El parámetro `pizarron` de hd_parametros: cómo convive el Pizarrón del día (el rediseño,
// docs/equipos-del-dia/rediseno-plan.md §D) con la Hoja del día clásica.
//   oculto    → nadie ve la pestaña (la ruta /planificacion/hoja/pizarron igual abre por URL,
//               para probar, a quien tiene la Hoja del día).
//   probar    → pestaña "Pizarrón (nuevo)" para quien edita la Hoja del día.
//   principal → /planificacion/hoja redirige al pizarrón; lo clásico sigue en
//               /planificacion/hoja/cuadrillas y /planificacion/hoja/camiones.
//
// PURO (lo leen el layout del servidor y los tests). Sin la fila en la base (todavía no hay
// migración que la cree) o con cualquier otra cosa, `oculto`.

export type ModoPizarron = "oculto" | "probar" | "principal";

export const MODOS_PIZARRON: readonly ModoPizarron[] = ["oculto", "probar", "principal"];

/** El valor guardado (jsonb: un string, o el string con comillas de más) → el modo. */
export function modoPizarron(valor: unknown): ModoPizarron {
  const s = typeof valor === "string" ? valor.replace(/^"|"$/g, "").trim().toLowerCase() : "";
  return (MODOS_PIZARRON as readonly string[]).includes(s) ? (s as ModoPizarron) : "oculto";
}

export const RUTA_PIZARRON = "/planificacion/hoja/pizarron";
