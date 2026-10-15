// WhatsApp de clientes: cómo entra al hilo cada tipo de mensaje.

import { test } from "node:test";
import assert from "node:assert/strict";
import { debeResponderFijo, esBaja, extension, leerEntrante, nombreSeguro, respuestaFijaActivada, type MensajeCliente } from "./entrante.ts";

const m = (x: Partial<MensajeCliente>): MensajeCliente => ({ from: "5491155551234", id: "wamid.HBgLNTQ5MTE1NTU1MTIzNBUCABIYFjNFQjA", type: "text", ...x }) as MensajeCliente;

test("texto: tal cual, y la última línea recortada", () => {
  const e = leerEntrante(m({ text: { body: "  Hola, necesito una bandeja  " } }));
  assert.equal(e.tipo, "text");
  assert.equal(e.texto, "Hola, necesito una bandeja");
  assert.equal(e.resumen, "Hola, necesito una bandeja");
  assert.equal(e.adjunto, null);
  const largo = leerEntrante(m({ text: { body: "a".repeat(300) } }));
  assert.equal(largo.resumen.length, 120);
  assert.ok(largo.resumen.endsWith("…"));
});

test("audio: queda pendiente de bajar, con nombre y extensión", () => {
  const e = leerEntrante(m({ type: "audio", audio: { id: "MEDIA1", mime_type: "audio/ogg; codecs=opus", voice: true } }));
  assert.equal(e.tipo, "audio");
  assert.equal(e.resumen, "Audio");
  assert.deepEqual(e.adjunto, { media_id: "MEDIA1", mime: "audio/ogg", nombre: "audio-YFjNFQjA.ogg", pendiente: true });
});

test("documento: con su nombre y el epígrafe como texto", () => {
  const e = leerEntrante(m({ type: "document", document: { id: "MEDIA2", mime_type: "application/pdf", filename: "planos frente.pdf", caption: "Te paso los planos" } }));
  assert.equal(e.texto, "Te paso los planos");
  assert.equal(e.resumen, "Archivo: planos frente.pdf · Te paso los planos");
  assert.equal((e.adjunto as { nombre: string }).nombre, "planos frente.pdf");
});

test("foto, video y sticker también se bajan", () => {
  assert.equal(leerEntrante(m({ type: "image", image: { id: "M3", mime_type: "image/jpeg" } })).resumen, "Foto");
  assert.equal(leerEntrante(m({ type: "video", video: { id: "M4", mime_type: "video/mp4" } })).resumen, "Video");
  assert.equal(leerEntrante(m({ type: "sticker", sticker: { id: "M5", mime_type: "image/webp" } })).resumen, "Sticker");
});

test("ubicación: con coordenadas para el mapa", () => {
  const e = leerEntrante(m({ type: "location", location: { latitude: -34.6, longitude: -58.4, name: "Obra", address: "Los Aromos 1234" } }));
  assert.equal(e.texto, "Obra, Los Aromos 1234");
  assert.deepEqual(e.adjunto, { lat: -34.6, lng: -58.4, nombre: "Obra", direccion: "Los Aromos 1234" });
});

test("botones, reacciones y lo que no se puede leer", () => {
  assert.equal(leerEntrante(m({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title: "Sí, todo" } } })).resumen, "Tocó «Sí, todo»");
  assert.equal(leerEntrante(m({ type: "button", button: { text: "Confirmar" } })).texto, "Confirmar");
  const r = leerEntrante(m({ type: "reaction", reaction: { message_id: "wamid.X", emoji: "👍" } }));
  assert.equal(r.texto, "Reaccionó con 👍");
  assert.equal(r.respondeA, "wamid.X");
  assert.equal(leerEntrante(m({ type: "unsupported", errors: [{ code: 131051, title: "Message type unknown" }] })).tipo, "otro");
});

test("responde a: el mensaje citado", () => {
  assert.equal(leerEntrante(m({ text: { body: "sí" }, context: { id: "wamid.PREVIO" } })).respondeA, "wamid.PREVIO");
});

test("extension y nombreSeguro", () => {
  assert.equal(extension("audio/ogg; codecs=opus"), "ogg");
  assert.equal(extension("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "vndop");
  assert.equal(extension(null), "bin");
  assert.equal(nombreSeguro("Planos de la óbra (1).pdf"), "Planos_de_la_obra_1_.pdf");
  assert.equal(nombreSeguro("../../etc"), "etc");
});

test("esBaja: sólo el mensaje entero", () => {
  assert.equal(esBaja("BAJA"), true);
  assert.equal(esBaja("  baja. "), true);
  assert.equal(esBaja("No quiero más mensajes"), true);
  assert.equal(esBaja("la bandeja está baja"), false);
  assert.equal(esBaja(null), false);
});

test("mensaje fijo: apagado por defecto; prendido, sólo en charla nueva o reabierta y nunca con baja", () => {
  assert.equal(respuestaFijaActivada({}), false);
  assert.equal(respuestaFijaActivada({ WHATSAPP_CLIENTES_RESPUESTA_FIJA: "0" }), false);
  assert.equal(respuestaFijaActivada({ WHATSAPP_CLIENTES_RESPUESTA_FIJA: "1" }), true);
  assert.equal(respuestaFijaActivada({ WHATSAPP_CLIENTES_RESPUESTA_FIJA: "Sí" }), true);
  assert.equal(debeResponderFijo({ activado: false, nueva: true, reabierta: false, optOut: false }), false);
  assert.equal(debeResponderFijo({ activado: true, nueva: true, reabierta: false, optOut: false }), true);
  assert.equal(debeResponderFijo({ activado: true, nueva: false, reabierta: true, optOut: false }), true);
  assert.equal(debeResponderFijo({ activado: true, nueva: false, reabierta: false, optOut: false }), false);
  assert.equal(debeResponderFijo({ activado: true, nueva: true, reabierta: false, optOut: true }), false);
});
