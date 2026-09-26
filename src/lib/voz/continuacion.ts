// Voz en vivo: cuando ElevenLabs cree que el vendedor terminó de hablar, nos pide respuesta; si
// el vendedor sigue ("…bandeja de 10 m. [pausa] Corta."), DESCARTA esa respuesta sin decirla y
// vuelve a pedir otra con la frase completa. La nuestra ya quedó guardada, así que el asistente
// "cree" que dijo cosas que nadie escuchó y contesta desencajado. En la charla de prueba del
// 26/09 llegaron 14 pedidos y se escucharon 8.
//
// Se reconoce porque la frase nueva empieza con la anterior (o es la misma: un reintento). La
// historia no se reescribe (es append-only): se le avisa al modelo en el contexto del turno.

type Anterior = { texto: string | null; canal: string | null; created_at: string } | undefined;

const VENTANA_MS = 60_000;

function comparable(t: string): string {
  return t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** La nota para el modelo si el mensaje de voz es la continuación del anterior; si no, null. */
export function notaDeContinuacion(anterior: Anterior, texto: string, ahora = Date.now()): string | null {
  if (!anterior?.texto || anterior.canal !== "voz") return null;
  if (ahora - new Date(anterior.created_at).getTime() > VENTANA_MS) return null;
  const antes = comparable(anterior.texto);
  const ahoraDice = comparable(texto);
  if (!antes || !ahoraDice.startsWith(antes)) return null;
  if (ahoraDice.length > antes.length && ahoraDice[antes.length] !== " ") return null;
  return (
    `Voz: el vendedor siguió hablando antes de escuchar tu respuesta anterior, que NO se llegó a decir. ` +
    `Su último mensaje es la frase completa: contestale a eso como si tu respuesta anterior no existiera ` +
    `(lo que hiciste con herramientas sí quedó hecho; no lo repitas).`
  );
}
