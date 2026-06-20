// Cliente Odoo vía JSON-RPC (endpoint /jsonrpc).
//
// IMPORTANTE: Este módulo es SOLO server-side — usa ODOO_API_KEY, que nunca debe
// llegar al browser. Toda llamada a Odoo pasa por route handlers (src/app/api/...),
// jamás se importa desde un componente "use client".
//
// DECISIÓN: Se usa JSON-RPC sobre fetch en lugar de XML-RPC para no agregar
// dependencias (no hace falta el paquete `xmlrpc`) y porque fetch corre nativo
// en los route handlers de Next.
//
// REGLA DE NEGOCIO (arquitectura): Odoo es la fuente de verdad comercial/administrativa
// (clientes, CRM, cotizaciones, facturación, flota). La app es la capa operativa.
// Por ahora la integración es casi toda lectura Odoo→app; ver memoria del proyecto.

export type OdooConfig = {
  url: string;
  db: string;
  username: string;
  apiKey: string;
};

export class OdooError extends Error {
  constructor(
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "OdooError";
  }
}

// Lee la config desde el entorno. Lanza un error claro si falta algo, así el
// problema se detecta al primer uso y no como un fallo críptico de red.
function getConfig(): OdooConfig {
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

  if (faltantes.length > 0) {
    throw new OdooError(
      `Faltan variables de entorno de Odoo: ${faltantes.join(", ")}. ` +
        `Configuralas en .env.local (ver .env.example).`,
    );
  }

  // Normaliza la URL (sin barra final) para construir /jsonrpc sin duplicar barras.
  return { url: url!.replace(/\/+$/, ""), db: db!, username: username!, apiKey: apiKey! };
}

type JsonRpcService = "common" | "object" | "db";

let rpcId = 0;

// Llamada cruda a JSON-RPC. Maneja errores de transporte (HTTP) y de aplicación
// (el objeto `error` que devuelve Odoo dentro de un 200).
async function jsonRpc<T>(
  service: JsonRpcService,
  method: string,
  args: unknown[],
): Promise<T> {
  const cfg = getConfig();

  let res: Response;
  try {
    res = await fetch(`${cfg.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: ++rpcId,
      }),
      // Las llamadas a Odoo nunca se cachean: son datos vivos.
      cache: "no-store",
    });
  } catch (e) {
    throw new OdooError(`No se pudo conectar con Odoo (${cfg.url})`, e);
  }

  if (!res.ok) {
    throw new OdooError(`Odoo respondió HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    result?: T;
    error?: { message?: string; data?: { message?: string; name?: string } };
  };

  if (json.error) {
    const msg =
      json.error.data?.message || json.error.message || "Error desconocido de Odoo";
    throw new OdooError(msg, json.error.data);
  }

  return json.result as T;
}

// DECISIÓN: El uid se cachea a nivel módulo. Con autenticación por API key la
// sesión es stateless (db + uid + key viajan en cada llamada), así que el uid es
// estable y no expira; solo lo recalculamos si se pide `force`.
let cachedUid: number | null = null;

/** version() no requiere autenticación: ideal para un health-check de conexión. */
export function odooVersion(): Promise<{
  server_version: string;
  server_serie: string;
  protocol_version: number;
}> {
  return jsonRpc("common", "version", []);
}

/** Devuelve el uid del usuario de integración, autenticando contra `common`. */
export async function authenticate(force = false): Promise<number> {
  if (cachedUid !== null && !force) return cachedUid;

  const cfg = getConfig();
  const uid = await jsonRpc<number | false>("common", "authenticate", [
    cfg.db,
    cfg.username,
    cfg.apiKey,
    {},
  ]);

  if (!uid) {
    throw new OdooError(
      "Autenticación con Odoo fallida. Revisá ODOO_DB, ODOO_USERNAME y ODOO_API_KEY.",
    );
  }

  cachedUid = uid;
  return uid;
}

/**
 * Llama a cualquier método de cualquier modelo de Odoo (la primitiva universal).
 * Ej: executeKw("res.partner", "search_read", [domain], { fields, limit }).
 */
export async function executeKw<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const cfg = getConfig();
  const uid = await authenticate();
  return jsonRpc<T>("object", "execute_kw", [
    cfg.db,
    uid,
    cfg.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ── Helpers de conveniencia sobre los métodos más usados de Odoo ──────────────

export function searchRead<T = Record<string, unknown>>(
  model: string,
  domain: unknown[] = [],
  fields: string[] = [],
  opts: { limit?: number; offset?: number; order?: string; context?: Record<string, unknown> } = {},
): Promise<T[]> {
  const { context, ...rest } = opts;
  return executeKw<T[]>(model, "search_read", [domain], {
    fields,
    ...rest,
    ...(context ? { context } : {}),
  });
}

export function searchCount(model: string, domain: unknown[] = []): Promise<number> {
  return executeKw<number>(model, "search_count", [domain]);
}

export function read<T = Record<string, unknown>>(
  model: string,
  ids: number[],
  fields: string[] = [],
): Promise<T[]> {
  return executeKw<T[]>(model, "read", [ids], { fields });
}

export function create(model: string, values: Record<string, unknown>): Promise<number> {
  return executeKw<number>(model, "create", [values]);
}

export function write(
  model: string,
  ids: number[],
  values: Record<string, unknown>,
): Promise<boolean> {
  return executeKw<boolean>(model, "write", [ids, values]);
}

/**
 * Introspección de campos de un modelo. Útil para descubrir qué campos existen
 * (incluidos los custom `x_...`) y cuáles son obligatorios antes de crear records.
 */
export function fieldsGet(
  model: string,
  attributes: string[] = ["string", "type", "required", "relation", "selection"],
): Promise<Record<string, Record<string, unknown>>> {
  return executeKw(model, "fields_get", [], { attributes });
}
