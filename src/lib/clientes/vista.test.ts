// WhatsApp de clientes: pastillas, filtros y teléfonos de la bandeja (crm-propuesta.md §7).

import { test } from "node:test";
import assert from "node:assert/strict";
import { esPrioritaria, filtrar, gamaAltaEsperando, pastilla, telefonoLegible, type CharlaListada } from "./vista.ts";

const YO = "u-joaquin";
const SANDRA = { id: "u-sandra", nombre: "Sandra" };
let n = 0;
const charla = (x: Partial<CharlaListada>): CharlaListada => ({
  id: `c${++n}`, telefono: "5491155551234", nombre: null, estado: "derivada", motivo: null, asistente: null,
  ultimoMensajeAt: null, ultimoEntranteAt: null, ultimoResumen: null, sinLeer: 0, optOut: false, createdAt: "2026-10-15T12:00:00Z", segmento: null, tarea: null, ...x,
});

test("pastilla: los cinco estados, y «sin tomar» en la etapa 0", () => {
  assert.deepEqual(pastilla(charla({ estado: "derivada" }), YO), { texto: "Sin tomar", tono: "rojo" });
  assert.deepEqual(pastilla(charla({ estado: "derivada", motivo: "regateo" }), YO), { texto: "Sin tomar · regateo", tono: "rojo" });
  assert.deepEqual(pastilla(charla({ estado: "humano", asistente: { id: YO, nombre: "Joaquín" } }), YO), { texto: "La tenés vos", tono: "coral" });
  assert.deepEqual(pastilla(charla({ estado: "humano", asistente: SANDRA }), YO), { texto: "La tiene Sandra", tono: "coral" });
  assert.equal(pastilla(charla({ estado: "bot" }), YO).texto, "Atiende Sofía (IA)");
  assert.equal(pastilla(charla({ estado: "espera_ok" }), YO).tono, "ambar");
  assert.equal(pastilla(charla({ estado: "espera_ok", motivo: "cotización #1042" }), YO).texto, "Espera tu OK · cotización #1042");
  assert.equal(pastilla(charla({ estado: "espera_ok", motivo: "texto bloqueado: monto en letras" }), YO).texto, "Espera tu OK · texto bloqueado: monto en letras");
  assert.deepEqual(pastilla(charla({ estado: "cerrada" }), YO), { texto: "Cerrada", tono: "gris" });
});

test("filtrar: «Para vos» son las mías y las sin tomar; todos ven todas", () => {
  const mia = charla({ estado: "humano", asistente: { id: YO, nombre: "Joaquín" } });
  const deSandra = charla({ estado: "humano", asistente: SANDRA });
  const sinTomar = charla({ estado: "derivada" });
  const cerrada = charla({ estado: "cerrada" });
  const todas = [mia, deSandra, sinTomar, cerrada];
  assert.deepEqual(filtrar(todas, "vos", YO).map((c) => c.id), [mia.id, sinTomar.id]);
  assert.deepEqual(filtrar(todas, "todas", YO).map((c) => c.id), [mia.id, deSandra.id, sinTomar.id]);
  assert.deepEqual(filtrar(todas, "cerradas", YO).map((c) => c.id), [cerrada.id]);
});

test("telefonoLegible: celulares argentinos y el resto", () => {
  assert.equal(telefonoLegible("5491155551234"), "+54 9 11 5555-1234");
  assert.equal(telefonoLegible("14155550000"), "+14155550000");
});

test("filtrar: las de gama alta que esperan a una persona van arriba en «Para vos» y «Todas»", () => {
  const comun = charla({ estado: "derivada" });
  const mia = charla({ estado: "humano", asistente: { id: YO, nombre: "Joaquín" } });
  const altaSinTomar = charla({ estado: "derivada", segmento: "gama_alta" });
  const altaEsperaOk = charla({ estado: "espera_ok", segmento: "gama_alta" });
  const altaConSofia = charla({ estado: "bot", segmento: "gama_alta" });
  const altaDeSandra = charla({ estado: "humano", asistente: SANDRA, segmento: "gama_alta" });
  const altaCerrada = charla({ estado: "cerrada", segmento: "gama_alta" });
  const todas = [comun, mia, altaConSofia, altaSinTomar, altaDeSandra, altaEsperaOk, altaCerrada];
  assert.deepEqual(filtrar(todas, "vos", YO).map((c) => c.id), [altaSinTomar.id, altaEsperaOk.id, comun.id, mia.id]);
  assert.deepEqual(filtrar(todas, "todas", YO).map((c) => c.id), [altaSinTomar.id, altaEsperaOk.id, comun.id, mia.id, altaConSofia.id, altaDeSandra.id]);
  assert.deepEqual(filtrar(todas, "cerradas", YO).map((c) => c.id), [altaCerrada.id]);
  assert.equal(gamaAltaEsperando(altaConSofia), false, "con Sofía no espera a nadie");
  assert.equal(gamaAltaEsperando(comun), false);
});

test("filtrar: los urgentes y los que quieren avanzar también van arriba mientras esperan a una persona (análisis de chats, D3)", () => {
  const comun = charla({ estado: "derivada", motivo: "Pide hablar con una persona" });
  const avanza = charla({ estado: "derivada", motivo: "Quiere avanzar" });
  const cae = charla({ estado: "derivada", motivo: "Urgente · se desprende algo del edificio" });
  const avanzaGama = charla({ estado: "derivada", motivo: "Gama alta · Quiere avanzar" });
  const tomada = charla({ estado: "humano", asistente: { id: YO, nombre: "Joaquín" }, motivo: "Quiere avanzar" });
  assert.deepEqual(filtrar([comun, avanza, tomada, cae, avanzaGama], "todas", YO).map((c) => c.id), [avanza.id, cae.id, avanzaGama.id, comun.id, tomada.id]);
  assert.equal(esPrioritaria(tomada), false, "si ya la tiene alguien, no espera");
  assert.equal(esPrioritaria(comun), false);
});
