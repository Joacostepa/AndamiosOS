"use client";

import { useQuery } from "@tanstack/react-query";
import type { DetalleOt } from "@/lib/tablero/tipos";

/**
 * La ficha completa de una OT, pedida sólo cuando alguien la necesita.
 *
 * NO viaja con el tablero a propósito: esa llamada trae medio centenar de OTs y se repite
 * todo el día; esto se mira de a una. Ver /api/planificacion/ot.
 *
 * Lo usan el panel lateral de la tarjeta y el cierre de jornada, que necesita el detalle
 * técnico para precargar el as-built.
 */
export function useDetalleOt(otId: number | null) {
  return useQuery({
    queryKey: ["tablero-ot-detalle", otId],
    queryFn: async () => {
      const res = await fetch(`/api/planificacion/ot?otId=${otId}`);
      if (!res.ok) throw new Error("No se pudo leer la ficha de la OT");
      return ((await res.json()) as { detalle: DetalleOt }).detalle;
    },
    enabled: !!otId,
    staleTime: 5 * 60 * 1000,
  });
}
