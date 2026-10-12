"use client";

// Arrastrar y soltar del Lienzo vivo. Un solo sistema para las tres cosas que se agarran
// (herramientas, personas y puestos) y los tres lugares donde se sueltan (un puesto, el tacho y
// el banco de personas).
//
// POR QUÉ PROPIO Y NO dnd-kit: el lienzo está escalado y trasladado por la cámara, y lo que se
// necesita es saber qué hay DEBAJO DEL DEDO en pantalla. `document.elementsFromPoint` + un
// atributo `data-destino` resuelve eso sin medir nada y funciona igual con zoom, con springs a
// mitad de camino y en el celular.
//
// - Mouse: arrastra al moverse 5 px. Touch: con presión larga (380 ms); si el dedo se mueve
//   antes, es un paneo del lienzo (lo decide la cámara).
// - El «fantasma» sigue al puntero con motion values (sin re-render por cada movimiento). Si se
//   suelta donde no se puede, vuelve con un spring a su lugar (rebote).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import type { Herramienta } from "@/lib/organigrama/lienzo";

export type Carga =
  | { tipo: "herramienta"; herramienta: Herramienta }
  | { tipo: "persona"; persona: string; desdeOcupante?: string; desdeNodo?: string }
  | { tipo: "nodo"; clave: string };

export type Destino = { tipo: "nodo"; clave: string } | { tipo: "tacho" } | { tipo: "banco" } | null;

/** Qué hace el fantasma al soltar: desaparecer ahí, volver a su lugar o volar a un punto. */
export type Resultado = { tipo: "ok" } | { tipo: "rebote" } | { tipo: "volar"; a: { x: number; y: number } };

/** Estado compartido con la cámara para no pelear por el mismo gesto. */
export type Gesto = {
  arrastrando: boolean;
  multitouch: boolean;
  /** Después de un paneo o de un arrastre, el clic que sigue no cuenta. */
  suprimirClick: boolean;
  cancelarPan?: () => void;
};

export type Manejador = {
  validar: (carga: Carga, destino: Destino) => boolean;
  onSoltar: (carga: Carga, destino: Destino, valido: boolean) => Resultado;
};

type Ctx = {
  carga: Carga | null;
  destino: Destino;
  volviendo: boolean;
  gesto: React.RefObject<Gesto>;
  /** Para la cámara: marca el gesto en curso (multitouch, cancelar paneo, suprimir el clic). */
  ajustarGesto: (cambios: Partial<Gesto>) => void;
  comenzar: (carga: Carga, punto: { x: number; y: number }, origen: { x: number; y: number }) => void;
  px: MotionValue<number>;
  py: MotionValue<number>;
};

const ArrastreCtx = createContext<Ctx | null>(null);

export function useArrastre(): Ctx {
  const c = useContext(ArrastreCtx);
  if (!c) throw new Error("useArrastre fuera de <ProveedorArrastre>");
  return c;
}

function leerDestino(x: number, y: number): Destino {
  if (typeof document === "undefined") return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const d = (el as HTMLElement).closest?.("[data-destino]")?.getAttribute("data-destino");
    if (!d) continue;
    if (d === "tacho") return { tipo: "tacho" };
    if (d === "banco") return { tipo: "banco" };
    if (d.startsWith("nodo:")) return { tipo: "nodo", clave: d.slice(5) };
  }
  return null;
}

const mismo = (a: Destino, b: Destino) =>
  a === b || (!!a && !!b && a.tipo === b.tipo && (a.tipo !== "nodo" || (b.tipo === "nodo" && a.clave === b.clave)));

/**
 * `manejador` lo llena el lienzo (en un efecto): las reglas de validez y qué pasa al soltar. Se
 * lee solo en los listeners de window, nunca durante el render.
 */
export function ProveedorArrastre({ children, manejador }: { children: React.ReactNode; manejador: React.RefObject<Manejador | null> }) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const reducido = useReducedMotion();
  const [carga, setCarga] = useState<Carga | null>(null);
  const [destino, setDestino] = useState<Destino>(null);
  const [volviendo, setVolviendo] = useState(false);
  const gesto = useRef<Gesto>({ arrastrando: false, multitouch: false, suprimirClick: false });

  const actual = useRef<{ carga: Carga; destino: Destino; origen: { x: number; y: number } } | null>(null);
  const limpiar = useRef<() => void>(() => {});

  const terminar = useCallback(() => {
    limpiar.current();
    actual.current = null;
    gesto.current.arrastrando = false;
    gesto.current.suprimirClick = true;
    window.setTimeout(() => (gesto.current.suprimirClick = false), 0);
  }, []);

  const comenzar = useCallback<Ctx["comenzar"]>(
    (c, punto, origen) => {
      px.set(punto.x);
      py.set(punto.y);
      actual.current = { carga: c, destino: null, origen };
      gesto.current.arrastrando = true;
      setCarga(c);
      setDestino(null);
      setVolviendo(false);

      const mover = (e: PointerEvent) => {
        if (!actual.current) return;
        px.set(e.clientX);
        py.set(e.clientY);
        const d = leerDestino(e.clientX, e.clientY);
        if (!mismo(d, actual.current.destino)) {
          actual.current.destino = d;
          setDestino(d);
        }
      };
      const desaparecer = () => {
        setCarga(null);
        setDestino(null);
        setVolviendo(false);
      };
      const volarA = (a: { x: number; y: number }) => {
        setVolviendo(true);
        setDestino(null);
        if (reducido) return desaparecer();
        const opciones = { type: "spring" as const, stiffness: 420, damping: 32 };
        animate(px, a.x, opciones);
        animate(py, a.y, opciones).then(desaparecer);
      };
      const soltar = (e: PointerEvent) => {
        const a = actual.current;
        if (!a) return;
        const d = leerDestino(e.clientX, e.clientY) ?? a.destino;
        const m = manejador.current;
        const valido = m ? m.validar(a.carga, d) : false;
        terminar();
        const r: Resultado = m ? m.onSoltar(a.carga, d, valido) : { tipo: "rebote" };
        if (r.tipo === "ok") desaparecer();
        else if (r.tipo === "volar") volarA(r.a);
        else volarA(a.origen);
      };
      const cancelar = () => {
        const a = actual.current;
        terminar();
        if (a) volarA(a.origen);
      };
      const tecla = (e: KeyboardEvent) => {
        if (e.key === "Escape") cancelar();
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", cancelar);
      window.addEventListener("keydown", tecla);
      limpiar.current = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", cancelar);
        window.removeEventListener("keydown", tecla);
      };
    },
    [px, py, reducido, terminar, manejador],
  );

  useEffect(() => () => limpiar.current(), []);

  const ajustarGesto = useCallback((cambios: Partial<Gesto>) => {
    Object.assign(gesto.current, cambios);
    if (cambios.suprimirClick) window.setTimeout(() => (gesto.current.suprimirClick = false), 0);
  }, []);

  const valor = useMemo<Ctx>(
    () => ({ carga, destino, volviendo, gesto, ajustarGesto, comenzar, px, py }),
    [carga, destino, volviendo, ajustarGesto, comenzar, px, py],
  );

  return <ArrastreCtx.Provider value={valor}>{children}</ArrastreCtx.Provider>;
}

/** El fantasma que sigue al puntero (en un portal: `fixed` no sirve dentro de un transform). */
export function CapaFantasma({ children }: { children: React.ReactNode }) {
  const { carga, px, py } = useArrastre();
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {carga && (
        <motion.div
          key="fantasma"
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-[60]"
          style={{ x: px, y: py }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.18 } }}
        >
          <div className="-translate-x-1/2 -translate-y-1/2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const UMBRAL_MOUSE = 5;
const UMBRAL_TOUCH = 10;
const PRESION_LARGA = 380;

/**
 * Las props de una FUENTE de arrastre (una herramienta, un avatar, un puesto). El tap / clic
 * normal sigue funcionando: si no llega a arrastrar, el elemento recibe su onClick.
 */
export function useFuenteArrastre(crear: () => Carga | null, deshabilitado = false) {
  const { comenzar, gesto } = useArrastre();
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (deshabilitado || (e.pointerType === "mouse" && e.button !== 0)) return;
      const carga = crear();
      if (!carga) return;
      const r = e.currentTarget.getBoundingClientRect();
      const origen = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const inicio = { x: e.clientX, y: e.clientY };
      let ultimo = inicio;
      const tactil = e.pointerType !== "mouse";
      let timer = 0;
      const limpiar = () => {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", limpiar);
        window.removeEventListener("pointercancel", limpiar);
      };
      const activar = () => {
        limpiar();
        if (gesto.current.multitouch) return;
        gesto.current.cancelarPan?.();
        if (tactil) navigator.vibrate?.(12);
        comenzar(carga, ultimo, origen);
      };
      function mover(ev: PointerEvent) {
        ultimo = { x: ev.clientX, y: ev.clientY };
        const dist = Math.hypot(ultimo.x - inicio.x, ultimo.y - inicio.y);
        if (!tactil && dist > UMBRAL_MOUSE) activar();
        else if (tactil && dist > UMBRAL_TOUCH) limpiar(); // es un paneo
      }
      if (tactil) timer = window.setTimeout(activar, PRESION_LARGA);
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", limpiar);
      window.addEventListener("pointercancel", limpiar);
    },
    [comenzar, crear, deshabilitado, gesto],
  );
  return { onPointerDown, "data-arrastrable": deshabilitado ? undefined : "" };
}
