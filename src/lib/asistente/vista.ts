// La historia guardada (bloques de la API) → lo que se muestra en el chat.
//
// Lo que ve el vendedor no es lo que ve el modelo: los resultados de herramientas y los avisos
// de sistema no se muestran; los pedidos de herramientas se ven como chips ("Buscando el
// cliente en Odoo"), marcados en rojo si fallaron. Las búsquedas en internet también (vienen
// dentro de la respuesta, no en una fila de resultados), y las páginas citadas quedan como
// fuentes debajo del texto.

import type { FilaMensaje } from "./datos";
import { etiquetaDe } from "./herramientas";
import { fuentesDeRespuesta, HERRAMIENTAS_OCULTAS, resultadoWebConError, textoDeRespuesta } from "./respuesta";

export type ItemChat = {
  id: number;
  rol: "vendedor" | "asistente" | "sistema";
  texto: string;
  herramientas: { id: string; nombre: string; etiqueta: string; error: boolean }[];
  /** Las páginas de internet que citó la respuesta. */
  fuentes?: { url: string; titulo: string }[];
  adjuntos: { tipo: "imagen" | "pdf"; nombre: string | null }[];
  canal: string | null;
  interrumpido: boolean;
  fecha: string;
};

type Bloque = Record<string, unknown> & { type: string };

export function historialParaPantalla(filas: FilaMensaje[]): ItemChat[] {
  // Qué herramientas fallaron: se lee de los resultados que siguen a cada pedido (las nuestras)
  // o de la misma respuesta (las de internet).
  const conError = new Set<string>();
  for (const f of filas) {
    if (!Array.isArray(f.contenido)) continue;
    for (const b of f.contenido as Bloque[]) {
      if (b.type === "tool_result" && b.is_error) conError.add(String(b.tool_use_id));
      else if (b.type.endsWith("_tool_result") && resultadoWebConError(b)) conError.add(String(b.tool_use_id));
    }
  }

  const items: ItemChat[] = [];
  for (const f of filas) {
    if (f.tipo === "resultados" || f.tipo === "contexto") continue;
    const bloques: Bloque[] = typeof f.contenido === "string" ? [{ type: "text", text: f.contenido }] : (f.contenido as unknown as Bloque[]);
    if (f.tipo === "boton") {
      items.push({ id: f.id, rol: "sistema", texto: f.texto ?? "Confirmado con el botón", herramientas: [], adjuntos: [], canal: f.canal, interrumpido: false, fecha: f.created_at });
      continue;
    }
    const texto = textoDeRespuesta(bloques);
    const herramientas = bloques
      .filter((b) => (b.type === "tool_use" || b.type === "server_tool_use") && !HERRAMIENTAS_OCULTAS.has(String(b.name)))
      .map((b) => ({ id: String(b.id), nombre: String(b.name), etiqueta: etiquetaDe(String(b.name), b.input), error: conError.has(String(b.id)) }));
    const fuentes = f.rol === "assistant" ? fuentesDeRespuesta(bloques) : [];
    const adjuntos = bloques
      .filter((b) => b.type === "image" || b.type === "document")
      .map((b) => ({ tipo: (b.type === "image" ? "imagen" : "pdf") as "imagen" | "pdf", nombre: (b.title as string | undefined) ?? null }));
    if (!texto && !herramientas.length && !adjuntos.length) continue;
    items.push({
      id: f.id,
      rol: f.rol === "assistant" ? "asistente" : "vendedor",
      texto: f.rol === "user" && texto === "(sin texto)" ? "" : texto,
      herramientas,
      ...(fuentes.length ? { fuentes } : {}),
      adjuntos,
      canal: f.canal,
      interrumpido: f.interrumpido,
      fecha: f.created_at,
    });
  }
  return items;
}
