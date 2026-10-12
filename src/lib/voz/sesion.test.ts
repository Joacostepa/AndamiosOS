// El token de la voz en vivo: lo que ElevenLabs nos devuelve en cada pedido. Si se pudiera
// fabricar, cualquiera hablaría con el asistente como otro vendedor.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
const { firmarSesionVoz, verificarSesionVoz } = await import("./sesion.ts");

const CONV = "11111111-1111-4111-8111-111111111111";
const USU = "22222222-2222-4222-8222-222222222222";

test("ida y vuelta", () => {
  assert.deepEqual(verificarSesionVoz(firmarSesionVoz(CONV, USU)), { conversacionId: CONV, usuarioId: USU });
});

test("cambiar la carga (otra conversación u otro usuario) invalida la firma", () => {
  const [, firma] = firmarSesionVoz(CONV, USU).split(".");
  const otra = Buffer.from(JSON.stringify({ c: CONV, u: "33333333-3333-4333-8333-333333333333", exp: Date.now() + 3_600_000 })).toString("base64url");
  assert.equal(verificarSesionVoz(`${otra}.${firma}`), null);
});

test("vencido, mal formado o de otra clave: null", () => {
  assert.equal(verificarSesionVoz(firmarSesionVoz(CONV, USU, -1)), null);
  for (const malo of [undefined, null, 42, "", "sinpunto", "a.b", "a.b.c"]) assert.equal(verificarSesionVoz(malo), null);
  const token = firmarSesionVoz(CONV, USU);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "otra-clave";
  try {
    assert.equal(verificarSesionVoz(token), null);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  }
});

test("sin la clave de servicio no firma", () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => firmarSesionVoz(CONV, USU), /SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  }
});
