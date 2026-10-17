/**
 * Sistemas: el saneado en el servidor del contexto automático que manda el navegador
 * (ContextoCliente de tipos.ts, lo arma src/lib/sistemas/contexto-cliente.ts).
 *
 * EL NAVEGADOR NO ES DE FIAR, NI POR MALICIA NI POR DESCUIDO: un console.error puede traer
 * un token de Supabase, una URL con ?code= de un login, el mail de un cliente. Antes de
 * guardarlo (y de que lo lea un revisor o un prompt de Claude Code) se limpia acá:
 *
 *   · JWT → [jwt], «Bearer …» → Bearer [token], mails → [email].
 *   · Fuera de las URLs y de las rutas (también de las que aparecen citadas dentro de un
 *     mensaje de error o un stack) los parámetros token, apikey, access_token, code,
 *     signature y key (también en el hash, donde Supabase deja el access_token).
 *   · Textos recortados (mensaje 1000, stack 2000, URL 500) y listas en LIMITES.
 *   · El total queda por debajo de LIMITES.contextoBytes: primero se recortan los stacks y
 *     después se descartan los más viejos.
 *   · Lo que no tiene la forma esperada se descarta y queda el valor vacío.
 *
 * PURA: la usan la API y los tests de node:test.
 */

import { LIMITES, type ContextoCliente, type ErrorCliente, type PedidoFallido, type RutaVisitada } from "./tipos.ts";

const JWT = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Parámetros que nunca se guardan (comparados sin mayúsculas). */
export const PARAMETROS_SENSIBLES = ["token", "apikey", "access_token", "refresh_token", "code", "signature", "key"] as const;
const SENSIBLES = new Set<string>(PARAMETROS_SENSIBLES);

/** Una URL suelta dentro de un texto (un console.error que la cita entera, un stack). */
const URL_EN_TEXTO = /https?:\/\/[^\s"'<>]+/g;

/**
 * Saca de un texto libre los parámetros sensibles de las URLs que cita (un ?code= de un login,
 * un key=AIza… en un mensaje de error), los JWT, los «Bearer …» y los mails.
 */
export function sanearTexto(texto: unknown, max: number): string {
  if (typeof texto !== "string") return "";
  const limpio = recortar(texto, max * 2) // primero un recorte grueso: las regex no corren sobre megas
    .replace(URL_EN_TEXTO, (u) => sinParametrosSensibles(u))
    .replace(JWT, "[jwt]")
    .replace(BEARER, "$1 [token]")
    .replace(EMAIL, "[email]");
  return recortar(limpio, max);
}

function recortar(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Saca los parámetros sensibles de una query o de un hash («a=1&token=x» → «a=1»). */
function sanearParametros(qs: string): string {
  return qs
    .split("&")
    .filter((par) => {
      if (!par) return false;
      const nombre = decodificar(par.split("=")[0] ?? "").toLowerCase();
      return !SENSIBLES.has(nombre);
    })
    .join("&");
}

function decodificar(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/**
 * Una URL o una ruta sin los parámetros sensibles, ni en la query ni en el hash, y sin JWT ni
 * mails en el path. Sirve para las URLs de los pedidos y para la ruta del reporte.
 */
export function sanearUrl(url: unknown, max: number = 500): string {
  if (typeof url !== "string") return "";
  return sanearTexto(sinParametrosSensibles(url.trim().slice(0, 4000)), max);
}

/** La URL sin los parámetros sensibles en la query ni en el hash. No recorta ni toca el resto. */
function sinParametrosSensibles(url: string): string {
  let s = url;
  let hash = "";
  const iHash = s.indexOf("#");
  if (iHash >= 0) {
    hash = s.slice(iHash + 1);
    s = s.slice(0, iHash);
  }
  let query = "";
  const iQuery = s.indexOf("?");
  if (iQuery >= 0) {
    query = s.slice(iQuery + 1);
    s = s.slice(0, iQuery);
  }
  query = sanearParametros(query);
  // El hash puede ser un ancla (#seccion) o parámetros (#access_token=…): sólo se filtra si
  // tiene forma de parámetros.
  if (hash.includes("=")) hash = sanearParametros(hash);
  return `${s}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/** La ruta del reporte (location.pathname + search), saneada y en hasta 2000 letras. */
export function sanearRuta(ruta: unknown): string {
  return sanearUrl(ruta, 2000);
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numero = (v: unknown, min: number, max: number, porDefecto: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : porDefecto;
const fecha = (v: unknown): string => {
  if (typeof v !== "string") return "";
  const t = Date.parse(v);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
};

const TIPOS_ERROR: readonly ErrorCliente["tipo"][] = ["error", "rechazo", "console.error", "console.warn"];

function sanearError(v: unknown): ErrorCliente | null {
  if (!esObjeto(v)) return null;
  const tipo = TIPOS_ERROR.includes(v.tipo as ErrorCliente["tipo"]) ? (v.tipo as ErrorCliente["tipo"]) : "error";
  const mensaje = sanearTexto(v.mensaje, 1000);
  if (!mensaje) return null;
  const e: ErrorCliente = { tipo, mensaje, at: fecha(v.at) };
  const stack = sanearTexto(v.stack, 2000);
  if (stack) e.stack = stack;
  const fuente = sanearUrl(v.fuente, 500);
  if (fuente) e.fuente = fuente;
  return e;
}

function sanearPedido(v: unknown): PedidoFallido | null {
  if (!esObjeto(v)) return null;
  const url = sanearUrl(v.url, 500);
  if (!url) return null;
  const metodo = typeof v.metodo === "string" && /^[A-Za-z]{1,10}$/.test(v.metodo) ? v.metodo.toUpperCase() : "GET";
  const p: PedidoFallido = {
    metodo,
    url,
    status: Math.round(numero(v.status, 0, 999, 0)),
    duracionMs: Math.round(numero(v.duracionMs, 0, 3_600_000, 0)),
    at: fecha(v.at),
  };
  const vercelId = sanearTexto(v.vercelId, 200);
  if (vercelId) p.vercelId = vercelId;
  return p;
}

function sanearRutaVisitada(v: unknown): RutaVisitada | null {
  if (!esObjeto(v)) return null;
  const ruta = sanearUrl(v.ruta, 500);
  return ruta ? { ruta, at: fecha(v.at) } : null;
}

/** Los últimos `max` válidos (los buffers guardan del más viejo al más nuevo). */
function lista<T>(v: unknown, sanear: (x: unknown) => T | null, max: number): T[] {
  if (!Array.isArray(v)) return [];
  const salida: T[] = [];
  for (const x of v.slice(-max * 3)) {
    const s = sanear(x);
    if (s) salida.push(s);
  }
  return salida.slice(-max);
}

export function contextoVacio(): ContextoCliente {
  return {
    version: 1,
    ruta: "",
    tituloPantalla: "",
    sha: "",
    navegador: { userAgent: "", idioma: "", tactil: false, online: true, zonaHoraria: "" },
    pantalla: { ancho: 0, alto: 0, dpr: 1, tema: "claro" },
    dispositivo: "",
    errores: [],
    pedidos: [],
    rutas: [],
  };
}

const pesa = (c: ContextoCliente): number => JSON.stringify(c).length;

/** El contexto que manda el navegador, listo para guardar. Nunca tira. */
export function sanearContexto(crudo: unknown, limite: number = LIMITES.contextoBytes): ContextoCliente {
  const c = contextoVacio();
  if (!esObjeto(crudo)) return c;
  try {
    c.ruta = sanearRuta(crudo.ruta);
    c.tituloPantalla = sanearTexto(crudo.tituloPantalla, 200);
    c.sha = typeof crudo.sha === "string" ? crudo.sha.trim().slice(0, 64).replace(/[^\w.-]/g, "") : "";
    if (esObjeto(crudo.navegador)) {
      const n = crudo.navegador;
      c.navegador = {
        userAgent: sanearTexto(n.userAgent, 500),
        idioma: sanearTexto(n.idioma, 20),
        tactil: n.tactil === true,
        online: n.online !== false,
        zonaHoraria: sanearTexto(n.zonaHoraria, 60),
      };
    }
    if (esObjeto(crudo.pantalla)) {
      const p = crudo.pantalla;
      c.pantalla = {
        ancho: Math.round(numero(p.ancho, 0, 20_000, 0)),
        alto: Math.round(numero(p.alto, 0, 20_000, 0)),
        dpr: numero(p.dpr, 0.1, 10, 1),
        tema: p.tema === "oscuro" ? "oscuro" : "claro",
      };
    }
    c.dispositivo = sanearTexto(crudo.dispositivo, 200);
    c.errores = lista(crudo.errores, sanearError, LIMITES.errores);
    c.pedidos = lista(crudo.pedidos, sanearPedido, LIMITES.pedidos);
    c.rutas = lista(crudo.rutas, sanearRutaVisitada, LIMITES.rutas);
  } catch {
    return contextoVacio();
  }
  return achicar(c, limite);
}

/**
 * Lo deja por debajo del límite. Primero los stacks (lo más pesado y lo menos necesario:
 * el mensaje y la fuente ya dicen dónde), después se descartan los más viejos, de a uno.
 */
function achicar(c: ContextoCliente, limite: number): ContextoCliente {
  if (pesa(c) < limite) return c;
  for (const e of c.errores) if (e.stack && e.stack.length > 300) e.stack = recortar(e.stack, 300);
  if (pesa(c) < limite) return c;
  for (const e of c.errores) delete e.stack;
  while (pesa(c) >= limite && (c.errores.length || c.pedidos.length || c.rutas.length)) {
    // El más largo de los tres pierde su elemento más viejo.
    const mayor = [c.errores, c.pedidos, c.rutas].reduce((a, b) => (b.length > a.length ? b : a));
    mayor.shift();
  }
  if (pesa(c) >= limite) {
    c.navegador.userAgent = recortar(c.navegador.userAgent, 200);
    c.tituloPantalla = recortar(c.tituloPantalla, 100);
    c.ruta = recortar(c.ruta, 500);
  }
  return c;
}
