// WhatsApp: tandas, teléfonos y lo reenviado (auditoría 12/10, Bloque 6).

import { test } from "node:test";
import assert from "node:assert/strict";
import { esConfirmacion } from "../asistente/confirmacion.ts";
import { armarTandas, conMarca, esReenviado, ordenar, textoDeTanda, variantesTelefono, type Entrante, type MensajeMeta } from "./tandas.ts";

const ACCION = "0b6f6b52-3a2e-4c1a-9d3e-1f2a3b4c5d6e";
let n = 0;
const entrante = (contenido: Partial<MensajeMeta>, enviado = `2026-10-12T12:00:${String(n).padStart(2, "0")}Z`): Entrante => {
  n++;
  const m = { from: "5491155551234", id: `wamid.${n}`, type: "text", ...contenido } as MensajeMeta;
  return { wamid: m.id, telefono: m.from, tipo: m.type, contenido: m, recibido_at: enviado, enviado_at: enviado };
};
const texto = (body: string, extra: Partial<MensajeMeta> = {}) => entrante({ type: "text", text: { body }, ...extra });

test("variantesTelefono: con y sin el 9", () => {
  assert.deepEqual(variantesTelefono("5491155551234"), ["5491155551234", "541155551234"]);
  assert.deepEqual(variantesTelefono("+54 11 5555-1234"), ["541155551234", "5491155551234"]);
  assert.deepEqual(variantesTelefono("14155550000"), ["14155550000"]);
});

test("armarTandas: lo seguido se junta; botón y «nueva» van solos y en orden", () => {
  const tandas = armarTandas([
    texto("hola"),
    texto("necesito cotizar"),
    entrante({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: `confirmar:${ACCION}` } } }),
    texto("Nueva"),
    texto("una bandeja de 12 m"),
  ]);
  assert.deepEqual(tandas.map((t) => t.tipo), ["mensaje", "boton", "nueva", "mensaje"]);
  assert.equal(tandas[0].partes.length, 2);
  const b = tandas[1];
  assert.ok(b.tipo === "boton" && b.accionId === ACCION && b.decision === "confirmar");
});

test("armarTandas: un botón con un id que no es nuestro es texto común", () => {
  const tandas = armarTandas([entrante({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "confirmar:x" } } })]);
  assert.deepEqual(tandas.map((t) => t.tipo), ["mensaje"]);
});

test("un «nueva» reenviado no reinicia la conversación", () => {
  const tandas = armarTandas([texto("nueva", { context: { forwarded: true } })]);
  assert.deepEqual(tandas.map((t) => t.tipo), ["mensaje"]);
});

test("ordenar: por hora de envío, aunque Meta avise desordenado", () => {
  const a = texto("primero", {}), b = texto("segundo", {});
  a.enviado_at = "2026-10-12T12:00:05Z";
  b.enviado_at = "2026-10-12T12:00:01Z";
  assert.deepEqual(ordenar([a, b]).map((m) => m.contenido.text?.body), ["segundo", "primero"]);
});

test("detección de reenviado: forwarded y frequently_forwarded", () => {
  assert.equal(esReenviado({ from: "1", id: "a", type: "audio" }), false);
  assert.equal(esReenviado({ from: "1", id: "a", type: "audio", context: { forwarded: true } }), true);
  assert.equal(esReenviado({ from: "1", id: "a", type: "text", context: { frequently_forwarded: true } }), true);
  // Una respuesta citando otro mensaje también trae context, pero no es reenviada.
  assert.equal(esReenviado({ from: "1", id: "a", type: "text", context: { from: "549", id: "wamid.x" } }), false);
});

test("lo reenviado no cuenta como «sí»: ni solo ni junto con un sí propio en la misma tanda", () => {
  const audioCliente: MensajeMeta = { from: "1", id: "a", type: "audio", context: { forwarded: true } };
  const propio: MensajeMeta = { from: "1", id: "b", type: "text" };
  // El audio del cliente, transcripto: «sí, dale».
  const solo = textoDeTanda([conMarca(audioCliente, "sí, dale")], true);
  assert.equal(esConfirmacion(solo).ok, false);
  const conSiPropio = textoDeTanda([conMarca(audioCliente, "sí, dale"), conMarca(propio, "dale")], true);
  assert.equal(esConfirmacion(conSiPropio).ok, false);
  // Sin reenviados, un «sí, dale» propio sigue confirmando.
  assert.equal(esConfirmacion(textoDeTanda([conMarca(propio, "sí, dale")], false)).ok, true);
});
