// El mensaje de WhatsApp para el cliente (Joaquín, 26/09): dirigido a la persona y amable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeParaCliente } from "./mensaje-cliente.ts";

test("saluda por el nombre y nombra la obra, que en Odoo viene en mayúsculas", () => {
  const texto = mensajeParaCliente({ nombre: "Fernando", obra: "RIOBAMBA 651", actualizada: false, mailEnviado: false });
  assert.equal(texto, [
    "Hola Fernando, ¿cómo estás?",
    "Te comparto la propuesta para la obra de Riobamba 651.",
    "Si tenés alguna duda o querés ajustar algo, escribime y lo vemos.",
    "¡Muchas gracias por tenernos en cuenta!",
  ].join("\n"));
});

test("una re-emisión sale como la propuesta actualizada", () => {
  const texto = mensajeParaCliente({ nombre: "Fernando", obra: "RIOBAMBA 651", actualizada: true, mailEnviado: false });
  assert.match(texto, /Te comparto la propuesta actualizada para la obra de Riobamba 651\./);
});

test("si ya se mandó por mail, lo dice", () => {
  const texto = mensajeParaCliente({ nombre: "Verónica", obra: "Lima 707, CABA", actualizada: false, mailEnviado: true });
  assert.match(texto, /^Hola Verónica, ¿cómo estás\?\nTe acabo de mandar por mail la propuesta para la obra de Lima 707, CABA, y te la dejo también por acá/);
});

test("sin nombre ni obra, saluda igual", () => {
  const texto = mensajeParaCliente({ nombre: "  ", obra: null, actualizada: false, mailEnviado: false });
  assert.match(texto, /^Hola, ¿cómo estás\?\nTe comparto la propuesta\.\n/);
});

test("pasa a minúsculas lo que viene en mayúsculas, sin tocar lo que ya está bien escrito", () => {
  const mayus = mensajeParaCliente({ nombre: "MARÍA JOSÉ", obra: "SANTIAGO DEL ESTERO 1293, CABA", actualizada: false, mailEnviado: false });
  assert.match(mayus, /^Hola María José,/);
  assert.match(mayus, /la obra de Santiago del Estero 1293, CABA\./);
  const bien = mensajeParaCliente({ nombre: "Juan", obra: "Av. Álvarez Thomas 2810", actualizada: false, mailEnviado: false });
  assert.match(bien, /la obra de Av\. Álvarez Thomas 2810\./);
});
