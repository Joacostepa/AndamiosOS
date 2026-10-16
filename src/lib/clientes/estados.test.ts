// WhatsApp de clientes: los avisos de entrega de Meta (statuses).

import { test } from "node:test";
import assert from "node:assert/strict";
import { avanza, explicarError, leerStatus } from "./estados.ts";

test("leerStatus: sent / delivered / read", () => {
  assert.deepEqual(leerStatus({ id: "wamid.A", status: "sent", timestamp: "1760875200" }), {
    wamid: "wamid.A", estado: "enviado", at: "2025-10-19T12:00:00.000Z", error: null,
  });
  assert.equal(leerStatus({ id: "wamid.A", status: "delivered", timestamp: "1760875200" })?.estado, "entregado");
  assert.equal(leerStatus({ id: "wamid.A", status: "read", timestamp: "1760875200" })?.estado, "leido");
});

test("leerStatus: el 131047 (fuera de las 24 h) se explica en castellano", () => {
  const s = leerStatus({
    id: "wamid.B",
    status: "failed",
    timestamp: "1760875200",
    errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "Message failed to send because more than 24 hours have passed" } }],
  });
  assert.equal(s?.estado, "error");
  assert.equal(s?.error?.codigo, 131047);
  assert.match(s?.error?.detalle ?? "", /más de 24 h/);
});

test("leerStatus: un error que no conocemos lleva el texto de Meta", () => {
  const s = leerStatus({ id: "wamid.C", status: "failed", errors: [{ code: 999, title: "Algo raro", error_data: { details: "detalle de Meta" } }] });
  assert.equal(s?.error?.codigo, 999);
  assert.equal(s?.error?.detalle, "WhatsApp no lo entregó (999): detalle de Meta");
  assert.equal(explicarError(null), "WhatsApp no lo entregó.");
});

test("leerStatus: sin wamid o con un estado desconocido no sirve", () => {
  assert.equal(leerStatus({ status: "sent" }), null);
  assert.equal(leerStatus({ id: "wamid.D", status: "deleted" }), null);
  assert.equal(leerStatus({ id: "wamid.D" }), null);
});

test("avanza: sólo para adelante, aunque Meta avise desordenado", () => {
  assert.equal(avanza("enviando", "enviado"), true);
  assert.equal(avanza("enviado", "entregado"), true);
  assert.equal(avanza("enviado", "leido"), true);
  assert.equal(avanza("leido", "entregado"), false);
  assert.equal(avanza("entregado", "enviado"), false);
  assert.equal(avanza("leido", "leido"), false);
});

test("avanza: el error pisa a lo enviado pero no a lo entregado o leído", () => {
  assert.equal(avanza("enviando", "error"), true);
  assert.equal(avanza("enviado", "error"), true);
  assert.equal(avanza("entregado", "error"), false);
  assert.equal(avanza("leido", "error"), false);
  assert.equal(avanza("error", "entregado"), false);
});

test("avanza: lo que entra no tiene estado de entrega", () => {
  assert.equal(avanza("recibido", "leido"), false);
});
