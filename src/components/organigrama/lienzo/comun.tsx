"use client";

// Tipos y piezas chicas que comparten las partes del Lienzo vivo.

import { createContext, useContext } from "react";
import type { EstadoPuesto } from "@/lib/organigrama/arbol";
import type { Caja, Punto } from "@/lib/organigrama/layout";
import type { ColorArea, Modalidad, Nodo, Persona, TipoCambio } from "@/lib/organigrama/tipos";

/** El spring de las cajas y los conectores: rápido, sin rebote exagerado. */
export const RESORTE = { type: "spring" as const, stiffness: 240, damping: 28, mass: 0.9 };

export type PersonaEnNodo = { persona: Persona; ocupante?: string; modalidad: Modalidad };

/** Todo lo que una tarjeta necesita saber de su puesto (calculado una vez en el lienzo). */
export type VistaNodo = {
  nodo: Nodo;
  caja: Caja;
  color: ColorArea;
  personas: PersonaEnNodo[];
  estado: EstadoPuesto;
  ocultos: number;
  cantHijos: number;
  marca?: TipoCambio;
  deCuadrillas: boolean;
  /** De dónde nace (la caja del padre): los hijos salen del padre al expandir o crear. */
  desde: Punto;
  /** Puestos y personas de la rama (para el zoom semántico de las áreas). */
  rama: { puestos: number; personas: number; vacantes: number };
};

export type EstadoDestino = "valido" | "invalido" | "sobre" | "sobre-invalido" | null;

/** A dónde se van las cajas que desaparecen: al padre (colapsar) o al tacho. */
export type Salida = { claves: ReadonlySet<string>; a: Punto; modo: "colapsar" | "tacho" } | null;

export type AccionesLienzo = {
  alClic: (clave: string) => void;
  alternar: (clave: string) => void;
  renombrar: (clave: string, titulo: string) => void;
  terminarNombre: () => void;
  abrirPersona: (id: string) => void;
};

export const AccionesCtx = createContext<AccionesLienzo | null>(null);

export function useAcciones(): AccionesLienzo {
  const c = useContext(AccionesCtx);
  if (!c) throw new Error("useAcciones fuera del lienzo");
  return c;
}

/** Las variables CSS del color de área (nombres de la paleta --tb-*, nunca hex). */
export function varsArea(color: ColorArea): React.CSSProperties {
  return {
    "--area": `var(--tb-${color}-borde)`,
    "--area-bg": `var(--tb-${color}-bg)`,
    "--area-text": `var(--tb-${color}-text)`,
  } as React.CSSProperties;
}

export function esCampoDeTexto(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
