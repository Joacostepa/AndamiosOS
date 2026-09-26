// Voz en vivo: reconocer cuando ElevenLabs descartó nuestra respuesta porque el vendedor siguió
// hablando (casos de la charla de prueba del 26/09).

import { test } from "node:test";
import assert from "node:assert/strict";
import { notaDeContinuacion } from "./continuacion.ts";

const ahora = Date.parse("2026-09-26T20:17:30Z");
const hace = (s: number) => new Date(ahora - s * 1000).toISOString();

test("la frase que sigue a la anterior es una continuación", () => {
  const anterior = { texto: "No, está bien. Quiero presupuestar una bandeja de protección peatonal de 10 m.", canal: "voz", created_at: hace(4) };
  assert.ok(notaDeContinuacion(anterior, "No, está bien. Quiero presupuestar una bandeja de protección peatonal de 10 m. Corta.", ahora));
  assert.ok(notaDeContinuacion({ texto: "Sí, perfecto.", canal: "voz", created_at: hace(4) }, "Sí, perfecto. Parece una mierda, ¿verdad? Sí.", ahora));
});

test("la misma frase repetida (un reintento) también", () => {
  assert.ok(notaDeContinuacion({ texto: "Navarro 2369, Capital.", canal: "voz", created_at: hace(5) }, "Navarro 2369, capital", ahora));
});

test("una frase nueva, del chat escrito o de hace rato, no", () => {
  assert.equal(notaDeContinuacion({ texto: "Así de agresiva.", canal: "voz", created_at: hace(3) }, "Así de elegida.", ahora), null);
  assert.equal(notaDeContinuacion({ texto: "Sí, perfecto.", canal: "web", created_at: hace(3) }, "Sí, perfecto. Y la dirección es Navarro 2369.", ahora), null);
  assert.equal(notaDeContinuacion({ texto: "Sí, perfecto.", canal: "voz", created_at: hace(120) }, "Sí, perfecto. Y la dirección es Navarro 2369.", ahora), null);
  assert.equal(notaDeContinuacion(undefined, "Hola", ahora), null);
});

test("no confunde una palabra que empieza igual", () => {
  assert.equal(notaDeContinuacion({ texto: "Sí", canal: "voz", created_at: hace(3) }, "Siempre la misma altura", ahora), null);
});
