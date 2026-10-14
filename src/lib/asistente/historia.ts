// Reglas de la API sobre la historia que se reenvía, y cómo se cumplen sin reescribir nada
// (la historia es append-only: sólo se agregan filas).
//
// Un aviso de sistema a mitad de la charla tiene que ser lo último o ir seguido de una
// respuesta del asistente. Si el turno se corta antes de que el modelo conteste (Anthropic
// falla, se acaba el crédito, el vendedor toca Parar, Vercel corta la función), la historia
// queda terminada en el aviso, y el turno siguiente agregaría «vendedor + aviso» detrás: la API
// lo rechaza con un 400, y esa conversación quedaría rota para siempre.
//
// Pura: sin base ni red, con tests en historia.test.ts.

export const TEXTO_INTERRUMPIDA = "(La respuesta anterior se interrumpió antes de terminar.)";

type Fila = { rol: "user" | "assistant" | "system"; turno_id: string | null };

/**
 * Si la historia termina en un aviso de sistema sin respuesta, la fila del asistente que la
 * cierra (va antes de lo nuevo del vendedor). Si no hace falta, null.
 */
export function cierreFaltante(historia: readonly Fila[]): { rol: "assistant"; texto: string; turno_id: string | null } | null {
  const ultima = historia.at(-1);
  if (ultima?.rol !== "system") return null;
  return { rol: "assistant", texto: TEXTO_INTERRUMPIDA, turno_id: ultima.turno_id };
}
