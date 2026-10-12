"use client";

// El modo del Pizarrón (hd_parametros.pizarron, ver lib/hoja-dia/modo-pizarron.ts) para las
// pantallas: lo lee el layout de Planificación (servidor) y lo baja por contexto, así las
// pestañas del tablero y de la hoja saben si muestran "Pizarrón (nuevo)" sin otra consulta.

import { createContext, createElement, useContext, type ReactNode } from "react";
import type { ModoPizarron } from "@/lib/hoja-dia/modo-pizarron";

const ModoCtx = createContext<ModoPizarron>("oculto");

export function ProveedorModoPizarron({ modo, children }: { modo: ModoPizarron; children: ReactNode }) {
  return createElement(ModoCtx.Provider, { value: modo }, children);
}

export const useModoPizarron = () => useContext(ModoCtx);
