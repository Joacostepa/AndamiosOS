import { test } from "node:test";
import assert from "node:assert/strict";
import { costoUsd } from "./costo.ts";

const cerca = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("sin uso no cuesta nada", () => {
  assert.equal(costoUsd(null, "claude-opus-5"), 0);
  assert.equal(costoUsd(undefined, "claude-opus-5"), 0);
});

test("Opus 5: escritura de 5 min a 1,25x, de 1 h a 2x, lectura a 0,1x", () => {
  const uso = {
    input_tokens: 1_000,
    output_tokens: 2_000,
    cache_read_input_tokens: 40_000,
    cache_creation_input_tokens: 15_000,
    cache_creation: { ephemeral_5m_input_tokens: 5_000, ephemeral_1h_input_tokens: 10_000 },
  };
  // 1000·5 + 5000·5·1,25 + 10000·5·2 + 40000·5·0,1 + 2000·25 = 5000 + 31250 + 100000 + 20000 + 50000
  cerca(costoUsd(uso, "claude-opus-5"), 206_250 / 1e6);
});

test("Opus 5.5: más barato y la lectura del caché a 0,05x", () => {
  const uso = { input_tokens: 0, output_tokens: 1_000, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0 };
  // 100000·4·0,05 + 1000·20
  cerca(costoUsd(uso, "claude-opus-5-5"), 40_000 / 1e6);
  cerca(costoUsd(uso, "claude-opus-5"), 75_000 / 1e6);
});

test("sin desglose del caché, la escritura se toma como de 5 min", () => {
  cerca(costoUsd({ cache_creation_input_tokens: 1_000 }, "claude-opus-5"), 6_250 / 1e6);
});

test("un modelo que no está en la tabla se cobra como Opus 5", () => {
  const uso = { input_tokens: 1_000, output_tokens: 1_000 };
  cerca(costoUsd(uso, "claude-desconocido"), costoUsd(uso, "claude-opus-5"));
  cerca(costoUsd(uso, null), costoUsd(uso, "claude-opus-5"));
});

test("las búsquedas en internet suman US$ 0,01 cada una", () => {
  cerca(costoUsd({ server_tool_use: { web_search_requests: 3 } }, "claude-opus-5-5"), 0.03);
});

test("modo rápido: los tokens al doble", () => {
  const uso = { input_tokens: 1_000, output_tokens: 1_000 };
  cerca(costoUsd({ ...uso, speed: "fast" }, "claude-opus-5-5"), 2 * costoUsd(uso, "claude-opus-5-5"));
});

test("Haiku 5.5 pasa al precio de prompt largo arriba de 100 k", () => {
  cerca(costoUsd({ input_tokens: 100_000 }, "claude-haiku-5-5"), 10_000 / 1e6);
  cerca(costoUsd({ input_tokens: 100_001 }, "claude-haiku-5-5"), (100_001 * 0.5) / 1e6);
});

test("con respaldo se suma cada intento a su precio, no sólo el que respondió", () => {
  const uso = {
    // arriba: sólo el intento del respaldo
    input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    iterations: [
      { type: "message", model: null, input_tokens: 1_000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
      { type: "fallback_message", model: "claude-opus-5", input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
    ],
  };
  // Opus 5.5: 1000·4 + 200·20 = 8000; Opus 5: 1000·5 + 500·25 = 17500
  cerca(costoUsd(uso, "claude-opus-5-5"), 25_500 / 1e6);
});

test("sin respaldo manda el uso de arriba aunque haya iterations (búsquedas del servidor)", () => {
  const uso = {
    input_tokens: 2_000, output_tokens: 0,
    iterations: [
      { type: "message", model: null, input_tokens: 1_000, output_tokens: 0 },
      { type: "message", model: null, input_tokens: 1_000, output_tokens: 0 },
    ],
  };
  cerca(costoUsd(uso, "claude-opus-5-5"), 8_000 / 1e6);
});
