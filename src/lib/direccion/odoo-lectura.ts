// El ÚNICO acceso a Odoo de Dirección, y es de SÓLO LECTURA garantizado por código.
//
// La app se conecta a Odoo con un usuario que puede escribir (push de OT, partes, …). Para
// que Dirección no pueda escribir ni por error, todo pasa por acá: se valida el método
// contra una lista permitida ANTES de llamar, y cualquier otro (write, create, unlink,
// action_*, button_*, message_post, …) tira EscrituraProhibidaError sin tocar la red.
//
// Reutiliza el transporte de src/lib/odoo/client.ts (autenticación, cola de concurrencia,
// reintentos ante 429) importando SÓLO `executeKw`. Nunca importa create/write ni ningún
// helper de src/lib/odoo/ que escriba. Un test (odoo-lectura.test.ts) lo verifica, y otro
// (guardia.test.ts) verifica que ningún otro archivo de Dirección importe src/lib/odoo/.

import { executeKw, OdooError, type OpcionesRpc } from "../odoo/client.ts";

export { OdooError };

/**
 * El motivo de un error de Odoo en palabras para quien mira. NUNCA el mensaje crudo: puede
 * traer la URL del servidor de Odoo o el error interno. Sólo pasan tal cual los dos avisos
 * que escribimos nosotros (tiempo agotado y límite de consultas); el resto, texto fijo.
 * El detalle va al log del servidor.
 */
export function motivoPublico(e: unknown): string {
  if (e instanceof OdooError && /^(Odoo no respondió en \d+ s\.|Odoo está limitando las consultas)/.test(e.message)) return e.message;
  return e instanceof OdooError ? "Odoo no respondió. Probá de nuevo en unos minutos." : "No se pudo calcular.";
}

export const METODOS_PERMITIDOS = ["search_read", "read", "search_count", "read_group", "formatted_read_group", "fields_get"] as const;
export type MetodoLectura = (typeof METODOS_PERMITIDOS)[number];

const PERMITIDOS = new Set<string>(METODOS_PERMITIDOS);

export class EscrituraProhibidaError extends Error {
  readonly metodo: string;
  constructor(metodo: string) {
    super(`Dirección sólo lee Odoo: el método "${metodo}" no está permitido.`);
    this.name = "EscrituraProhibidaError";
    this.metodo = metodo;
  }
}

/** Tira si el método no es de lectura. Exportada para el test. */
export function exigirLectura(metodo: string): asserts metodo is MetodoLectura {
  if (typeof metodo !== "string" || !PERMITIDOS.has(metodo)) throw new EscrituraProhibidaError(String(metodo));
}

/**
 * Cuánto se espera a Odoo por llamada. Una consulta colgada no puede dejar una pantalla
 * esperando para siempre: pasado esto, OdooError y se muestra el último snapshot.
 */
export const TIMEOUT_MS = 45_000;

/** La primitiva: valida y recién después llama. Todo lo demás de este archivo pasa por acá. */
export async function llamarLectura<T = unknown>(
  modelo: string,
  metodo: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
  opciones: OpcionesRpc = {},
): Promise<T> {
  exigirLectura(metodo);
  return executeKw<T>(modelo, metodo, args, kwargs, { timeoutMs: TIMEOUT_MS, ...opciones });
}

export type Dominio = unknown[];
type OpcionesBusqueda = { limit?: number; offset?: number; order?: string; context?: Record<string, unknown>; timeoutMs?: number };

export function searchRead<T = Record<string, unknown>>(modelo: string, dominio: Dominio, campos: string[], opts: OpcionesBusqueda = {}): Promise<T[]> {
  const { context, timeoutMs, ...resto } = opts;
  return llamarLectura<T[]>(modelo, "search_read", [dominio], { fields: campos, ...resto, ...(context ? { context } : {}) }, timeoutMs ? { timeoutMs } : {});
}

export function read<T = Record<string, unknown>>(modelo: string, ids: number[], campos: string[]): Promise<T[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return llamarLectura<T[]>(modelo, "read", [ids], { fields: campos });
}

export function searchCount(modelo: string, dominio: Dominio): Promise<number> {
  return llamarLectura<number>(modelo, "search_count", [dominio]);
}

/**
 * read_group clásico: `campos` con agregados ("balance:sum"), `agrupar` ("account_id",
 * "date:month"). lazy=false para agrupar por todos los campos a la vez.
 */
export function readGroup<T = Record<string, unknown>>(
  modelo: string,
  dominio: Dominio,
  campos: string[],
  agrupar: string[],
  opts: { lazy?: boolean; orderby?: string; limit?: number; offset?: number } = {},
): Promise<T[]> {
  return llamarLectura<T[]>(modelo, "read_group", [dominio, campos, agrupar], { lazy: opts.lazy ?? false, ...(opts.orderby ? { orderby: opts.orderby } : {}), ...(opts.limit ? { limit: opts.limit } : {}), ...(opts.offset ? { offset: opts.offset } : {}) });
}

/** formatted_read_group (Odoo 18+): `agrupar` y `agregados` ("balance:sum", "__count"). */
export function formattedReadGroup<T = Record<string, unknown>>(
  modelo: string,
  dominio: Dominio,
  agrupar: string[],
  agregados: string[],
  opts: { order?: string; limit?: number; offset?: number } = {},
): Promise<T[]> {
  return llamarLectura<T[]>(modelo, "formatted_read_group", [dominio, agrupar, agregados], { ...opts });
}

export function fieldsGet(modelo: string, atributos: string[] = ["string", "type", "relation", "selection"]): Promise<Record<string, Record<string, unknown>>> {
  return llamarLectura(modelo, "fields_get", [], { attributes: atributos });
}

/**
 * search_read paginado hasta el final (o hasta `tope`, y avisa). Para listas grandes
 * (todas las líneas de deudores, todas las facturas del año). Ordenar por algo estable.
 */
export async function searchReadTodo<T = Record<string, unknown>>(
  modelo: string,
  dominio: Dominio,
  campos: string[],
  opts: { order?: string; pagina?: number; tope?: number } = {},
): Promise<T[]> {
  const pagina = opts.pagina ?? 2000;
  const tope = opts.tope ?? 50_000;
  const order = opts.order ?? "id asc";
  const salida: T[] = [];
  for (let offset = 0; offset < tope; offset += pagina) {
    const filas = await searchRead<T>(modelo, dominio, campos, { order, limit: pagina, offset });
    salida.push(...filas);
    if (filas.length < pagina) return salida;
  }
  console.warn(`[direccion] ${modelo}: se llegó al tope de ${tope} filas; faltan datos`);
  return salida;
}

/**
 * Link de sólo lectura a un registro ("↗ Odoo"): {ODOO_URL}/odoo/{modelo}/{id}.
 * Lo arma el servidor (ODOO_URL no llega al navegador). No es una llamada a Odoo.
 */
export function urlOdoo(modelo: string, id: number): string | undefined {
  const base = process.env.ODOO_URL?.replace(/\/+$/, "");
  if (!base || !Number.isInteger(id) || id <= 0 || !/^[a-z0-9_.]+$/.test(modelo)) return undefined;
  return `${base}/odoo/${modelo}/${id}`;
}
