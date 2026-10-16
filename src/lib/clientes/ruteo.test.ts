// WhatsApp de clientes: a qué bandeja va cada aviso (crm-propuesta.md §13).

import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoDeNumero, numerosDelEntorno } from "./ruteo.ts";

const NUMEROS = { vendedores: "111", clientes: "222" };

test("ruteo: cada número a su bandeja", () => {
  assert.equal(destinoDeNumero("111", NUMEROS), "vendedores");
  assert.equal(destinoDeNumero("222", NUMEROS), "clientes");
});

test("ruteo: sin phone_number_id va a vendedores, como antes de que hubiera dos números", () => {
  assert.equal(destinoDeNumero(undefined, NUMEROS), "vendedores");
  assert.equal(destinoDeNumero("", NUMEROS), "vendedores");
  assert.equal(destinoDeNumero("  ", NUMEROS), "vendedores");
});

test("ruteo: otro número de la cuenta se ignora", () => {
  assert.equal(destinoDeNumero("333", NUMEROS), "ignorar");
});

test("ruteo: sin el número de clientes configurado, todo sigue como hoy", () => {
  const soloVendedores = { vendedores: "111", clientes: null };
  assert.equal(destinoDeNumero("111", soloVendedores), "vendedores");
  assert.equal(destinoDeNumero("222", soloVendedores), "ignorar");
});

test("ruteo: si las dos variables tienen el mismo id, gana vendedores (no se rompe lo que anda)", () => {
  assert.equal(destinoDeNumero("111", { vendedores: "111", clientes: "111" }), "vendedores");
});

test("ruteo: lee las variables de entorno", () => {
  assert.deepEqual(numerosDelEntorno({ WHATSAPP_PHONE_NUMBER_ID: "111", WHATSAPP_CLIENTES_PHONE_NUMBER_ID: "222" }), NUMEROS);
  assert.deepEqual(numerosDelEntorno({ WHATSAPP_PHONE_NUMBER_ID: "111", WHATSAPP_CLIENTES_PHONE_NUMBER_ID: "" }), { vendedores: "111", clientes: null });
});
