import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BETAS, BETA_ATADO, BETA_PROGRESO, LIMITE_MS, armarPedido, esfuerzoValido, limpiarFallback, plazoRestanteMs, reparacionHuerfanos, textoDe,
} from "./nucleo.ts";

// El pedido del asistente comercial ANTES de extraer el núcleo, escrito a mano tal cual estaba
// en asistente/turno.ts (12/10). Si esto cambia, cambió lo que hace el asistente.
function pedidoDeAntes(modelo: string, atado: boolean) {
  const betas = atado ? [...BETAS, BETA_ATADO, BETA_PROGRESO] : BETAS;
  return {
    model: modelo,
    max_tokens: 32_000,
    system: [{ type: "text", text: "sistema" }],
    tools: [{ name: "x", description: "d", input_schema: { type: "object" } }],
    messages: [{ role: "user", content: "hola" }],
    thinking: atado
      ? { type: "adaptive", display: "updates", block_binding: { prefix_mismatch_behavior: "drop_block" } }
      : { type: "adaptive" },
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
    betas,
    fallbacks: "default",
    metadata: { user_id: "u1" },
  };
}

const base = {
  maxTokens: 32_000,
  system: [{ type: "text" as const, text: "sistema" }],
  tools: [{ name: "x", description: "d", input_schema: { type: "object" as const } }],
  messages: [{ role: "user" as const, content: "hola" }],
  esfuerzo: "medium" as const,
  usuarioId: "u1",
};

test("asistente: el pedido con Opus 5.5 (atado) es el mismo de antes", () => {
  assert.deepEqual(armarPedido({ ...base, modelo: "claude-opus-5-5", progreso: true }), pedidoDeAntes("claude-opus-5-5", true));
});

test("asistente: el pedido con Opus 5 (no atado) es el mismo de antes", () => {
  assert.deepEqual(armarPedido({ ...base, modelo: "claude-opus-5", progreso: true }), pedidoDeAntes("claude-opus-5", false));
});

test("Sofía: atado sin notas de progreso, pero con block_binding y el respaldo", () => {
  const p = armarPedido({ ...base, modelo: "claude-opus-5-5", progreso: false }) as unknown as Record<string, unknown>;
  assert.deepEqual(p.thinking, { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
  assert.deepEqual(p.betas, [...BETAS, BETA_ATADO]);
  assert.equal(p.fallbacks, "default");
});

test("esfuerzoValido: sólo los de la lista", () => {
  assert.equal(esfuerzoValido("low", "medium"), "low");
  assert.equal(esfuerzoValido(" high ", "medium"), "high");
  assert.equal(esfuerzoValido("altísimo", "medium"), "medium");
  assert.equal(esfuerzoValido(null, "low"), "low");
});

test("limpiarFallback: lo anterior al respaldo se descarta salvo el texto", () => {
  const bloques = [
    { type: "thinking", thinking: "a" },
    { type: "text", text: "uno" },
    { type: "fallback" },
    { type: "tool_use", id: "t", name: "x", input: {} },
  ] as never;
  const r = limpiarFallback(bloques) as { type: string }[];
  assert.deepEqual(r.map((b) => b.type), ["text", "tool_use"]);
  assert.equal(textoDe(r as never), "uno");
});

test("plazo: nunca menos de 1 s y como mucho el límite", () => {
  const inicio = 1_000_000;
  assert.equal(plazoRestanteMs(inicio, inicio), LIMITE_MS);
  assert.equal(plazoRestanteMs(inicio, inicio + LIMITE_MS + 50_000), 1_000);
});

test("reparacionHuerfanos: responde los tool_use que quedaron sin resultado", () => {
  const r = reparacionHuerfanos({ rol: "assistant", contenido: [{ type: "text", text: "x" }, { type: "tool_use", id: "t1", name: "y", input: {} }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].tool_use_id, "t1");
  assert.equal(r[0].is_error, true);
  assert.deepEqual(reparacionHuerfanos({ rol: "user", contenido: "hola" }), []);
  assert.deepEqual(reparacionHuerfanos(undefined), []);
});
