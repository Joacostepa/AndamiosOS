// Lo que cuesta un pedido a la API, en US$, a partir del `usage` que devuelve (y que queda
// guardado en asistente_mensajes.uso). De acá salen el tope diario y lo que se informa del uso.

/** US$ por millón de tokens. `lectura` es la fracción de la entrada que cuesta leer del caché. */
type Precio = { entrada: number; salida: number; lectura: number };

const PRECIOS: Record<string, Precio> = {
  "claude-opus-5-5": { entrada: 4, salida: 20, lectura: 0.05 },
  "claude-opus-5": { entrada: 5, salida: 25, lectura: 0.1 },
  "claude-fable-5-1": { entrada: 10, salida: 50, lectura: 0.025 },
  "claude-fable-5": { entrada: 10, salida: 50, lectura: 0.1 },
  "claude-opus-4-8": { entrada: 5, salida: 25, lectura: 0.1 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, lectura: 0.1 },
  "claude-sonnet-5": { entrada: 2, salida: 10, lectura: 0.1 },
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5, lectura: 0.1 },
};
/** Haiku 5.5 cobra más cuando el prompt pasa los 100 k tokens. */
const HAIKU_LARGO: Precio = { entrada: 0.5, salida: 2.5, lectura: 0.1 };
const POR_DEFECTO = "claude-opus-5";

/** Escribir en el caché: 1,25x la entrada si es de 5 min, 2x si es de 1 h. */
const ESCRITURA_5M = 1.25;
const ESCRITURA_1H = 2;
/** Cada búsqueda en internet: US$ 10 las mil. Lo que lee entra como tokens. */
const BUSQUEDA_USD = 0.01;

type Tramo = {
  type?: string;
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
};

function costoTramo(u: Tramo, modelo: string): number {
  const entrada = u.input_tokens ?? 0;
  const lectura = u.cache_read_input_tokens ?? 0;
  const escritura = u.cache_creation_input_tokens ?? 0;
  let p = PRECIOS[modelo] ?? PRECIOS[POR_DEFECTO];
  if (modelo === "claude-haiku-5-5" && entrada + lectura + escritura > 100_000) p = HAIKU_LARGO;
  // Sin el desglose por duración, todo se toma como de 5 min (el caché automático de la cola).
  const de1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const de5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : escritura;
  return (
    entrada * p.entrada +
    de5m * p.entrada * ESCRITURA_5M +
    de1h * p.entrada * ESCRITURA_1H +
    lectura * p.entrada * p.lectura +
    (u.output_tokens ?? 0) * p.salida
  ) / 1_000_000;
}

/**
 * `modeloPedido` es el de la conversación. Si el pedido pasó a un modelo de respaldo, el
 * `usage` de arriba cubre sólo el intento que respondió: entonces se suman los intentos de
 * `iterations`, cada uno a su precio. El modo rápido cobra el doble.
 */
export function costoUsd(uso: Record<string, unknown> | null | undefined, modeloPedido: string | null | undefined): number {
  if (!uso) return 0;
  const modelo = modeloPedido || POR_DEFECTO;
  const intentos = (uso.iterations as Tramo[] | null | undefined) ?? [];
  const huboRespaldo = intentos.some((i) => i.type === "fallback_message");
  const tokens = huboRespaldo
    ? intentos
        .filter((i) => i.type === "message" || i.type === "fallback_message")
        .reduce((a, i) => a + costoTramo(i, i.model || modelo), 0)
    : costoTramo(uso as Tramo, modelo);
  const rapido = uso.speed === "fast" ? 2 : 1;
  const busquedas = (uso.server_tool_use as { web_search_requests?: number } | undefined)?.web_search_requests ?? 0;
  return tokens * rapido + busquedas * BUSQUEDA_USD;
}
