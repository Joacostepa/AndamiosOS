// Lo que se lee de los bloques de una respuesta del modelo para mostrarla: el texto, las páginas
// de internet que citó y si una búsqueda falló. Puro: sin base ni red, con tests en
// respuesta.test.ts.

type Bloque = { type: string; [k: string]: unknown };

/** La búsqueda filtra los resultados con código del lado de Anthropic: no se muestra como chip. */
export const HERRAMIENTAS_OCULTAS = new Set(["code_execution", "bash_code_execution", "text_editor_code_execution"]);

/**
 * Con fuentes, la API parte el texto en varios bloques en medio de una oración: se pegan tal
 * cual. Lo que viene después de una herramienta (una búsqueda) es otro párrafo.
 */
export function textoDeRespuesta(bloques: Bloque[]): string {
  let texto = "";
  let corte = false;
  for (const b of bloques) {
    if (b.type === "text") {
      texto += (corte && texto ? "\n\n" : "") + String(b.text);
      corte = false;
    } else if (b.type !== "thinking" && b.type !== "redacted_thinking") {
      corte = true;
    }
  }
  return texto.trim();
}

/** Las páginas citadas, una vez cada una, con su título (o el sitio si no tiene). */
export function fuentesDeRespuesta(bloques: Bloque[]): { url: string; titulo: string }[] {
  const porUrl = new Map<string, string>();
  for (const b of bloques) {
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations as { url?: unknown; title?: unknown }[]) {
      if (typeof c.url !== "string" || porUrl.has(c.url)) continue;
      const sitio = c.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
      porUrl.set(c.url, typeof c.title === "string" && c.title.trim() ? c.title.trim() : sitio);
    }
  }
  return [...porUrl].map(([url, titulo]) => ({ url, titulo }));
}

/** Un resultado de una herramienta del servidor que vino con error (búsqueda caída, página que no abre). */
export function resultadoWebConError(bloque: object): boolean {
  const c = (bloque as { content?: unknown }).content;
  return !!c && !Array.isArray(c) && typeof c === "object" && String((c as { type?: unknown }).type ?? "").endsWith("error");
}
