// «La última foto» del chat: por fecha de subida, no por nombre (auditoría 12/10).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenarPorSubida } from "./fotos-chat.ts";

test("una foto de WhatsApp (wa-…) más nueva que una de la pantalla (<Date.now()>-…) va primero", () => {
  const fotos = ordenarPorSubida([
    { name: "1790645235043-2589cd76.jpg", created_at: "2026-10-12T10:00:00Z" },
    { name: "wa-wamid_HBgN_ABC-foto-1234.jpg", created_at: "2026-10-12T11:00:00Z" },
    { name: "wa-wamid_ZZZ-foto-9999.jpg", created_at: "2026-10-12T09:00:00Z" },
  ]);
  assert.deepEqual(fotos.map((f) => f.name), ["wa-wamid_HBgN_ABC-foto-1234.jpg", "1790645235043-2589cd76.jpg", "wa-wamid_ZZZ-foto-9999.jpg"]);
});

test("sin fecha van al final, por nombre", () => {
  const fotos = ordenarPorSubida([{ name: "a.jpg" }, { name: "b.jpg", created_at: null }, { name: "c.jpg", created_at: "2026-10-01T00:00:00Z" }]);
  assert.deepEqual(fotos.map((f) => f.name), ["c.jpg", "b.jpg", "a.jpg"]);
});
