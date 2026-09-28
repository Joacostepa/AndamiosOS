// El mensaje de WhatsApp para el cliente (Joaquín, 26/09): dirigido a la persona y amable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeParaCliente, ultimoMensajeParaCliente } from "./mensaje-cliente.ts";

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

// La tarjeta del mensaje se reconstruye de la historia al recargar la página (28/09).
const pedido = (id: string, name = "mensaje_whatsapp") => ({ rol: "assistant", tipo: "asistente", contenido: [{ type: "tool_use", id, name, input: {} }] });
const resultado = (id: string, content: string, is_error = false) => ({ rol: "user", tipo: "resultados", contenido: [{ type: "tool_result", tool_use_id: id, content, ...(is_error ? { is_error } : {}) }] });

test("recupera el último mensaje para el cliente de la historia guardada", () => {
  const filas = [
    pedido("a"), resultado("a", JSON.stringify({ ok: true, texto: "Hola Miguel" })),
    { rol: "user", tipo: "humano", contenido: [{ type: "text", text: "cambiá el nombre" }] },
    pedido("b"), resultado("b", JSON.stringify({ ok: true, texto: "Hola Miguel Ángel" })),
  ];
  assert.equal(ultimoMensajeParaCliente(filas), "Hola Miguel Ángel");
});

test("sin mensaje, con error o de otra herramienta: no hay tarjeta", () => {
  assert.equal(ultimoMensajeParaCliente([]), null);
  assert.equal(ultimoMensajeParaCliente([pedido("a"), resultado("a", "Falló: sin borrador", true)]), null);
  assert.equal(ultimoMensajeParaCliente([pedido("a", "generar_pdf"), resultado("a", JSON.stringify({ ok: true, texto: "no es" }))]), null);
  assert.equal(ultimoMensajeParaCliente([pedido("a"), resultado("a", "no es json")]), null);
});

test("uno que falló después no tapa al anterior que salió bien", () => {
  const filas = [pedido("a"), resultado("a", JSON.stringify({ ok: true, texto: "Hola Nora" })), pedido("b"), resultado("b", "Falló", true)];
  assert.equal(ultimoMensajeParaCliente(filas), "Hola Nora");
});
