// Helper JSON-RPC reutilizable para scripts de administración de Odoo (.mjs).
// Correr los scripts con: node --env-file=.env.local scripts/<script>.mjs
//
// Espeja src/lib/odoo/client.ts pero en JS plano para uso desde Node CLI
// (los scripts no pueden importar el .ts de la app sin transpilar).
//
// Solo server-side: usa ODOO_API_KEY. Nunca importar desde el browser.

function getConfig() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  const faltantes = [
    !url && "ODOO_URL",
    !db && "ODOO_DB",
    !username && "ODOO_USERNAME",
    !apiKey && "ODOO_API_KEY",
  ].filter(Boolean);
  if (faltantes.length) {
    throw new Error(`Faltan variables de entorno de Odoo: ${faltantes.join(", ")}`);
  }
  return { url: url.replace(/\/+$/, ""), db, username, apiKey };
}

let rpcId = 0;

async function jsonRpc(service, method, args) {
  const cfg = getConfig();
  const res = await fetch(`${cfg.url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: ++rpcId,
    }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.error) {
    const msg = json.error.data?.message || json.error.message || "Error Odoo";
    const err = new Error(msg);
    err.data = json.error.data;
    throw err;
  }
  return json.result;
}

let cachedUid = null;

export function version() {
  return jsonRpc("common", "version", []);
}

export async function authenticate() {
  if (cachedUid !== null) return cachedUid;
  const cfg = getConfig();
  const uid = await jsonRpc("common", "authenticate", [cfg.db, cfg.username, cfg.apiKey, {}]);
  if (!uid) throw new Error("Autenticación con Odoo fallida");
  cachedUid = uid;
  return uid;
}

export async function executeKw(model, method, args = [], kwargs = {}) {
  const cfg = getConfig();
  const uid = await authenticate();
  return jsonRpc("object", "execute_kw", [cfg.db, uid, cfg.apiKey, model, method, args, kwargs]);
}

export function searchRead(model, domain = [], fields = [], opts = {}) {
  return executeKw(model, "search_read", [domain], { fields, ...opts });
}

export function searchCount(model, domain = []) {
  return executeKw(model, "search_count", [domain]);
}

export function read(model, ids, fields = []) {
  return executeKw(model, "read", [ids], { fields });
}

export function create(model, values) {
  return executeKw(model, "create", [values]);
}

export function write(model, ids, values) {
  return executeKw(model, "write", [ids, values]);
}

export function fieldsGet(model, attributes = ["string", "type", "required", "relation", "selection"]) {
  return executeKw(model, "fields_get", [], { attributes });
}
