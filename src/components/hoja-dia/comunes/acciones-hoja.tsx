"use client";

// El hueco del encabezado compartido (layout de /planificacion/hoja) donde cada vista pone
// su resumen y sus botones ("3 de 5 listas · 0 enviadas", "Ausencias", el coral). La vista
// los declara donde quiera con <AccionesHoja> y aparecen arriba, en la fila del día.

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const Ctx = createContext<{ hueco: HTMLElement | null; setHueco: (el: HTMLElement | null) => void } | null>(null);

export function ProveedorHuecoHoja({ children }: { children: ReactNode }) {
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  return <Ctx.Provider value={{ hueco, setHueco }}>{children}</Ctx.Provider>;
}

/** El `ref` del div del encabezado que recibe las acciones. */
export function useRefHueco() {
  return useContext(Ctx)?.setHueco;
}

export function AccionesHoja({ children }: { children: ReactNode }) {
  const hueco = useContext(Ctx)?.hueco ?? null;
  return hueco ? createPortal(children, hueco) : null;
}
