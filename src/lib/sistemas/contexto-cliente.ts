/**
 * Sistemas: el contexto automático que acompaña cada reporte (docs/sistemas/contrato.md §6.3).
 *
 *  · instalarBuffers(): engancha los buffers circulares de captura-cliente.ts en
 *    window[CLAVE_BUFFERS]. Lo llama src/instrumentation-client.ts antes de que hidrate React;
 *    si por algo no corrió, armarContexto() lo instala igual (y sólo tendrá lo de ahí en más).
 *  · registrarRuta(url): suma una pantalla visitada (onRouterTransitionStart).
 *  · armarContexto(): la foto del momento en que alguien toca «Mandar»: ruta, título de la
 *    pantalla, navegador, medidas, tema, versión (NEXT_PUBLIC_SHA) y una COPIA de los buffers.
 *
 * Nada de esto tira: ante cualquier problema devuelve lo que pudo juntar. El servidor
 * (contexto.ts, de la API) sanea todo de nuevo: tokens, emails, parámetros sensibles y tamaños.
 */

import { CLAVE_BUFFERS, describirDispositivo, type BuffersSistemas, type ContextoCliente } from "./tipos.ts";
import { anotarRuta, crearBuffers, instalarEn, recortar, rutaDeUrl, type VentanaInstalable } from "./captura-cliente.ts";

/** El commit del bundle que tiene abierto (next.config.ts lo inyecta en el build). */
const SHA = process.env.NEXT_PUBLIC_SHA || "local";

const CLAVE_INSTALADO = `${CLAVE_BUFFERS}Instalado`;

type VentanaConBuffers = Window & { [CLAVE_BUFFERS]?: BuffersSistemas; [CLAVE_INSTALADO]?: true };

function ventana(): VentanaConBuffers | null {
  return typeof window === "undefined" ? null : (window as VentanaConBuffers);
}

/** Los buffers de esta pestaña (los crea si no estaban). null fuera del navegador. */
function buffers(): BuffersSistemas | null {
  const w = ventana();
  if (!w) return null;
  const b = w[CLAVE_BUFFERS];
  if (b && Array.isArray(b.errores) && Array.isArray(b.pedidos) && Array.isArray(b.rutas)) return b;
  const nuevos = crearBuffers();
  w[CLAVE_BUFFERS] = nuevos;
  return nuevos;
}

export function instalarBuffers(): void {
  try {
    const w = ventana();
    if (!w || w[CLAVE_INSTALADO]) return;
    const b = buffers();
    if (!b) return;
    w[CLAVE_INSTALADO] = true;
    instalarEn(w as unknown as VentanaInstalable, b);
  } catch {
    /* jamás rompe la app */
  }
}

export function registrarRuta(url: string): void {
  try {
    const b = buffers();
    if (!b) return;
    anotarRuta(b, rutaDeUrl(url, ventana()?.location.origin));
  } catch {
    /* nunca */
  }
}

/**
 * El título de la pantalla: el primer h1 del contenido principal (fuera del panel, del editor
 * y de lo que no sale en la foto); si no hay, document.title sin el « | AndamiosOS» del final.
 */
export function tituloDePantalla(h1: string | null | undefined, titulo: string | null | undefined): string {
  const limpio = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const desdeH1 = limpio(h1);
  if (desdeH1) return recortar(desdeH1, 200);
  const doc = limpio(titulo).replace(/\s*[|·–—-]\s*AndamiosOS\s*$/i, "").trim();
  return recortar(doc || limpio(titulo), 200);
}

function leerH1(): string | null {
  const candidatos = document.querySelectorAll("main h1, h1");
  for (const el of Array.from(candidatos)) {
    if (el.closest('[data-capture="exclude"], [role="dialog"]')) continue;
    const t = el.textContent?.trim();
    if (t) return t;
  }
  return null;
}

function contextoVacio(): ContextoCliente {
  return {
    version: 1,
    ruta: "",
    tituloPantalla: "",
    sha: SHA,
    navegador: { userAgent: "", idioma: "", tactil: false, online: true, zonaHoraria: "" },
    pantalla: { ancho: 0, alto: 0, dpr: 1, tema: "claro" },
    dispositivo: "",
    errores: [],
    pedidos: [],
    rutas: [],
  };
}

/** Cada lectura por separado: si una falla (un navegador raro), las demás llegan igual. */
function intentar<T>(f: () => T, porDefecto: T): T {
  try {
    const v = f();
    return v ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

export function armarContexto(): ContextoCliente {
  const c = contextoVacio();
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return c;
    instalarBuffers();

    c.ruta = intentar(() => `${location.pathname}${location.search}`, "");
    c.tituloPantalla = intentar(() => tituloDePantalla(leerH1(), document.title), "");

    const nav = typeof navigator === "undefined" ? null : navigator;
    c.navegador = {
      userAgent: intentar(() => nav?.userAgent ?? "", ""),
      idioma: intentar(() => nav?.language ?? "", ""),
      tactil: intentar(() => (nav?.maxTouchPoints ?? 0) > 0 || matchMedia("(pointer: coarse)").matches, false),
      online: intentar(() => nav?.onLine ?? true, true),
      zonaHoraria: intentar(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "", ""),
    };
    c.pantalla = {
      ancho: intentar(() => Math.round(window.innerWidth), 0),
      alto: intentar(() => Math.round(window.innerHeight), 0),
      dpr: intentar(() => Math.round((window.devicePixelRatio || 1) * 100) / 100, 1),
      // next-themes con attribute="class" (src/app/layout.tsx): <html class="dark">.
      tema: intentar(() => (document.documentElement.classList.contains("dark") ? "oscuro" : "claro"), "claro"),
    };
    c.dispositivo = intentar(() => describirDispositivo(c.navegador.userAgent, c.pantalla.ancho, c.pantalla.alto), "");

    // Copias: el panel puede quedar abierto un rato y los buffers siguen llenándose.
    const b = buffers();
    if (b) {
      c.errores = b.errores.map((e) => ({ ...e }));
      c.pedidos = b.pedidos.map((p) => ({ ...p }));
      c.rutas = b.rutas.map((r) => ({ ...r }));
    }
  } catch {
    /* lo que se pudo juntar */
  }
  return c;
}
