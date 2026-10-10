"use client";

// Lo que comparten las partes de la vista Camiones: el día, la hora, si se puede tocar,
// el modo "poner en un camión" y los que abren menús, diálogos y avisos. Lo arma
// vista-camiones.tsx; las partes lo leen con useCamiones().

import { createContext, useContext } from "react";
import type { Boton } from "@/lib/hoja-dia/estado";
import type { AccionPedido, AccionViaje, Resultado } from "@/lib/hoja-dia/acciones";
import type { DiaHoja, Fecha, Minutos, Punto } from "@/lib/hoja-dia/tipos";

export type MenuAbierto =
  | { t: "viaje"; id: string; anchor: HTMLElement; paso?: "pasar" }
  | { t: "fila"; veh: string; anchor: HTMLElement }
  | { t: "ped"; id: string; anchor: HTMLElement; paso?: "esperar" | "anular" }
  | { t: "cajon"; anchor: HTMLElement };

export type Ctx = {
  dia: DiaHoja;
  fecha: Fecha;
  ahora: Minutos;
  hoy: boolean;
  /** Día que ya pasó: sólo lectura. */
  pasado: boolean;
  /** Ancho chico: todo con toques, sin arrastrar, lista en vez de línea de tiempo. */
  angosta: boolean;
  lista: boolean;
  /** El pedido que se está poniendo en un camión (§9 "Cómo se despacha"). */
  poner: string | null;
  setPoner: (id: string | null) => void;
  /** Poner el pedido elegido en un camión (con la posición si vino de soltar). */
  ponerEn: (veh: string, orden?: number | null, sobre?: string | null, pedidoId?: string) => void;
  abrirMenu: (m: MenuAbierto) => void;
  /** Ejecuta un botón de los avisos (`Boton.a`, la tabla del contrato). */
  boton: (b: Boton, el?: HTMLElement | null) => void;
  /** "Avisar a Gómez": Telegram con un toque, o el respaldo a mano. */
  avisar: (pid: string) => void;
  nuevoPedido: (pref?: { que?: string; hacia?: Punto | null; cajonPendienteId?: string }) => void;
  abrirFlete: (pedidoId?: string) => void;
  /** Mover una ficha (arrastrar) o volverla a la cola. */
  moverViaje: (viajeId: string, veh: string | null, m: number | null) => void;
  volverACola: (viajeId: string) => void;
  /** Los gestos (POST del contrato) con su toast: "Avisar a Gómez" y "Deshacer". */
  viaje: (body: AccionViaje, alTerminar?: (r: Resultado) => void, conAviso?: boolean) => void;
  pedido: (body: AccionPedido, alTerminar?: (r: Resultado) => void, conAviso?: boolean) => void;
  /** Ilumina un momento una fila, una ficha o un pedido y lo trae a la vista. */
  mostrar: (domId: string) => void;
};

export const CamionesCtx = createContext<Ctx | null>(null);

export function useCamiones(): Ctx {
  const c = useContext(CamionesCtx);
  if (!c) throw new Error("useCamiones fuera de la vista Camiones");
  return c;
}

/** Lo que se arrastra: un pedido de la cola o una ficha de una fila. */
export type Arrastre = { k: "ped"; id: string } | { k: "v"; id: string };
export const TIPO_ARRASTRE = "application/x-hoja-dia";

export function leerArrastre(e: React.DragEvent): Arrastre | null {
  try {
    const raw = e.dataTransfer.getData(TIPO_ARRASTRE);
    return raw ? (JSON.parse(raw) as Arrastre) : null;
  } catch {
    return null;
  }
}
/** Durante el dragover no se puede leer el dato: se guarda aparte qué se arrastra. */
let enCurso: Arrastre | null = null;
export const arrastre = {
  empezar: (a: Arrastre) => { enCurso = a; },
  terminar: () => { enCurso = null; },
  actual: () => enCurso,
};
