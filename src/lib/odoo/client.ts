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

// DECISIÓN (rate limiting): Odoo Online limita la CONCURRENCIA, no solo el volumen.
// Medido contra la instancia real: 6 llamadas simultáneas devuelven 429 en la mitad,
// mientras que las mismas 6 de a dos pasan todas. Por eso toda llamada pasa por esta
// cola: como máximo MAX_CONCURRENTES en vuelo, y las demás esperan turno.
//
// Es global al módulo, así que protege a TODOS los consumidores (tablero, sync,
// webhooks, push) sin que cada uno tenga que acordarse de no abusar del Promise.all.
const MAX_CONCURRENTES = 2;
let enVuelo = 0;
const espera: (() => void)[] = [];

async function tomarTurno(): Promise<void> {
  if (enVuelo < MAX_CONCURRENTES) {
    enVuelo++;
    return;
  }
  await new Promise<void>((resolve) => espera.push(resolve));
  enVuelo++;
}

function liberarTurno(): void {
  enVuelo--;
  espera.shift()?.();
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reintentos ante 429 / 503: Odoo Online responde con una página HTML de "Rate limit
// exceeded", no con un error de aplicación. Se respeta Retry-After si viene, y si no
// se hace backoff exponencial con jitter para no volver todos juntos.
const MAX_INTENTOS = 3;

function esperaDeReintento(res: Response, intento: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5000);
  return 300 * 2 ** intento + Math.random() * 200;
}

/** Llamada cruda a JSON-RPC, ya encolada y con reintentos. */
async function jsonRpc<T>(
  service: JsonRpcService,
  method: string,
  args: unknown[],
): Promise<T> {
  await tomarTurno();
  try {
    return await jsonRpcSinCola<T>(service, method, args);
  } finally {
    liberarTurno();
  }
}

// Maneja errores de transporte (HTTP) y de aplicación (el objeto `error` que devuelve
// Odoo dentro de un 200).
async function jsonRpcSinCola<T>(
  service: JsonRpcService,
  method: string,
  args: unknown[],
): Promise<T> {
  const cfg = getConfig();

  let res: Response | undefined;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
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

    if (res.status !== 429 && res.status !== 503) break;
    if (intento === MAX_INTENTOS - 1) break;
    await dormir(esperaDeReintento(res, intento));
  }

  if (!res) throw new OdooError(`No se pudo conectar con Odoo (${cfg.url})`);

  if (!res.ok) {
    const detalle =
      res.status === 429
        ? "Odoo está limitando las consultas (demasiadas a la vez). Probá de nuevo en unos segundos."
        : `Odoo respondió HTTP ${res.status} ${res.statusText}`;
    throw new OdooError(detalle);
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

// El login es lo que Odoo Online limita más fuerte (son intentos de autenticación).
// Sin esto, N llamadas concurrentes en un lambda frío disparan N logins simultáneos y
// la mitad vuelve 429. Guardando la promesa en vuelo, todas comparten el mismo login.
let loginEnVuelo: Promise<number> | null = null;

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
  if (!force) {
    if (cachedUid !== null) return cachedUid;
    // ODOO_UID (opcional) evita el login por completo. El uid del usuario de
    // integración es estable, y en serverless cada instancia fría se loguea de nuevo:
    // con esta variable seteada, nunca se toca el endpoint que Odoo más limita.
    const uidFijo = Number(process.env.ODOO_UID);
    if (Number.isInteger(uidFijo) && uidFijo > 0) {
      cachedUid = uidFijo;
      return cachedUid;
    }
    if (loginEnVuelo) return loginEnVuelo;
  }

  const cfg = getConfig();
  const promesa = jsonRpc<number | false>("common", "authenticate", [
    cfg.db,
    cfg.username,
    cfg.apiKey,
    {},
  ])
    .then((uid) => {
      if (!uid) {
        throw new OdooError(
          "Autenticación con Odoo fallida. Revisá ODOO_DB, ODOO_USERNAME y ODOO_API_KEY.",
        );
      }
      cachedUid = uid;
      return uid;
    })
    .finally(() => {
      loginEnVuelo = null;
    });

  loginEnVuelo = promesa;
  return promesa;
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
