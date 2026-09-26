// La historia guardada (bloques de la API) → lo que se muestra en el chat.
//
// Lo que ve el vendedor no es lo que ve el modelo: los resultados de herramientas y los avisos
// de sistema no se muestran; los pedidos de herramientas se ven como chips ("Buscando el
// cliente en Odoo"), marcados en rojo si fallaron.

import type Anthropic from "@anthropic-ai/sdk";
import type { FilaMensaje } from "./datos";
import { etiquetaDe } from "./herramientas";

export type ItemChat = {
  id: number;
  rol: "vendedor" | "asistente" | "sistema";
  texto: string;
  herramientas: { id: string; nombre: string; etiqueta: string; error: boolean }[];
  adjuntos: { tipo: "imagen" | "pdf"; nombre: string | null }[];
  canal: string | null;
  interrumpido: boolean;
  fecha: string;
};

type Bloque = Record<string, unknown> & { type: string };

export function historialParaPantalla(filas: FilaMensaje[]): ItemChat[] {
  // Qué herramientas fallaron: se lee de los resultados que siguen a cada pedido.
  const conError = new Set<string>();
  for (const f of filas) {
    if (f.tipo !== "resultados" || !Array.isArray(f.contenido)) continue;
    for (const b of f.contenido as Bloque[]) if (b.type === "tool_result" && b.is_error) conError.add(String(b.tool_use_id));
  }

  const items: ItemChat[] = [];
  for (const f of filas) {
    if (f.tipo === "resultados" || f.tipo === "contexto") continue;
    const bloques: Bloque[] = typeof f.contenido === "string" ? [{ type: "text", text: f.contenido }] : (f.contenido as unknown as Bloque[]);
    if (f.tipo === "boton") {
      items.push({ id: f.id, rol: "sistema", texto: f.texto ?? "Confirmado con el botón", herramientas: [], adjuntos: [], canal: f.canal, interrumpido: false, fecha: f.created_at });
      continue;
    }
    const texto = bloques.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n").trim();
    const herramientas = bloques
      .filter((b): b is Bloque & Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, nombre: b.name, etiqueta: etiquetaDe(b.name), error: conError.has(b.id) }));
    const adjuntos = bloques
      .filter((b) => b.type === "image" || b.type === "document")
      .map((b) => ({ tipo: (b.type === "image" ? "imagen" : "pdf") as "imagen" | "pdf", nombre: (b.title as string | undefined) ?? null }));
    if (!texto && !herramientas.length && !adjuntos.length) continue;
    items.push({
      id: f.id,
      rol: f.rol === "assistant" ? "asistente" : "vendedor",
      texto: f.rol === "user" && texto === "(sin texto)" ? "" : texto,
      herramientas,
      adjuntos,
      canal: f.canal,
      interrumpido: f.interrumpido,
      fecha: f.created_at,
    });
  }
  return items;
}
