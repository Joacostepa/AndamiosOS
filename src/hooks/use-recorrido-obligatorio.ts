"use client";

import { useEffect, useRef, useState } from "react";
import type { Config, Driver, DriveStep, Side, Alignment } from "driver.js";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { crearDriver } from "@/lib/recorridos/driver";
import { dispositivoRecorrido, type RecorridoPendiente } from "@/lib/recorridos/registro";
import {
  ATRIBUTO_RECORRIDO_ACTIVO,
  BIENVENIDA,
  DATA_TOUR,
  EVENTOS,
  PASOS_RECORRIDO,
  TIPOS,
  TIPOS_REPORTE,
  TOAST_RECORRIDO,
  type DetalleAbrirReporte,
} from "@/lib/sistemas/tipos";

/**
 * El recorrido obligatorio de «Reportar» (propuesta §5, decisión 3; contrato §8).
 *
 * QUÉ LO HACE OBLIGATORIO: no se puede cerrar ni saltear. Sin Esc, sin clic afuera, sin «Atrás»,
 * sin teclado (salvo Tab y Enter sobre el propio globo) y con la pantalla de abajo inerte. Se
 * marca como hecho recién al tocar «Entendido»; si recarga a mitad, vuelve a empezar desde la
 * bienvenida (no se guarda el progreso: es lo más robusto).
 *
 * QUÉ LE PIDE AL PANEL DE REPORTE: no importa componentes de Sistemas. Dispara
 * `sistemas:abrir-reporte` ({ modo: "recorrido" }: sin captura, sin trampa de foco y sin poder
 * cerrarlo) antes del paso 2 y `sistemas:cerrar-reporte` antes del 5, y espera a que aparezcan
 * las anclas `data-tour`. Si un ancla no aparece en 3 s, el paso sale centrado: el recorrido
 * nunca se traba por un componente que no está.
 *
 * MIENTRAS CORRE, `<html>` lleva ATRIBUTO_RECORRIDO_ACTIVO: «Reportar» no captura, y los tours
 * opcionales de Habilitaciones no arrancan encima.
 */
export function useRecorridoObligatorio(
  pendiente: RecorridoPendiente | null,
  { habilitado }: { habilitado: boolean },
): { activo: boolean } {
  // esperando → corriendo → terminado. Una vez que arranca, cambiar de pantalla (el botón
  // «atrás» del navegador sigue andando) no lo corta: sólo lo termina «Entendido» o desmontar.
  const [fase, setFase] = useState<"esperando" | "corriendo" | "terminado">("esperando");
  const corrida = useRef<Corrida | null>(null);

  const clave = pendiente?.clave ?? null;
  const version = pendiente?.version ?? null;
  const pasosTotal = pendiente?.pasos ?? PASOS_RECORRIDO.length;

  useEffect(() => {
    if (!clave || version === null || !habilitado || fase !== "esperando") return;
    const control = new AbortController();
    void (async () => {
      // Ya tocó «Entendido» en este dispositivo pero no se pudo guardar: no se lo vuelve a
      // pedir, se reintenta guardar en silencio.
      if (await hayPendienteLocal(clave, version)) {
        if (control.signal.aborted) return;
        setFase("terminado");
        void reintentarPendiente();
        return;
      }
      const listo = await esperarPaginaQuieta(control.signal);
      if (!listo || control.signal.aborted) return;
      setFase("corriendo");
      corrida.current = iniciarRecorrido({
        alTerminar: () => {
          corrida.current = null;
          setFase("terminado");
          void marcarVisto(clave, version, pasosTotal);
        },
      });
    })();
    return () => control.abort();
  }, [clave, version, pasosTotal, habilitado, fase]);

  // Sólo al desmontar (salir del dashboard): no dejar el overlay ni el atributo colgados.
  useEffect(() => () => {
    corrida.current?.cortar();
    corrida.current = null;
  }, []);

  return { activo: fase === "corriendo" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────

const ANCLA_REPORTAR = `[data-tour="${DATA_TOUR.reportar}"]`;
/** «Unos 600 ms después de que exista el botón» (contrato §8.3): que la pantalla se asiente. */
const RESPIRO_MS = 600;
/** Lo que espera cada ancla antes de mostrar el paso centrado. */
const ESPERA_ANCLA_MS = 3000;

/**
 * El primer elemento VISIBLE que cumple `selector`. Si una pantalla tuviera dos copias (una
 * para el celular y otra para la compu, con `hidden sm:flex`), la oculta mide 0×0 y driver.js
 * recortaría la esquina de arriba a la izquierda.
 */
function anclaVisible(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return el;
  }
  return null;
}

const dormir = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { window.clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Espera a que la página esté quieta: el botón Reportar en pantalla, un respiro, la pestaña
 * visible, ningún otro driver.js corriendo (un tour de Habilitaciones abierto), ningún diálogo
 * modal abierto y el navegador ocioso. Devuelve false si se canceló.
 */
async function esperarPaginaQuieta(signal: AbortSignal): Promise<boolean> {
  while (!signal.aborted && !anclaVisible(ANCLA_REPORTAR)) await dormir(250, signal);
  await dormir(RESPIRO_MS, signal);
  const ocupada = () =>
    document.hidden ||
    window.location.pathname.startsWith("/cambiar-clave") ||
    document.body.classList.contains("driver-active") ||
    // Los diálogos de Base UI no ponen aria-modal: se los reconoce por data-open. Si arrancara
    // con uno abierto (el panel de reporte a medio escribir, un formulario), el clic en el
    // fondo de driver.js lo cerraría y se perdería lo cargado: se espera a que lo cierren.
    !!document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open], [role="dialog"][aria-modal="true"]') ||
    !anclaVisible(ANCLA_REPORTAR);
  while (!signal.aborted && ocupada()) await dormir(500, signal);
  if (signal.aborted) return false;
  await new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else window.setTimeout(resolve, 50);
  });
  return !signal.aborted && !ocupada();
}

/**
 * Espera a que exista `selector` y se quede quieto (el panel entra deslizándose: si driver.js
 * mide en mitad de la animación, el recorte queda corrido). Devuelve el elemento o null si no
 * apareció a tiempo. Corta igual al vencer aunque la pestaña esté en segundo plano (ahí no
 * corren los requestAnimationFrame).
 */
function esperarAncla(selector: string, ms: number): Promise<Element | null> {
  return new Promise((resolve) => {
    let anterior = "";
    let quietos = 0;
    let listo = false;
    const fin = (el: Element | null) => {
      if (listo) return;
      listo = true;
      window.clearTimeout(vence);
      resolve(el);
    };
    const vence = window.setTimeout(() => fin(anclaVisible(selector)), ms);
    const mirar = () => {
      if (listo) return;
      const el = anclaVisible(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        const ahora = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
        quietos = ahora === anterior ? quietos + 1 : 0;
        anterior = ahora;
        if (quietos >= 3) return fin(el);
      }
      window.requestAnimationFrame(mirar);
    };
    mirar();
  });
}

/** Espera a que `selector` deje de estar (el panel cerrándose antes del paso de la campanita). */
function esperarQueSeVaya(selector: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const hasta = Date.now() + ms;
    const mirar = () => {
      if (!document.querySelector(selector) || Date.now() > hasta) return resolve();
      window.setTimeout(mirar, 50);
    };
    mirar();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El recorrido
// ─────────────────────────────────────────────────────────────────────────────

type Corrida = { cortar: () => void };

const CONFIG_OBLIGATORIO: Config = {
  allowClose: false,
  allowKeyboardControl: false,
  overlayClickBehavior: () => {},
  disableActiveInteraction: true,
  showButtons: ["next"],
  popoverClass: "tour-aba obligatorio",
  smoothScroll: true,
  // Por si algo interno de driver.js pidiera cerrar: sólo lo cierra `d.destroy()`, que no
  // pasa por acá.
  onDestroyStarted: () => {},
};

/** Dónde va el globo de cada paso. Si no entra (celular), driver.js elige otro lado. */
const UBICACION: Record<(typeof DATA_TOUR)[keyof typeof DATA_TOUR], { side: Side; align: Alignment }> = {
  [DATA_TOUR.reportar]: { side: "bottom", align: "end" },
  [DATA_TOUR.captura]: { side: "left", align: "start" },
  [DATA_TOUR.tipos]: { side: "left", align: "center" },
  [DATA_TOUR.mandar]: { side: "top", align: "end" },
  [DATA_TOUR.campanita]: { side: "bottom", align: "end" },
};

// lucide «clock», para «1 minuto · 5 pasos» (el globo de driver.js es HTML, no React).
const RELOJ =
  '<svg class="tour-reloj" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

function puntos(k: number, total: number): string {
  const i = Array.from({ length: total }, (_, n) => `<i class="${n < k ? "on" : ""}"></i>`).join("");
  return `<span class="tour-puntos" aria-hidden="true">${i}</span>`;
}

/** Bienvenida + los 5 pasos. Los textos salen de tipos.ts (constantes, sin datos de nadie). */
function armarPasos(): DriveStep[] {
  const total = PASOS_RECORRIDO.length;
  const chips = TIPOS_REPORTE.map((t) => `<span class="tour-chip t-${t}">${TIPOS[t].etiqueta}</span>`).join("");
  const bienvenida: DriveStep = {
    popover: {
      title: `<span class="tour-eyebrow">${BIENVENIDA.eyebrow}</span>${BIENVENIDA.titulo}`,
      description: `<p>${BIENVENIDA.texto}</p><span class="tour-chips">${chips}</span>`,
      popoverClass: "tour-aba obligatorio bienvenida",
      showProgress: true,
      progressText: `${RELOJ}${BIENVENIDA.duracion}`,
      nextBtnText: BIENVENIDA.boton,
    },
  };
  const pasos = PASOS_RECORRIDO.map((p, i): DriveStep => ({
    // Una función y no el selector: así driver.js toma la copia visible. Si devuelve null
    // (el ancla no apareció), driver.js muestra el globo centrado.
    element: (() => anclaVisible(`[data-tour="${p.ancla}"]`)) as () => Element,
    popover: {
      title: `<span class="tour-paso">Paso ${i + 1} de ${total}</span>${p.titulo}`,
      description: p.texto,
      showProgress: true,
      progressText: puntos(i + 1, total),
      nextBtnText: p.boton,
      ...UBICACION[p.ancla],
    },
  }));
  return [bienvenida, ...pasos];
}

/**
 * Sin teclado: driver.js ya ignora Esc y las flechas (allowKeyboardControl: false), pero
 * debajo siguen escuchando otros (⌘K, el Esc de un diálogo, los atajos de cada pantalla). Se
 * corta todo en la captura de `window`, antes que nadie, salvo Tab (driver.js lo atrapa dentro
 * del globo) y Enter/espacio sobre el propio globo, para tocar «Siguiente» con el teclado.
 */
function bloquearTeclado(): () => void {
  const cortar = (e: KeyboardEvent) => {
    if (e.key === "Tab") return;
    const enGlobo = e.target instanceof Element && !!e.target.closest(".driver-popover");
    if (enGlobo && (e.key === "Enter" || e.key === " ")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const tipos = ["keydown", "keyup", "keypress"] as const;
  for (const t of tipos) window.addEventListener(t, cortar, true);
  return () => { for (const t of tipos) window.removeEventListener(t, cortar, true); };
}

function iniciarRecorrido({ alTerminar }: { alTerminar: () => void }): Corrida {
  const html = document.documentElement;
  html.setAttribute(ATRIBUTO_RECORRIDO_ACTIVO, "");
  const soltarTeclado = bloquearTeclado();
  const pasos = armarPasos();
  let panelAbierto = false;
  let ocupado = false;
  let terminado = false;
  let refresco: number | undefined;

  const limpiar = () => {
    if (terminado) return;
    terminado = true;
    window.clearTimeout(refresco);
    soltarTeclado();
    html.removeAttribute(ATRIBUTO_RECORRIDO_ACTIVO);
    if (panelAbierto) window.dispatchEvent(new CustomEvent(EVENTOS.cerrarReporte));
    panelAbierto = false;
    d.destroy();
  };

  // Un segundo después de cada paso se vuelve a medir: el panel puede terminar de acomodarse
  // (el contador de Mis reportes, una fuente que carga) y el recorte quedaría corrido.
  const remedir = () => {
    window.clearTimeout(refresco);
    refresco = window.setTimeout(() => { if (!terminado) d.refresh(); }, 500);
  };

  const avanzar = async () => {
    if (ocupado || terminado) return;
    ocupado = true;
    const boton = d.getState("popover")?.nextButton as HTMLButtonElement | undefined;
    if (boton) boton.disabled = true;
    try {
      const i = d.getActiveIndex() ?? 0;
      if (i >= pasos.length - 1) {
        limpiar();
        alTerminar();
        return;
      }
      // pasos[0] es la bienvenida: el que viene es PASOS_RECORRIDO[i].
      const siguiente = PASOS_RECORRIDO[i];
      if (siguiente.antes === "abrir-panel") {
        const detalle: DetalleAbrirReporte = { modo: "recorrido" };
        window.dispatchEvent(new CustomEvent(EVENTOS.abrirReporte, { detail: detalle }));
        panelAbierto = true;
      } else if (siguiente.antes === "cerrar-panel") {
        window.dispatchEvent(new CustomEvent(EVENTOS.cerrarReporte));
        panelAbierto = false;
        // El panel tapa el costado del header: si se recorta la campanita con el panel todavía
        // saliendo, el hueco muestra el panel.
        await esperarQueSeVaya(`[data-tour="${DATA_TOUR.mandar}"]`, 1000);
      }
      await esperarAncla(`[data-tour="${siguiente.ancla}"]`, ESPERA_ANCLA_MS);
      if (terminado) return;
      // Si el ancla no apareció, driver.js no la encuentra y muestra el globo centrado.
      d.moveNext();
      remedir();
    } finally {
      ocupado = false;
    }
  };

  const d: Driver = crearDriver({
    ...CONFIG_OBLIGATORIO,
    steps: pasos,
    onNextClick: () => void avanzar(),
  });
  d.drive(0);

  return { cortar: limpiar };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardar que lo hizo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Si tocó «Entendido» y no se pudo guardar (sin red, la sesión vencida), queda anotado en este
 * dispositivo: mientras esté, el recorrido no le vuelve a salir acá y se reintenta en cada carga.
 * Lleva el usuario: en una compu compartida, al de al lado le sigue tocando.
 */
const CLAVE_PENDIENTE = "recorrido-pendiente";
type Pendiente = { uid: string; clave: string; version: number; pasosTotal: number; dispositivo: string };

function leerPendiente(): Pendiente | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_PENDIENTE);
    const p = crudo ? (JSON.parse(crudo) as Partial<Pendiente>) : null;
    return p && typeof p.uid === "string" && typeof p.clave === "string" && typeof p.version === "number"
      ? { uid: p.uid, clave: p.clave, version: p.version, pasosTotal: Number(p.pasosTotal) || 0, dispositivo: String(p.dispositivo ?? "") }
      : null;
  } catch {
    return null;
  }
}

function escribirPendiente(p: Pendiente | null): void {
  try {
    if (p) window.localStorage.setItem(CLAVE_PENDIENTE, JSON.stringify(p));
    else window.localStorage.removeItem(CLAVE_PENDIENTE);
  } catch {
    // Sin almacenamiento (ventana privada): vuelve a salir en la próxima carga, como antes.
  }
}

async function uidActual(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function hayPendienteLocal(clave: string, version: number): Promise<boolean> {
  const p = leerPendiente();
  if (!p || p.clave !== clave || p.version !== version) return false;
  return p.uid === (await uidActual());
}

/** Un insert; true si quedó guardado (un 23505 es que ya estaba: lo terminó en otra pestaña). */
async function insertarVisto(clave: string, version: number, pasosTotal: number, dispositivo: string): Promise<boolean> {
  try {
    const { error } = await createClient()
      .from("recorridos_vistos")
      .insert({ clave, version, pasos_total: pasosTotal, dispositivo: dispositivo || null });
    if (!error || error.code === "23505") return true;
    console.warn("No se pudo guardar el recorrido:", error.message);
  } catch (e) {
    console.warn("No se pudo guardar el recorrido:", e instanceof Error ? e.message : e);
  }
  return false;
}

/** Hasta 3 intentos con espera creciente (0, 1 y 3 s). */
async function insertarConReintentos(clave: string, version: number, pasosTotal: number, dispositivo: string): Promise<boolean> {
  for (const espera of [0, 1000, 3000]) {
    if (espera) await new Promise((r) => window.setTimeout(r, espera));
    if (await insertarVisto(clave, version, pasosTotal, dispositivo)) return true;
  }
  return false;
}

async function reintentarPendiente(): Promise<void> {
  const p = leerPendiente();
  if (!p) return;
  if (await insertarConReintentos(p.clave, p.version, p.pasosTotal, p.dispositivo)) escribirPendiente(null);
}

/**
 * Guarda que lo hizo. El `usuario_id` sale del default `auth.uid()` (la RLS sólo deja insertar
 * a nombre propio). Reintenta; si igual falla, lo anota en este dispositivo (ver arriba) para
 * no volver a pedírselo acá y reintentar en la próxima carga.
 */
async function marcarVisto(clave: string, version: number, pasosTotal: number): Promise<void> {
  toast.success(TOAST_RECORRIDO.titulo, { description: TOAST_RECORRIDO.detalle });
  let dispositivo = "";
  try {
    dispositivo = dispositivoRecorrido(
      navigator.userAgent,
      window.innerWidth,
      window.innerHeight,
      navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches,
    );
  } catch {
    // Sin datos del dispositivo se guarda igual.
  }
  if (await insertarConReintentos(clave, version, pasosTotal, dispositivo)) return;
  const uid = await uidActual();
  if (uid) escribirPendiente({ uid, clave, version, pasosTotal, dispositivo });
}
