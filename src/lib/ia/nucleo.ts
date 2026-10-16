// El núcleo compartido de los turnos con Claude: lo que resuelve cosas finas de la API y que
// usan los dos agentes (el asistente comercial, src/lib/asistente/turno.ts, y Sofía, el agente
// de clientes de WhatsApp, src/lib/clientes/turno.ts).
//
// SE EXTRAJO TAL CUAL de asistente/turno.ts (crm-propuesta.md §13: «copiar 479 líneas que
// resuelven cosas finas sería duplicar los errores»). Lo que hace el asistente no cambia: el
// pedido que arma `armarPedido` con sus opciones es el mismo objeto que armaba el turno (lo
// cuida nucleo.test.ts, con el pedido de antes escrito a mano).
//
// Lo que hay acá:
//   · el respaldo de modelo del lado de Anthropic (`fallbacks: "default"` + la beta) y cómo
//     limpiar la respuesta cuando hubo un respaldo a mitad de camino (`limpiarFallback`);
//   · el pensamiento atado a la conversación (`block_binding: drop_block`) en los modelos que
//     lo tienen, y el `display: "updates"` (las notas entre herramientas) para quien lo pida;
//   · el plazo duro de 265 s por turno (`LIMITE_MS`) y la señal que corta el pedido a tiempo;
//   · la reparación de una historia que quedó con un pedido de herramienta sin respuesta, o
//     terminada en un aviso de sistema (`reparacionHuerfanos`, `cierreFaltante`);
//   · el costo de cada pedido (`costoUsd`, con los intentos del respaldo a su precio).
//
// Puro: del SDK sólo usa los tipos, así se prueba con `node --test` sin red ni base.

import type Anthropic from "@anthropic-ai/sdk";

export { costoUsd } from "../asistente/costo.ts";
export { cierreFaltante, TEXTO_INTERRUMPIDA } from "../asistente/historia.ts";

/** Presupuesto blando de un turno: se mira al empezar cada vuelta. */
export const PRESUPUESTO_MS = 240_000;
/**
 * Plazo duro: las rutas tienen 300 s y Vercel corta sin aviso (sin `finally`: el candado queda
 * tomado y una acción puede quedar "ejecutando"). El presupuesto de arriba sólo se mira al
 * empezar cada vuelta, y una vuelta sola llegó a tardar 189 s, así que el pedido al modelo se
 * corta acá y queda margen para guardar y soltar el candado.
 */
export const LIMITE_MS = 265_000;

export const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];
/**
 * Modelos que atan cada bloque de pensamiento a la conversación que lo produjo ("preserved
 * thinking"): si cambian las herramientas o el system después del bloque, la API lo rechaza
 * con un 400. Pasa con cada deploy que agrega o cambia una herramienta, con las charlas
 * abiertas. Con `drop_block` la API descarta ese pensamiento viejo y sigue.
 */
export const PENSAMIENTO_ATADO = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
export const BETA_ATADO = "thinking-binding-controls-2026-08-01" as Anthropic.Beta.AnthropicBeta;
/**
 * En esos mismos modelos, las notas que el modelo escribe entre herramientas («ya tengo el
 * frente, ahora calculo la bandeja») vuelven como bloques de pensamiento, vacíos por defecto.
 * Con `display: "updates"` (beta) vuelven con texto y el razonamiento sigue oculto: es lo que la
 * pantalla del asistente muestra como progreso mientras espera. Cambiar `display` cambia el
 * pedido (pierde el caché de los mensajes una vez), así que cada agente lo elige y no lo cambia.
 */
export const BETA_PROGRESO = "thinking-display-updates-2026-08-18" as Anthropic.Beta.AnthropicBeta;

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";
export const ESFUERZOS = new Set<string>(["low", "medium", "high", "xhigh", "max"]);

/** El esfuerzo pedido si es uno válido; si no, el de reserva. */
export function esfuerzoValido(pedido: string | null | undefined, reserva: Esfuerzo): Esfuerzo {
  const e = pedido?.trim();
  return e && ESFUERZOS.has(e) ? (e as Esfuerzo) : reserva;
}

/** ¿Este modelo ata el pensamiento a la conversación? */
export function esAtado(modelo: string): boolean {
  return PENSAMIENTO_ATADO.has(modelo);
}

type ParametrosPedido = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

/**
 * El pedido a la API de Mensajes. Fuera de los modelos atados no se cambia nada del pedido (a
 * las charlas de Opus 5 no les cambia el caché).
 * - `progreso`: en los atados, que las notas entre herramientas vuelvan con texto (el
 *   asistente las muestra; Sofía no las usa y no las pide).
 */
export function armarPedido(p: {
  modelo: string;
  system: Anthropic.Beta.BetaTextBlockParam[] | string;
  tools: Anthropic.Beta.BetaToolUnion[];
  messages: Anthropic.Beta.BetaMessageParam[];
  esfuerzo: Esfuerzo;
  usuarioId: string;
  maxTokens: number;
  progreso: boolean;
}): ParametrosPedido {
  const atado = esAtado(p.modelo);
  const betas = atado ? [...BETAS, BETA_ATADO, ...(p.progreso ? [BETA_PROGRESO] : [])] : BETAS;
  const thinking = atado
    ? p.progreso
      ? { type: "adaptive" as const, display: "updates" as const, block_binding: { prefix_mismatch_behavior: "drop_block" as const } }
      : { type: "adaptive" as const, block_binding: { prefix_mismatch_behavior: "drop_block" as const } }
    : { type: "adaptive" as const };
  return {
    model: p.modelo,
    max_tokens: p.maxTokens,
    system: p.system,
    tools: p.tools,
    messages: p.messages,
    thinking,
    output_config: { effort: p.esfuerzo },
    cache_control: { type: "ephemeral" },
    betas,
    fallbacks: "default",
    metadata: { user_id: p.usuarioId },
  } as ParametrosPedido;
}

type Bloque = Anthropic.Beta.BetaContentBlock;

/** Tras un fallback a mitad de respuesta: lo anterior al último bloque `fallback` que no sea texto no se reenvía ni se ejecuta. */
export function limpiarFallback(contenido: Bloque[]): Bloque[] {
  const ultimo = contenido.map((b) => b.type as string).lastIndexOf("fallback");
  if (ultimo < 0) return contenido;
  return contenido.filter((b, i) => i > ultimo || b.type === "text");
}

/** Cuánto le queda al pedido al modelo antes del plazo duro (nunca menos de 1 s). */
export function plazoRestanteMs(inicio: number, ahora = Date.now()): number {
  return Math.max(1_000, LIMITE_MS - (ahora - inicio));
}

/**
 * La señal del pedido: corta en el plazo duro, o antes si corta quien llamó. `plazo` sirve para
 * saber, en el catch, si se cortó por tiempo.
 */
export function senalDelPedido(inicio: number, externa?: AbortSignal): { plazo: AbortSignal; senal: AbortSignal } {
  const plazo = AbortSignal.timeout(plazoRestanteMs(inicio));
  return { plazo, senal: externa ? AbortSignal.any([externa, plazo]) : plazo };
}

/**
 * Reparación: si la historia terminó con un pedido de herramienta sin respuesta (no debería
 * pasar: se guardan juntos), se le responde "interrumpido" antes de seguir.
 */
export function reparacionHuerfanos(
  ultima: { rol: string; contenido: unknown } | undefined,
): Anthropic.Beta.BetaToolResultBlockParam[] {
  const huerfanos = ultima?.rol === "assistant" && Array.isArray(ultima.contenido)
    ? (ultima.contenido as Bloque[]).filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    : [];
  return huerfanos.map((b) => ({
    type: "tool_result", tool_use_id: b.id, is_error: true, content: "La respuesta anterior se interrumpió antes de terminar esta herramienta.",
  }));
}

/** El texto de los bloques de texto de una respuesta, juntos. */
export function textoDe(contenido: Bloque[]): string {
  return contenido.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
}
