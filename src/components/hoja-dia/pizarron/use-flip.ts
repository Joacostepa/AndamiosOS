"use client";

// Las animaciones del Pizarrón (maqueta: playFlip / landing / bounce), con la Web Animations
// API y la técnica FLIP: después de cada render se mide dónde quedó cada ficha
// (`data-flip="<clave>"`) y, si se movió, se la anima DESDE donde estaba hasta donde está.
// Así una ficha que cambia de columna (al soltarla o porque llegó el día del servidor) viaja
// en vez de saltar, y las demás "se corren" para hacerle lugar.
//
// - Aterrizar: la ficha soltada sale de donde quedó el fantasma del arrastre (`aterrizar`) con
//   un rebote chiquito.
// - Nueva: aparece con un fundido.
// - prefers-reduced-motion: nada se anima (se mide igual).
//
// Las posiciones son de la ventana: si se scrollea sin re-render (la página o la franja de
// columnas), se vuelven a medir sin animar; si no, el próximo render creería que todo se movió.

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Rect = { left: number; top: number };

const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useFlip(raiz: RefObject<HTMLElement | null>, clave: string) {
  const antes = useRef(new Map<string, Rect>());
  const aterrizajes = useRef(new Map<string, Rect>());
  const claveAntes = useRef(clave);

  // Después de CADA render (sin dependencias a propósito): los hijos ya están en el DOM.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    // Otro día: nada viaja (la franja entera entra deslizándose, ver pizarron.tsx).
    const nuevoDia = claveAntes.current !== clave;
    claveAntes.current = clave;
    const quieto = reducido() || nuevoDia;
    const habia = antes.current.size > 0;
    const ahora = new Map<string, Rect>();
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
      const k = n.dataset.flip!;
      if (ahora.has(k)) return; // la misma persona dos veces (chofer de dos renglones): se anima una
      const r = n.getBoundingClientRect();
      ahora.set(k, { left: r.left, top: r.top });
      if (quieto) return;
      const desde = aterrizajes.current.get(k);
      if (desde) {
        aterrizajes.current.delete(k);
        const dx = desde.left - r.left, dy = desde.top - r.top;
        n.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(1.05) rotate(-1.5deg)`, boxShadow: "0 14px 28px rgb(0 0 0 / .22)" },
            { transform: "translate(0, 0) scale(.96)", offset: 0.72 },
            { transform: "scale(1.015)", offset: 0.88 },
            { transform: "none" },
          ],
          { duration: 340, easing: "cubic-bezier(.3,.7,.3,1)" },
        );
        return;
      }
      const r0 = antes.current.get(k);
      if (!r0) {
        if (habia && r.width) n.animate([{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
        return;
      }
      const dx = r0.left - r.left, dy = r0.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    antes.current = ahora;
    aterrizajes.current.clear();
  });

  useEffect(() => {
    let pendiente = 0;
    const medir = () => {
      const el = raiz.current;
      if (!el) return;
      const m = new Map<string, Rect>();
      el.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
        const r = n.getBoundingClientRect();
        m.set(n.dataset.flip!, { left: r.left, top: r.top });
      });
      antes.current = m;
    };
    const alScroll = () => {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        medir();
      });
    };
    window.addEventListener("scroll", alScroll, { capture: true, passive: true });
    window.addEventListener("resize", alScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", alScroll, { capture: true });
      window.removeEventListener("resize", alScroll);
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, [raiz]);

  /** La ficha `k` aterriza desde `r` (donde quedó el fantasma) en el próximo render. */
  const aterrizar = (k: string, r: Rect | null | undefined) => {
    if (r) aterrizajes.current.set(k, { left: r.left, top: r.top });
  };

  /** Un saltito en el lugar (algo que cambió sin moverse: el horario del camión). */
  const rebotar = (k: string) => {
    if (reducido()) return;
    const n = raiz.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(k)}"]`);
    n?.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(.98)" }, { transform: "none" }], { duration: 320, easing: "ease-out" });
  };

  /** "No se puede": la ficha se sacude. */
  const sacudir = (k: string) => {
    if (reducido()) return;
    const n = raiz.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(k)}"]`);
    n?.animate([{ transform: "none" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], { duration: 350 });
  };

  return { aterrizar, rebotar, sacudir };
}
