"use client";

import { useQuery } from "@tanstack/react-query";
import type { Confirmacion } from "@/lib/tablero/tipos-confirmacion";

// Historial de confirmaciones de una obra. Sólo lectura: el registro lo escribe el PATCH
// de las asignaciones, en la misma request que cambia el estado.

export const CLAVE_CONFIRMACIONES = ["confirmaciones"] as const;

export function useConfirmaciones(otId: number | null) {
  return useQuery({
    queryKey: [...CLAVE_CONFIRMACIONES, otId],
    queryFn: async () => {
      const res = await fetch(`/api/planificacion/confirmaciones?otId=${otId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      return ((await res.json()) as { confirmaciones: Confirmacion[] }).confirmaciones;
    },
    // Sólo cuando hay una tarjeta abierta: es una consulta por panel, no por tablero.
    enabled: !!otId,
    refetchOnWindowFocus: false,
  });
}
