"use client";

import { useQuery } from "@tanstack/react-query";
import type { EntradaActividad } from "@/lib/tablero/tipos-movimiento";

// La actividad del tablero: qué se hizo, quién y cuándo.
//
// SE PIDE AL ABRIR, no con el tablero. Es una pantalla que se consulta de vez en cuando
// —"¿quién movió esto?"— y cargarla siempre le sumaría una consulta a cada entrada al
// tablero para algo que la mayoría de las veces nadie mira.

const CLAVE = ["actividad"] as const;

async function pedir(url: string): Promise<EntradaActividad[]> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return ((await res.json()) as { actividad: EntradaActividad[] }).actividad;
}

/** Todo el tablero. `activo` es lo que evita pedirla con el panel cerrado. */
export function useActividad(activo: boolean) {
  return useQuery({
    queryKey: CLAVE,
    queryFn: () => pedir("/api/planificacion/movimientos"),
    enabled: activo,
    // Mientras el panel está abierto se refresca al volver a la ventana: es justo el
    // gesto de "vengo a ver si alguien tocó algo".
    staleTime: 30_000,
  });
}

/** Sólo los movimientos de una obra, para el panel de la tarjeta. */
export function useActividadDeOt(otId: number | null) {
  return useQuery({
    queryKey: [...CLAVE, otId],
    queryFn: () => pedir(`/api/planificacion/movimientos?otId=${otId}`),
    enabled: !!otId,
    staleTime: 60_000,
  });
}
