"use client";

import { createContext, useContext } from "react";
import { nivelEn, type Acceso, type ModuloId } from "@/lib/auth/acceso";

// Los permisos de quien está usando la app, leídos en el servidor por el layout.
// Sirven para ARMAR la pantalla (menú, botones); la puerta de verdad es el proxy.

const AccesoContext = createContext<Acceso | null>(null);

export function AccesoProvider({ acceso, children }: { acceso: Acceso | null; children: React.ReactNode }) {
  return <AccesoContext.Provider value={acceso}>{children}</AccesoContext.Provider>;
}

export function useAcceso(): Acceso | null {
  return useContext(AccesoContext);
}

/** ¿Puede hacer cambios en este módulo? Para esconder los botones de quien sólo ve. */
export function usePuedeEditar(modulo: ModuloId): boolean {
  return nivelEn(useAcceso(), modulo) === "editar";
}
