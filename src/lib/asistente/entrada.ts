// Lo que llega del modelo como entrada de una herramienta, antes de validarlo con zod.

/**
 * A veces el modelo manda un objeto como texto («"cambios": "{\"obra\": …}"»): se lo
 * convierte antes de validar, en vez de devolverle un error y gastar otra vuelta.
 */
export function repararEntrada(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  let cambio = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string" && /^\s*[[{]/.test(v)) {
      try {
        out[k] = JSON.parse(v);
        cambio = true;
        continue;
      } catch {
        // no era JSON: queda como vino
      }
    }
    out[k] = v;
  }
  return cambio ? out : input;
}
