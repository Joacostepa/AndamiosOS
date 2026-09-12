"use client";

import { useQuery } from "@tanstack/react-query";
import type { EntradaActividad } from "@/lib/tablero/tipos-movimiento";

// La actividad del tablero: qué se hizo, quién y cuándo.
//
// SE PIDE AL ABRIR, no con el tablero. Es una pantalla que se consulta de vez en cuando
// —"¿quién movió esto?"— y cargarla siempre le sumaría una consulta a cada entrada al
// tablero para algo que la mayoría de las veces nadie mira.

/**
 * Se exporta porque la invalida `refrescarPronto` en use-tablero: cada escritura del
 * tablero deja un movimiento, así que la actividad envejece con cada arrastre.
 */
export const CLAVE_ACTIVIDAD = ["actividad"] as const;

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
    queryKey: CLAVE_ACTIVIDAD,
    queryFn: () => pedir("/api/planificacion/movimientos"),
    enabled: activo,
    // LO PROPIO llega solo: cada escritura del tablero invalida esta clave desde
    // refrescarPronto, así que lo que hacés vos aparece en la lista sin tocar nada.
    //
    // LO DE LOS DEMÁS necesita preguntar, y por eso hay un latido de 20 s MIENTRAS EL
    // PANEL ESTÁ ABIERTO. Es una consulta liviana a Supabase y sólo corre con el panel a
    // la vista: alguien que lo deja abierto en un costado ve aparecer lo que mueve el
    // resto sin refrescar la página, que es justo para lo que se abre.
    refetchInterval: activo ? 20_000 : false,
    // Corto, porque es una pantalla que se abre para ver qué pasó recién. Con el minuto
    // por defecto, cerrarla y volver a abrirla mostraba lo de hace un minuto.
    staleTime: 10_000,
  });
}

/** Sólo los movimientos de una obra, para el panel de la tarjeta. */
export function useActividadDeOt(otId: number | null) {
  return useQuery({
    queryKey: [...CLAVE_ACTIVIDAD, otId],
    queryFn: () => pedir(`/api/planificacion/movimientos?otId=${otId}`),
    enabled: !!otId,
    // Sin latido: esto vive adentro del panel de una obra, que se abre, se lee y se
    // cierra. Lo que se escribe desde el tablero lo invalida refrescarPronto igual.
    staleTime: 10_000,
  });
}
