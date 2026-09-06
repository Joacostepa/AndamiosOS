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
    // 30 segundos y no cinco minutos, que es lo que había. Cuando se eligió ese número la
    // ficha era de sólo lectura y no cambiaba nunca: cachearla fuerte era gratis.
    //
    // Ya no. Desde que "Qué hay que ejecutar" se corrige desde Odoo, esta ficha se mira
    // JUSTO DESPUÉS de haberla cambiado, para confirmar que la corrección llegó. Con cinco
    // minutos la pantalla seguía mostrando el texto viejo y lo que se concluía era que el
    // cambio no había funcionado — pasó apenas se estrenó el campo.
    //
    // Es el mismo valor que el tablero. La ficha se pide de a una OT, así que el costo de
    // refrescarla más seguido es una llamada, no las seis del tablero.
    staleTime: 30_000,
  });
}
