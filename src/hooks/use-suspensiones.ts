"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SuspensionDia } from "@/lib/tablero/tipos-suspension";

// Días suspendidos del tablero (ver /api/planificacion/suspensiones).
//
// CLAVE PROPIA y no colgada de ["tablero"]: las mutaciones optimistas del tablero
// reescriben todo lo que esté bajo esa clave como si fuera el payload de asignaciones.
// Por eso el corrimiento y los avisos en vivo la invalidan aparte.

export const CLAVE_SUSPENSIONES = ["suspensiones-tablero"] as const;

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

export function useSuspensiones(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...CLAVE_SUSPENSIONES, desde, hasta],
    queryFn: async () => {
      const r = await pedir<{ suspensiones: SuspensionDia[] }>(
        `/api/planificacion/suspensiones?desde=${desde}&hasta=${hasta}`,
      );
      return r.suspensiones;
    },
    enabled: !!desde && !!hasta,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useQuitarSuspension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      pedir("/api/planificacion/suspensiones", { method: "DELETE", body: JSON.stringify({ id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_SUSPENSIONES }),
  });
}
