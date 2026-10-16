// WhatsApp de clientes: la ventana de 24 h (crm-propuesta.md §6 y §7).

import { test } from "node:test";
import assert from "node:assert/strict";
import { duracion, motivoVentanaCerrada, puedeTextoLibre, textoVentana, ventana } from "./ventana.ts";

const H = 3_600_000;
const AHORA = Date.parse("2026-10-19T12:00:00Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

test("ventana: recién escribió, quedan 24 h", () => {
  const v = ventana(hace(0), AHORA);
  assert.equal(v.abierta, true);
  assert.equal(v.restanteMs, 24 * H);
  assert.equal(v.porVencer, false);
  assert.equal(textoVentana(hace(0), AHORA), "Ventana 24 h: quedan 24 h");
});

test("ventana: a las 20 h 40 min quedan 3 h 20 min", () => {
  assert.equal(textoVentana(hace(20 * H + 40 * 60_000), AHORA), "Ventana 24 h: quedan 3 h 20 min");
  assert.equal(ventana(hace(20 * H + 40 * 60_000), AHORA).porVencer, false);
});

test("ventana: con menos de 2 h está por vencer", () => {
  const v = ventana(hace(22 * H + 20 * 60_000), AHORA);
  assert.equal(v.porVencer, true);
  assert.equal(duracion(v.restanteMs), "1 h 40 min");
});

test("ventana: el viernes 16:30 al lunes 9:00 son 64 h y está cerrada (escenario 11)", () => {
  const viernes = "2026-10-16T19:30:00Z"; // 16:30 en Buenos Aires
  const lunes = Date.parse("2026-10-19T12:30:00Z"); // 9:30
  const v = ventana(viernes, lunes);
  assert.equal(v.abierta, false);
  assert.equal(textoVentana(viernes, lunes), "Ventana cerrada (65 h)");
  assert.equal(puedeTextoLibre(viernes, lunes), false);
  assert.match(motivoVentanaCerrada(viernes, lunes) ?? "", /Pasaron 65 h .* sólo plantillas/);
});

test("ventana: en el límite justo, cerrada; un minuto antes, abierta pero ya no deja mandar (margen)", () => {
  assert.equal(ventana(hace(24 * H), AHORA).abierta, false);
  const casi = hace(24 * H - 60_000);
  assert.equal(ventana(casi, AHORA).abierta, true);
  assert.equal(puedeTextoLibre(casi, AHORA), false);
  assert.match(motivoVentanaCerrada(casi, AHORA) ?? "", /menos de 2 minutos/);
  assert.equal(puedeTextoLibre(hace(23 * H), AHORA), true);
  assert.equal(motivoVentanaCerrada(hace(23 * H), AHORA), null);
});

test("ventana: sin mensajes del cliente no hay ventana", () => {
  for (const v of [null, undefined, "no es fecha"]) {
    assert.equal(ventana(v, AHORA).sinMensajes, true);
    assert.equal(puedeTextoLibre(v, AHORA), false);
  }
  assert.equal(textoVentana(null, AHORA), "Sin mensajes del cliente");
  assert.match(motivoVentanaCerrada(null, AHORA) ?? "", /todavía no escribió/);
});

test("duracion: legible", () => {
  assert.equal(duracion(30_000), "menos de 1 min");
  assert.equal(duracion(45 * 60_000), "45 min");
  assert.equal(duracion(3 * H), "3 h");
  assert.equal(duracion(3 * H + 5 * 60_000), "3 h 5 min");
});
