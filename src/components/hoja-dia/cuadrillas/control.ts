// Lo que la vista Cuadrillas le pasa a sus partes (tarjeta, panel Gente, menús): el día,
// la hora y los gestos. Los gestos van todos por los hooks de use-hoja-dia (con Deshacer);
// acá sólo está la forma.

import type { Boton } from "@/lib/hoja-dia/estado";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";

/** Lo que se está arrastrando (una persona del panel o de una tarjeta). */
export type Arrastre = { pid: string; from: number | null; esChofer: boolean };

export type Control = {
  dia: DiaHoja;
  ahora: number;
  /** Día pasado: sólo lectura. */
  pasado: boolean;
  /** Ejecuta un botón de un problema o de la bandeja (tabla botón → gesto). */
  boton: (b: Boton) => void;
  /** Agregar (o pasar) a alguien a una cuadrilla; si está en otra, pregunta antes. */
  agregar: (c: number, pid: string, opts?: { reemplaza?: string | null }) => void;
  /** Soltar un chofer en una tarjeta (pasa a Lleva y trae si iba sin chofer). */
  soltarChofer: (c: number, ch: string) => void;
  abrirMenuPersona: (c: number, pid: string, el: HTMLElement) => void;
  abrirMenuTarjeta: (c: number, el: HTMLElement) => void;
  abrirObra: (otId: number, el: HTMLElement) => void;
  abrirInstrucciones: (c: number) => void;
  abrirEnvio: (pid?: string | null) => void;
  verComo: (c: number, pid: string) => void;
  cerrarJornada: (c: number) => void;
  /** El editor de chofer abierto (una tarjeta a la vez) y adónde va el foco. */
  chEd: { c: number; foco?: "lleva" | "busca" } | null;
  setChEd: (v: { c: number; foco?: "lleva" | "busca" } | null) => void;
  editEnc: number | null;
  setEditEnc: (c: number | null) => void;
  arrastre: Arrastre | null;
  setArrastre: (a: Arrastre | null) => void;
  /** La persona elegida en Gente (las teclas 1–5 la mandan a esa cuadrilla). */
  sel: string | null;
  setSel: (pid: string | null) => void;
  /** La tarjeta que acaba de pedir atención (scroll y borde). */
  flash: number | null;
};

export const TIPO_ARRASTRE = "application/x-hoja-persona";
