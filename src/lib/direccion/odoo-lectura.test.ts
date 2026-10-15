import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EscrituraProhibidaError, exigirLectura, llamarLectura, METODOS_PERMITIDOS, searchRead, urlOdoo } from "./odoo-lectura.ts";

// Odoo de mentira: registra cada pedido. Si un método de escritura llegara a la red, el
// test lo ve en `pedidos`.
type Pedido = { model: string; method: string };
let pedidos: Pedido[] = [];
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  pedidos = [];
  process.env.ODOO_URL = "https://odoo.prueba";
  process.env.ODOO_DB = "db";
  process.env.ODOO_USERNAME = "dir";
  process.env.ODOO_API_KEY = "clave";
  process.env.ODOO_UID = "7";
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}");
    const args = body.params?.args ?? [];
    pedidos.push({ model: args[3], method: args[4] });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

const PROHIBIDOS = [
  "write", "create", "unlink", "copy", "message_post", "action_post", "action_confirm", "action_cancel",
  "button_draft", "button_cancel", "action_register_payment", "toggle_active", "name_create", "Write", " search_read", "",
];

test("rechaza write, create, unlink, action_* y button_* SIN llamar a Odoo", async () => {
  for (const metodo of PROHIBIDOS) {
    assert.throws(() => exigirLectura(metodo), EscrituraProhibidaError, `exigirLectura("${metodo}") tenía que tirar`);
    await assert.rejects(llamarLectura("account.move", metodo, [[1]], {}), EscrituraProhibidaError, `llamarLectura("${metodo}") tenía que rechazar`);
  }
  assert.equal(pedidos.length, 0, "ningún pedido de escritura llegó a la red");
});

test("deja pasar sólo los métodos de lectura", async () => {
  assert.deepEqual([...METODOS_PERMITIDOS].sort(), ["fields_get", "formatted_read_group", "read", "read_group", "search_count", "search_read"]);
  for (const m of METODOS_PERMITIDOS) assert.doesNotThrow(() => exigirLectura(m));
  await searchRead("res.currency.rate", [["currency_id.name", "=", "USD"]], ["name"], { limit: 1 });
  assert.deepEqual(pedidos, [{ model: "res.currency.rate", method: "search_read" }]);
});

test("no exporta nada que escriba", async () => {
  const mod = await import("./odoo-lectura.ts");
  const nombres = Object.keys(mod);
  for (const n of nombres) assert.doesNotMatch(n, /^(write|create|unlink|executeKw|exec|call)$/i, `exporta "${n}"`);
});

test("urlOdoo arma el link de lectura y no acepta basura", () => {
  assert.equal(urlOdoo("account.move", 1234), "https://odoo.prueba/odoo/account.move/1234");
  assert.equal(urlOdoo("account.move", 0), undefined);
  assert.equal(urlOdoo("account.move/../x", 1), undefined);
});

test("motivoPublico: nunca manda al navegador la URL ni el error crudo de Odoo", async () => {
  const { motivoPublico, OdooError } = await import("./odoo-lectura.ts");
  assert.equal(motivoPublico(new OdooError("No se pudo conectar con Odoo (https://empresa.odoo.com)")), "Odoo no respondió. Probá de nuevo en unos minutos.");
  assert.doesNotMatch(motivoPublico(new OdooError("ValueError: Invalid field 'x' on model 'y'")), /Invalid|model/);
  assert.equal(motivoPublico(new OdooError("Odoo no respondió en 45 s. Probá de nuevo en un momento.")), "Odoo no respondió en 45 s. Probá de nuevo en un momento.");
  assert.equal(motivoPublico(new Error("boom")), "No se pudo calcular.");
});
