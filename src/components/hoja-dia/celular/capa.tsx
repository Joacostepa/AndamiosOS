"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Una capa modal dentro del celular (la hoja inferior de "No pude", el visor de planos):
// toma el foco al abrirse, lo encierra (Tab da la vuelta), Escape la cierra y al cerrarse
// el foco vuelve al botón que la abrió.

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Capa({
  className, etiqueta, etiquetadaPor, onCerrar, children, onTecla,
}: {
  className: string;
  etiqueta?: string;
  etiquetadaPor?: string;
  onCerrar: () => void;
  children: ReactNode;
  onTecla?: (e: KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  const tecla = useRef(onTecla);
  useEffect(() => {
    cerrar.current = onCerrar;
    tecla.current = onTecla;
  });

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const primero = el?.querySelector<HTMLElement>("[data-autofoco]") ?? el?.querySelector<HTMLElement>(FOCUSABLES);
    primero?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!el) return;
      if (e.key === "Escape") { e.preventDefault(); cerrar.current(); return; }
      if (e.key === "Tab") {
        const fs = [...el.querySelectorAll<HTMLElement>(FOCUSABLES)].filter((x) => x.offsetParent !== null);
        if (!fs.length) return;
        const [a, z] = [fs[0], fs[fs.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        return;
      }
      tecla.current?.(e);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (antes && document.contains(antes)) antes.focus();
    };
  }, []);

  return (
    <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={etiqueta} aria-labelledby={etiquetadaPor}>
      {children}
    </div>
  );
}
