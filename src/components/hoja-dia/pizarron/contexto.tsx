"use client";

// Lo que el Pizarrón le pasa a sus partes (columnas, fichas, bandeja): el día, la vista
// (pizarron.ts), la ficha elegida para "tocar ficha → tocar destino", lo que se arrastra y
// los gestos. Todos los gestos terminan en las acciones de siempre (gestos-pizarron.ts →
// use-hoja-dia), con el día al instante (optimista.ts).

import { createContext, useContext } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import type { AccionHoja } from "@/lib/hoja-dia/acciones";
import type { Boton } from "@/lib/hoja-dia/estado";
import type { Destino, Gesto, Origen } from "@/lib/hoja-dia/gestos-pizarron";
import type { FichaCamion, VistaPizarron } from "@/lib/hoja-dia/pizarron";

export type Ctx = {
  dia: DiaHoja;
  vista: VistaPizarron;
  ahora: number;
  /** Día pasado o sin permiso de editar: se mira, no se toca. */
  soloLectura: boolean;
  /** La ficha elegida (tocar ficha → tocar destino). */
  sel: { origen: Origen; k: string } | null;
  elegir: (origen: Origen, k: string) => void;
  /** Tocar un destino con una ficha elegida. Devuelve true si lo usó (si no, el toque sigue de largo). */
  tocar: (d: Destino) => boolean;
  /** Teclas sobre una ficha con foco: 1–5 a esa cuadrilla, D al depósito, B a "Sin asignar". */
  teclear: (origen: Origen, k: string, e: React.KeyboardEvent) => void;
  /** Lo que se está arrastrando (para resaltar destinos y el hueco). */
  arrastre: { origen: Origen; k: string } | null;
  /** El destino que está debajo del arrastre. */
  sobre: Destino | null;
  /** Manda acciones de siempre (un aviso con Deshacer para todas). */
  ejecutar: (gs: Gesto[]) => void;
  /** Soltar `o` en `d` sin arrastrar (un menú: "¿Quién pasa cerca?" → un camión). */
  soltarEn: (o: Origen, d: Destino) => void;
  /** El pedido que pidió atención (un aviso que lo nombra). */
  focoPedido: string | null;
  /** Un gesto de la hoja suelto (la estrella, los ±, el horario del camión). */
  hoja: (a: AccionHoja, texto?: string) => void;
  /** El botón de un aviso (los de problemas(), mismos que la vista clásica). */
  boton: (b: Boton, el: HTMLElement) => void;
  /** Los menús de una ficha. */
  menuChofer: (f: FichaCamion, el: HTMLElement) => void;
  menuContratista: (kid: string, el: HTMLElement) => void;
  menuMotivo: (pid: string, el: HTMLElement, ausenciaId: string | null) => void;
  /** El menú ⋯ de una columna (Copiar como hoy, Ver como, Cerrar jornada, Instrucciones, Historial…). */
  menuColumna: (c: number, el: HTMLElement) => void;
  /** El menú de una persona de una columna (a cargo, Pasar a…, No viene…, Nota, Sacar). */
  menuPersona: (c: number, pid: string, el: HTMLElement) => void;
  /** El menú de un contratista de una columna (a cargo, Nota, Quitar). */
  menuContratistaCol: (c: number, kid: string, el: HTMLElement) => void;
  /** Hora y lugar del encuentro de la cuadrilla. */
  menuEncuentro: (c: number, el: HTMLElement) => void;
  /** "Cerrar jornada" (elige la obra sin parte) o, con otId, "Ver parte". */
  cerrarJornada: (c: number, otId?: number) => void;
  /** Abre el recorrido de ese camión (la hoja lateral). */
  recorrido: (veh: string) => void;
  /** Avisos resaltados por el contador de la barra. */
  resaltar: boolean;
  /** La columna que pidió atención (tocar un pin del mapa, "irA"). */
  foco: number | null;
};

export const PizarronCtx = createContext<Ctx | null>(null);
export function usePizarron(): Ctx {
  const c = useContext(PizarronCtx);
  if (!c) throw new Error("usePizarron fuera del Pizarrón");
  return c;
}

/** Prioridad de un destino cuando hay varios debajo del puntero: el más chico gana. */
export const PRIORIDAD: Record<Destino["k"], number> = { camion: 4, gente: 2, camiones: 2, sin: 1, libres: 1, no: 1, pedidos: 1, columna: 0 };
/** `gente` con `sobre` (encima de una ficha) le gana a la lista entera. */
export const prioridadDe = (d: Destino) => PRIORIDAD[d.k] + (d.k === "gente" && d.sobre ? 1 : 0);

export const mismoDestino = (a: Destino | null, b: Destino) => !!a && JSON.stringify(a) === JSON.stringify(b);

/** Una ficha que se arrastra (y, si tiene `destino`, también recibe: un camión, una persona de una columna). */
export function useFicha(id: string, origen: Origen, destino: Destino | null, deshabilitado: boolean) {
  const drag = useDraggable({ id, data: { origen }, disabled: deshabilitado });
  const drop = useDroppable({ id: `sobre:${id}`, data: { destino }, disabled: !destino || deshabilitado });
  const ref = (n: HTMLElement | null) => {
    drag.setNodeRef(n);
    drop.setNodeRef(n);
  };
  return { ref, attributes: drag.attributes, listeners: drag.listeners, arrastrando: drag.isDragging, encima: drop.isOver };
}

/** Una zona que recibe (columna, lista de gente, franja de camiones, cajas de la bandeja). */
export function useZona(id: string, destino: Destino, deshabilitado = false) {
  return useDroppable({ id, data: { destino }, disabled: deshabilitado });
}
