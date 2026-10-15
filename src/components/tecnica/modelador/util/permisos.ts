"use client";

// Permisos del módulo «modelador» en la pantalla (la puerta de verdad son las rutas de la API
// con exigirModulo). Hasta que la migración agregue el módulo y copie los permisos de Cómputos
// (backfill de 20261015000001_modelador.sql), quien edita Cómputos también edita el modelador.

import { nivelEn, type ModuloId } from "@/lib/auth/acceso";
import { useAcceso } from "@/components/providers/acceso-provider";

export type NivelModelador = "editar" | "ver" | null;

export function useNivelModelador(): NivelModelador {
  const acceso = useAcceso();
  const propio = nivelEn(acceso, "modelador" as ModuloId);
  if (propio) return propio;
  return nivelEn(acceso, "computos" as ModuloId);
}

export const usePuedeModelador = () => useNivelModelador() === "editar";
