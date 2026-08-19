"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListadoJornadas } from "@/lib/tablero/tipos-jornada";

// Listado de partes diarios. Va contra /api/planificacion/jornadas, que deriva las filas
// de las asignaciones del tablero: no hay tabla de partes pendientes.

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useJornadas(fecha: string) {
  return useQuery({
    queryKey: ["jornadas", fecha],
    queryFn: () => pedir<ListadoJornadas>(`/api/planificacion/jornadas?fecha=${fecha}`),
    enabled: !!fecha,
    // Cambiar de día no tiene que vaciar la pantalla: se muestra el día anterior hasta
    // que llega el nuevo, igual que en el tablero.
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

/**
 * Cuántas jornadas quedaron sin parte. Es el badge del sidebar, y lo que va a formar el
 * hábito: hoy nadie carga partes a diario, así que la app tiene que ser la que avise.
 *
 * Se refresca cada 5 minutos y no en cada navegación: cada consulta a Odoo cuesta unos
 * 800 ms y este número cambia unas pocas veces por día.
 */
export function usePendientesDeParte() {
  return useQuery({
    queryKey: ["jornadas", "pendientes"],
    queryFn: async () => (await pedir<{ pendientes: number }>("/api/planificacion/jornadas?pendientes=1")).pendientes,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Jornada que pasó sin estar planificada (trabajo de urgencia). */
export function useJornadaNoPlanificada() {
  const qc = useQueryClient();
  return useMutation<
    { asignacionId: number },
    Error,
    { otId: number; fecha: string; cuadrillaId: number | null; fraccion: string }
  >({
    mutationFn: (body) =>
      pedir("/api/planificacion/jornadas", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jornadas"] });
      qc.invalidateQueries({ queryKey: ["tablero"] });
    },
  });
}

/** Reprogramar: crea la jornada nueva. La original se queda con su parte no ejecutado. */
export function useReprogramar() {
  const qc = useQueryClient();
  return useMutation<{ asignacionId: number }, Error, { asignacionId: number; reprogramarA: string }>({
    mutationFn: (body) =>
      pedir("/api/planificacion/jornadas", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jornadas"] });
      qc.invalidateQueries({ queryKey: ["tablero"] });
    },
  });
}
