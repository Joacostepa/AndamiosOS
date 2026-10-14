// Parámetros → Uso: las cuentas por persona y por mes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { costoUsd } from "./costo.ts";
import { mediana, mesBA, resumirUso, type FilaUso } from "./uso.ts";

const USO = { input_tokens: 1000, output_tokens: 1000 }; // Opus 5: 0,005 + 0,025 = US$ 0,03
const conversaciones = [
  { id: "c1", usuario_id: "js", modelo: "claude-opus-5" },
  { id: "c2", usuario_id: "js", modelo: "claude-opus-5-5" },
  { id: "c3", usuario_id: "gabriel", modelo: "claude-opus-5" },
];
const fila = (conversacion_id: string, turno_id: string | null, created_at: string, uso: Record<string, unknown> | null = USO): FilaUso => ({
  conversacion_id, turno_id, created_at, uso,
});

test("el mes es de Buenos Aires: la 1 de la mañana UTC del 1/10 todavía es septiembre", () => {
  assert.equal(mesBA("2026-10-01T01:00:00Z"), "2026-09");
  assert.equal(mesBA("2026-10-01T03:00:00Z"), "2026-10");
});

test("mediana par e impar", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([30, 10, 20]), 20);
  assert.equal(mediana([10, 20, 30, 40]), 25);
});

test("pedidos, conversaciones y US$ con el modelo de la conversación", () => {
  const { meses } = resumirUso({
    mensajes: [
      fila("c1", "t1", "2026-10-05T12:00:00Z", null), // el mensaje del vendedor: no es un pedido
      fila("c1", "t1", "2026-10-05T12:00:20Z"),
      fila("c2", "t2", "2026-10-06T12:00:00Z", null),
      fila("c2", "t2", "2026-10-06T12:01:30Z"),
      fila("c3", "t3", "2026-10-06T12:00:00Z"),
    ],
    conversaciones, acciones: [], feedback: [], ahora: new Date("2026-10-12T15:00:00Z"),
  });
  const js = meses.find((m) => m.usuarioId === "js")!;
  assert.equal(js.pedidos, 2);
  assert.equal(js.conversaciones, 2);
  const esperado = costoUsd(USO, "claude-opus-5") + costoUsd(USO, "claude-opus-5-5");
  assert.equal(js.usd, Math.round(esperado * 100) / 100);
  assert.ok(costoUsd(USO, "claude-opus-5-5") < costoUsd(USO, "claude-opus-5"), "Opus 5.5 es más barato");
});

test("espera por turno: de la primera a la última fila; % de turnos de más de 60 s", () => {
  const { meses } = resumirUso({
    mensajes: [
      fila("c1", "t1", "2026-10-05T12:00:00Z", null),
      fila("c1", "t1", "2026-10-05T12:00:20Z"),
      fila("c1", "t2", "2026-10-05T13:00:00Z", null),
      fila("c1", "t2", "2026-10-05T13:01:30Z"),
      fila("c1", "t3", "2026-10-05T14:00:00Z", null),
      fila("c1", "t3", "2026-10-05T14:00:40Z"),
      fila("c1", "t4", "2026-10-05T15:00:00Z", null), // falló antes del modelo: no cuenta
    ],
    conversaciones, acciones: [], feedback: [], ahora: new Date("2026-10-12T15:00:00Z"),
  });
  const js = meses[0];
  assert.equal(js.turnos, 3);
  assert.equal(js.esperaMedianaS, 40);
  assert.equal(js.pctTurnosLargos, 33);
});

test("presupuestos guardados: sólo acciones guardar/re-emitir ok; US$ por presupuesto", () => {
  const { meses } = resumirUso({
    mensajes: [fila("c1", "t1", "2026-10-05T12:00:00Z"), fila("c1", "t1", "2026-10-05T12:00:01Z")],
    conversaciones,
    acciones: [
      { usuario_id: "js", tipo: "guardar_presupuesto", estado: "ok", confirmada_at: "2026-10-05T12:01:00Z", created_at: "2026-10-05T12:00:00Z" },
      { usuario_id: "js", tipo: "reemitir_presupuesto", estado: "ok", confirmada_at: null, created_at: "2026-10-06T12:00:00Z" },
      { usuario_id: "js", tipo: "guardar_presupuesto", estado: "error", confirmada_at: null, created_at: "2026-10-06T12:00:00Z" },
      { usuario_id: "js", tipo: "enviar_mail", estado: "ok", confirmada_at: null, created_at: "2026-10-06T12:00:00Z" },
    ],
    feedback: [{ usuario_id: "js", motivo: "calculo", created_at: "2026-10-07T12:00:00Z" }],
    ahora: new Date("2026-10-12T15:00:00Z"),
  });
  const js = meses[0];
  assert.equal(js.presupuestos, 2);
  assert.equal(js.usdPorPresupuesto, Math.round((js.usd / 2) * 100) / 100);
  assert.equal(js.estuvoMal, 1);
});

test("sin la tabla de feedback, «estuvo mal» queda en null (no en 0)", () => {
  const { meses } = resumirUso({ mensajes: [fila("c1", "t1", "2026-10-05T12:00:00Z")], conversaciones, acciones: [], feedback: null, ahora: new Date() });
  assert.equal(meses[0].estuvoMal, null);
});

test("el gasto de hoy (Buenos Aires) por persona", () => {
  const { hoy } = resumirUso({
    mensajes: [
      fila("c1", "t1", "2026-10-12T02:00:00Z"), // 23 h del 11/10 en Buenos Aires: no es hoy
      fila("c1", "t2", "2026-10-12T14:00:00Z"),
      fila("c3", "t3", "2026-10-12T14:00:00Z"),
      fila("c3", "t3", "2026-10-12T14:00:10Z"),
    ],
    conversaciones, acciones: [], feedback: [], ahora: new Date("2026-10-12T15:00:00Z"),
  });
  assert.deepEqual(hoy, [{ usuarioId: "gabriel", usd: 0.06 }, { usuarioId: "js", usd: 0.03 }]);
});
