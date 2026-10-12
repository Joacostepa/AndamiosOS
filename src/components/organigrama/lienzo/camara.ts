"use client";

// La cámara del Lienzo vivo: tres motion values (x, y, k) que mueven el «mundo» con un solo
// transform. Nada de re-render por cuadro: el paneo, el zoom y los vuelos escriben directo en
// los motion values.
//
// GESTOS
// - Paneo: arrastrar el fondo (mouse) o el dedo en cualquier lado (touch, salvo que una
//   presión larga lo convierta en arrastre de un puesto o una persona).
// - Zoom: rueda del mouse o pinch del trackpad (ctrl + rueda) hacia el cursor; pinch con dos
//   dedos en el celular. El scroll de dos dedos del trackpad panea.
// - Vuelos (encuadrar, centrar en un puesto, recorrido): springs; con «reducir movimiento»,
//   saltos.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { animate, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { acotar, ZOOM_MAX, ZOOM_MIN, zoomHacia, type Camara } from "@/lib/organigrama/layout";
import { useArrastre } from "./arrastre";

export const RESORTE_CAMARA = { type: "spring" as const, stiffness: 90, damping: 20, mass: 1 };
const RESORTE_ZOOM = { type: "spring" as const, stiffness: 260, damping: 32 };

export type ApiCamara = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  k: MotionValue<number>;
  actual: () => Camara;
  /** Vuela (o salta) a una cámara. */
  ir: (c: Camara, opciones?: { animar?: boolean; suave?: boolean }) => void;
  /** Zoom por un factor alrededor de un punto de la pantalla (relativo al lienzo). */
  zoom: (factor: number, foco?: { x: number; y: number }) => void;
  detener: () => void;
};

export function useCamara(tamano: { w: number; h: number }): ApiCamara {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const k = useMotionValue(1);
  const reducido = useReducedMotion();

  const detener = useCallback(() => {
    x.stop();
    y.stop();
    k.stop();
  }, [x, y, k]);

  const actual = useCallback(() => ({ x: x.get(), y: y.get(), k: k.get() }), [x, y, k]);

  const ir = useCallback<ApiCamara["ir"]>(
    (c, opciones = {}) => {
      detener();
      if (opciones.animar === false || reducido) {
        x.set(c.x);
        y.set(c.y);
        k.set(c.k);
        return;
      }
      const t = opciones.suave === false ? RESORTE_ZOOM : RESORTE_CAMARA;
      animate(x, c.x, t);
      animate(y, c.y, t);
      animate(k, c.k, t);
    },
    [detener, reducido, x, y, k],
  );

  const zoom = useCallback<ApiCamara["zoom"]>(
    (factor, foco) => {
      const f = foco ?? { x: tamano.w / 2, y: tamano.h / 2 };
      ir(zoomHacia(actual(), factor, f), { suave: false });
    },
    [actual, ir, tamano.w, tamano.h],
  );

  return useMemo(() => ({ x, y, k, actual, ir, zoom, detener }), [x, y, k, actual, ir, zoom, detener]);
}

/** Paneo, pinch y rueda sobre el elemento del lienzo. */
export function useGestosCamara(ref: React.RefObject<HTMLElement | null>, cam: ApiCamara) {
  // El gesto se comparte con el arrastre: una presión larga cancela el paneo, y un paneo
  // suprime el clic que sigue.
  const { gesto, ajustarGesto } = useArrastre();
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x0: number; y0: number; cx: number; cy: number; movido: boolean } | null>(null);
  const pinch = useRef<{ d0: number; m0: { x: number; y: number }; cam0: Camara } | null>(null);

  // Rueda: listener nativo NO pasivo para poder frenar el scroll de la página.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      if ((e.target as Element).closest?.("[data-con-scroll]")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const foco = { x: e.clientX - r.left, y: e.clientY - r.top };
      // Pinch del trackpad (ctrl), rueda de mouse (líneas o saltos enteros grandes) → zoom.
      const esMouse = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
      cam.detener();
      if (e.ctrlKey || e.metaKey || esMouse) {
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-acotar(delta, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022));
        const c = zoomHacia(cam.actual(), factor, foco);
        cam.x.set(c.x);
        cam.y.set(c.y);
        cam.k.set(c.k);
      } else {
        cam.x.set(cam.x.get() - e.deltaX);
        cam.y.set(cam.y.get() - e.deltaY);
      }
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [ref, cam]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const t = e.target as Element;
      if (t.closest("[data-sin-pan]")) return;
      if (e.pointerType === "mouse" && (e.button !== 0 || t.closest("[data-arrastrable]") || t.closest("input, textarea"))) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      punteros.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      cam.detener();

      if (punteros.current.size === 2) {
        const [a, b] = [...punteros.current.values()];
        ajustarGesto({ multitouch: true });
        pan.current = null;
        pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam0: cam.actual() };
      } else if (punteros.current.size === 1) {
        pan.current = { x0: e.clientX, y0: e.clientY, cx: cam.x.get(), cy: cam.y.get(), movido: false };
        ajustarGesto({
          cancelarPan: () => {
            pan.current = null;
          },
        });
      }
      if (punteros.current.size > 1) return;

      const mover = (ev: PointerEvent) => {
        if (!punteros.current.has(ev.pointerId)) return;
        const rr = el.getBoundingClientRect();
        punteros.current.set(ev.pointerId, { x: ev.clientX - rr.left, y: ev.clientY - rr.top });
        if (gesto.current.arrastrando) return;
        if (pinch.current && punteros.current.size >= 2) {
          const [a, b] = [...punteros.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const { cam0, d0, m0 } = pinch.current;
          const k = acotar((cam0.k * d) / d0, ZOOM_MIN, ZOOM_MAX);
          const c = zoomHacia(cam0, k / cam0.k, m0);
          cam.x.set(c.x + (m.x - m0.x));
          cam.y.set(c.y + (m.y - m0.y));
          cam.k.set(c.k);
          return;
        }
        const p = pan.current;
        if (!p) return;
        const dx = ev.clientX - p.x0;
        const dy = ev.clientY - p.y0;
        if (!p.movido && Math.hypot(dx, dy) < 3) return;
        p.movido = true;
        cam.x.set(p.cx + dx);
        cam.y.set(p.cy + dy);
      };
      const soltar = (ev: PointerEvent) => {
        punteros.current.delete(ev.pointerId);
        if (punteros.current.size < 2) pinch.current = null;
        if (punteros.current.size > 0) return;
        const suprimir = !!pan.current?.movido || gesto.current.multitouch;
        pan.current = null;
        ajustarGesto({ multitouch: false, cancelarPan: undefined, ...(suprimir ? { suprimirClick: true } : {}) });
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [cam, gesto, ajustarGesto, ref],
  );

  return { onPointerDown };
}
