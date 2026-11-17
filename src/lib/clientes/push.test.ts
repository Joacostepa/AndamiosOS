// Notificaciones push de la bandeja: quién recibe cada aviso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { quienesReciben, tituloAviso } from "./push.ts";

const subs = [
  { user_id: "js", modo: "todo" as const },
  { user_id: "agus", modo: "necesita" as const },
  { user_id: "rocio", modo: "necesita" as const },
];
const ids = (x: { user_id: string }[]) => x.map((s) => s.user_id);

test("con «todo» llega todo; con «necesita», sólo lo que necesita a una persona", () => {
  assert.deepEqual(ids(quienesReciben(subs, { tipo: "tomas" }, null)), ["js"]);
  assert.deepEqual(ids(quienesReciben(subs, { tipo: "cliente" }, null)), ["js"]);
  assert.deepEqual(ids(quienesReciben(subs, { tipo: "necesita" }, null)), ["js", "agus", "rocio"]);
});

test("lo que escribe el cliente en una charla tuya te llega aunque estés en «necesita»", () => {
  assert.deepEqual(ids(quienesReciben(subs, { tipo: "cliente" }, "agus")), ["js", "agus"]);
  assert.deepEqual(ids(quienesReciben(subs, { tipo: "tomas" }, "agus")), ["js"]);
});

test("«te pasaron la charla» va sólo a esa persona", () => {
  assert.deepEqual(ids(quienesReciben(subs, { tipo: "necesita", soloPara: "rocio" }, null)), ["rocio"]);
});

test("títulos", () => {
  assert.equal(tituloAviso("cliente", "Oscar Brito"), "Oscar Brito");
  assert.equal(tituloAviso("tomas", "Oscar Brito"), "Tomás → Oscar Brito");
  assert.equal(tituloAviso("necesita", "Oscar Brito"), "⚠️ Oscar Brito");
});
