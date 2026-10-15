"use client";

// Permisos del módulo «modelador» en la pantalla. La puerta de verdad son las rutas de la API
// (exigirModulo) y la RLS; acá solo se decide qué mostrar. La migración 20261015000001 copia a
// «modelador» el nivel que cada persona ya tenía en Cómputos, así que no hace falta caer en ese.

import { nivelEn } from "@/lib/auth/acceso";
import { useAcceso } from "@/components/providers/acceso-provider";

export type NivelModelador = "editar" | "ver" | null;

export function useNivelModelador(): NivelModelador {
  return nivelEn(useAcceso(), "modelador");
}

export const usePuedeModelador = () => useNivelModelador() === "editar";
