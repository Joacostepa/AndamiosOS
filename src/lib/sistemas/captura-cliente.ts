/**
 * Sistemas: los buffers circulares que junta el navegador para mandar con cada reporte
 * (docs/sistemas/contrato.md §6.3). Los instala src/instrumentation-client.ts antes de que
 * hidrate React, vía instalarBuffers() de contexto-cliente.ts.
 *
 * Tres listas cortas, sólo en memoria y sólo del navegador de quien reporta:
 *  · errores: window `error`, `unhandledrejection`, console.error y console.warn;
 *  · pedidos: los fetch que vuelven con !res.ok o que no llegan (error de red);
 *  · rutas: las últimas pantallas (onRouterTransitionStart).
 * No se manda nada a ningún lado: armarContexto() las copia recién cuando alguien reporta.
 *
 * REGLA DE ORO: esto corre en TODAS las pantallas y envuelve fetch y console. Todo va en
 * try/catch y siempre se llama al original: jamás puede romper la app.
 *  · El envoltorio de fetch NO lee ni clona el body y devuelve la MISMA Response: el
 *    streaming del asistente y de las descargas sigue igual.
 *  · console.error / console.warn siempre llaman al original, con los mismos argumentos.
 *  · Los pedidos a /api/sistemas/* no se anotan (serían el propio reporte).
 *
 * Las funciones puras de arriba (empujarCircular, urlSinQuery, …) tienen tests en
 * captura-cliente.test.ts; instalarEn() recibe la ventana por parámetro para poder probarla
 * con un objeto falso.
 */

import { LIMITES, type BuffersSistemas, type ErrorCliente, type PedidoFallido, type RutaVisitada } from "./tipos.ts";

/** Recortes del lado del navegador (el servidor vuelve a recortar y sanea). */
const MAX_MENSAJE = 1000;
const MAX_STACK = 2000;
const MAX_URL = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Funciones puras
// ─────────────────────────────────────────────────────────────────────────────

export function crearBuffers(): BuffersSistemas {
  return { errores: [], pedidos: [], rutas: [] };
}

/** Agrega al final y descarta los más viejos para no pasar de `max`. Muta la lista. */
export function empujarCircular<T>(lista: T[], item: T, max: number): void {
  lista.push(item);
  if (lista.length > max) lista.splice(0, lista.length - max);
}

export function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * La URL sin query ni hash. Las de este mismo sitio quedan como ruta (`/api/obras`); las de
 * otro, con su origen (`https://xyz.supabase.co/rest/v1/obras`). La query se va entera: ahí
 * suelen viajar tokens y filtros con datos. Si no se puede leer, corta a mano en ? y #.
 */
export function urlSinQuery(url: string, origen?: string): string {
  try {
    const base = origen && /^https?:/.test(origen) ? origen : "http://local.invalid";
    const u = new URL(url, base);
    const mismoSitio = u.origin === new URL(base).origin;
    return recortar(mismoSitio ? u.pathname : `${u.origin}${u.pathname}`, MAX_URL);
  } catch {
    return recortar(String(url).split(/[?#]/)[0] ?? "", MAX_URL);
  }
}

/** Ruta + query de una URL (para las pantallas visitadas; el servidor saca los parámetros sensibles). */
export function rutaDeUrl(url: string, origen?: string): string {
  try {
    const base = origen && /^https?:/.test(origen) ? origen : "http://local.invalid";
    const u = new URL(url, base);
    return recortar(`${u.pathname}${u.search}`, MAX_URL);
  } catch {
    return recortar(String(url).split("#")[0] ?? "", MAX_URL);
  }
}

/** Los pedidos del propio módulo no se anotan: serían el reporte (o sus imágenes) hablando de sí mismo. */
export function esPedidoIgnorado(url: string): boolean {
  return /^\/api\/sistemas(\/|$)/.test(url) || /\/storage\/v1\/object\/upload\/sign\/sistemas\//.test(url);
}

/** Un texto legible de cualquier cosa (el motivo de un rechazo, un argumento de console). */
export function describir(valor: unknown): string {
  try {
    if (valor instanceof Error) return valor.message ? `${valor.name}: ${valor.message}` : valor.name;
    if (typeof valor === "string") return valor;
    if (valor === undefined) return "undefined";
    if (valor === null) return "null";
    if (typeof valor === "object") {
      // Una Response, un Event o un nodo del DOM no se serializan bien: alcanza con el tipo.
      const nombre = (valor as object).constructor?.name;
      if (nombre && nombre !== "Object" && nombre !== "Array") return `[${nombre}]`;
      return JSON.stringify(valor) ?? String(valor);
    }
    return String(valor);
  } catch {
    return "[sin texto]";
  }
}

/**
 * Lo que dijo console.error / console.warn, en una línea. Respeta el %s / %o del primer
 * argumento de forma simple (React los usa) y busca un Error entre los argumentos para el stack.
 */
export function textoDeConsola(args: readonly unknown[]): { mensaje: string; stack?: string } {
  const partes: string[] = [];
  let stack: string | undefined;
  let resto = [...args];
  if (typeof resto[0] === "string" && /%[sdifoOc]/.test(resto[0])) {
    let i = 1;
    const formato = resto[0].replace(/%[sdifoOc]/g, (m) => {
      if (m === "%c") { i++; return ""; } // estilos de consola: se tiran
      return i < resto.length ? describir(resto[i++]) : m;
    });
    resto = [formato, ...resto.slice(i)];
  }
  for (const a of resto) {
    if (a instanceof Error && !stack && a.stack) stack = recortar(a.stack, MAX_STACK);
    partes.push(describir(a));
  }
  return { mensaje: recortar(partes.join(" "), MAX_MENSAJE), stack };
}

function ahora(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro en los buffers (lo usan los envoltorios)
// ─────────────────────────────────────────────────────────────────────────────

export function anotarError(b: BuffersSistemas, e: Omit<ErrorCliente, "at">): void {
  const item: ErrorCliente = { tipo: e.tipo, mensaje: recortar(e.mensaje || "(sin mensaje)", MAX_MENSAJE), at: ahora() };
  if (e.stack) item.stack = recortar(e.stack, MAX_STACK);
  if (e.fuente) item.fuente = recortar(e.fuente, MAX_URL);
  empujarCircular(b.errores, item, LIMITES.errores);
}

export function anotarPedido(b: BuffersSistemas, p: Omit<PedidoFallido, "at">): void {
  const item: PedidoFallido = { ...p, at: ahora() };
  if (!item.vercelId) delete item.vercelId;
  empujarCircular(b.pedidos, item, LIMITES.pedidos);
}

/** Suma una pantalla visitada. No repite la última (un replace a la misma ruta no es otra pantalla). */
export function anotarRuta(b: BuffersSistemas, ruta: string): void {
  if (!ruta) return;
  const ultima = b.rutas[b.rutas.length - 1];
  if (ultima?.ruta === ruta) return;
  const item: RutaVisitada = { ruta, at: ahora() };
  empujarCircular(b.rutas, item, LIMITES.rutas);
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalación (window o un objeto falso en los tests)
// ─────────────────────────────────────────────────────────────────────────────

type Escucha = (e: unknown) => void;

/** Lo que usa instalarEn() de la ventana. `window` lo cumple; los tests pasan un objeto falso. */
export type VentanaInstalable = {
  fetch?: typeof fetch;
  console: Pick<Console, "error" | "warn">;
  addEventListener: (tipo: string, escucha: Escucha) => void;
  location?: { origin: string; pathname: string; search: string };
  performance?: { now(): number };
};

/** Marca en la función envuelta, para no envolver dos veces (Fast Refresh, doble import). */
const MARCA = "__aosSistemas";

function metodoDe(input: unknown, init: RequestInit | undefined): string {
  const m = init?.method ?? (typeof input === "object" && input && "method" in input ? (input as Request).method : undefined);
  return (m || "GET").toUpperCase();
}

function urlDe(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input && "url" in input) return String((input as Request).url);
  return String(input);
}

/**
 * Engancha los envoltorios en `w` y los hace escribir en `b`. Cada paso en su propio try:
 * si uno falla (un navegador raro, una propiedad congelada) los demás quedan igual.
 */
export function instalarEn(w: VentanaInstalable, b: BuffersSistemas): void {
  const origen = (() => {
    try {
      return w.location?.origin;
    } catch {
      return undefined;
    }
  })();
  const reloj = () => {
    try {
      return w.performance?.now() ?? Date.now();
    } catch {
      return 0;
    }
  };

  // ---- errores sueltos y promesas rechazadas ----
  try {
    w.addEventListener("error", (ev) => {
      try {
        const e = ev as Partial<ErrorEvent>;
        const fuente = e.filename ? `${e.filename}:${e.lineno ?? 0}:${e.colno ?? 0}` : undefined;
        const err = e.error as unknown;
        anotarError(b, {
          tipo: "error",
          mensaje: e.message || describir(err),
          stack: err instanceof Error ? err.stack : undefined,
          fuente,
        });
      } catch {
        /* nunca */
      }
    });
    w.addEventListener("unhandledrejection", (ev) => {
      try {
        const motivo = (ev as Partial<PromiseRejectionEvent>).reason as unknown;
        anotarError(b, { tipo: "rechazo", mensaje: describir(motivo), stack: motivo instanceof Error ? motivo.stack : undefined });
      } catch {
        /* nunca */
      }
    });
  } catch {
    /* sin addEventListener: seguimos con lo demás */
  }

  // ---- console.error / console.warn ----
  for (const nivel of ["error", "warn"] as const) {
    try {
      const original = w.console[nivel] as ((...a: unknown[]) => void) & { [MARCA]?: true };
      if (typeof original !== "function" || original[MARCA]) continue;
      let anotando = false;
      const envuelto = function (this: unknown, ...args: unknown[]) {
        // Si anotar dispara otro console.error (no debería), no entramos en bucle.
        if (!anotando) {
          anotando = true;
          try {
            const { mensaje, stack } = textoDeConsola(args);
            anotarError(b, { tipo: nivel === "error" ? "console.error" : "console.warn", mensaje, stack });
          } catch {
            /* nunca */
          } finally {
            anotando = false;
          }
        }
        return original.apply(this, args);
      } as typeof original;
      envuelto[MARCA] = true;
      w.console[nivel] = envuelto;
    } catch {
      /* console de sólo lectura: sin errores de consola */
    }
  }

  // ---- fetch ----
  try {
    const original = w.fetch as (typeof fetch & { [MARCA]?: true }) | undefined;
    if (typeof original === "function" && !original[MARCA]) {
      const envuelto = function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        let metodo = "GET";
        let url = "";
        let inicio = 0;
        let anotar = false;
        try {
          metodo = metodoDe(input, init);
          url = urlSinQuery(urlDe(input), origen);
          inicio = reloj();
          anotar = !esPedidoIgnorado(url);
        } catch {
          anotar = false;
        }
        // Siempre el fetch original con los argumentos tal cual; `this` = la ventana (fetch
        // tira «Illegal invocation» con otro this).
        // eslint-disable-next-line prefer-rest-params
        const promesa = Reflect.apply(original, w, arguments) as Promise<Response>;
        if (!anotar) return promesa;
        return promesa.then(
          (res) => {
            try {
              // type "opaque" (no-cors) siempre viene con status 0 y ok false: no es una falla.
              if (!res.ok && res.type !== "opaque" && res.type !== "opaqueredirect") {
                anotarPedido(b, {
                  metodo,
                  url,
                  status: res.status,
                  duracionMs: Math.max(0, Math.round(reloj() - inicio)),
                  vercelId: res.headers?.get?.("x-vercel-id") ?? undefined,
                });
              }
            } catch {
              /* nunca */
            }
            return res; // la MISMA Response: no se lee ni se clona el body
          },
          (err: unknown) => {
            try {
              // Cancelar un pedido (React Query, un AbortController) no es un error de red.
              const nombre = (err as { name?: string } | null)?.name;
              if (nombre !== "AbortError") {
                anotarPedido(b, { metodo, url, status: 0, duracionMs: Math.max(0, Math.round(reloj() - inicio)) });
              }
            } catch {
              /* nunca */
            }
            throw err;
          },
        );
      } as typeof fetch & { [MARCA]?: true };
      envuelto[MARCA] = true;
      w.fetch = envuelto;
    }
  } catch {
    /* fetch de sólo lectura: sin pedidos fallidos */
  }

  // ---- la pantalla en la que arrancó (las siguientes llegan por onRouterTransitionStart) ----
  try {
    if (w.location) anotarRuta(b, rutaDeUrl(`${w.location.pathname}${w.location.search}`, origen));
  } catch {
    /* nunca */
  }
}
