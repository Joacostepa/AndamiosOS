"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosCierre, ParteCargado, ResultadoCierre } from "@/lib/tablero/tipos-parte";

// Cierre de jornada. Va contra /api/planificacion/partes, que escribe el parte diario
// en Odoo. A diferencia del resto del tablero NO es optimista: crear un parte con sus
// líneas y fotos son varias escrituras y el usuario tiene que ver qué quedó guardado.

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

export function useParte(parteId: number | null) {
  return useQuery({
    queryKey: ["parte", parteId],
    queryFn: async () => {
      const r = await pedir<{ parte: ParteCargado }>(`/api/planificacion/partes?parteId=${parteId}`);
      return r.parte;
    },
    enabled: !!parteId,
    staleTime: 30 * 1000,
  });
}

export function useCerrarJornada() {
  const qc = useQueryClient();
  return useMutation<ResultadoCierre, Error, { asignacionId: number; datos: DatosCierre }>({
    mutationFn: (body) =>
      pedir<ResultadoCierre>("/api/planificacion/partes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    // El tablero se refresca para que la tarjeta pase a "cerrada".
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tablero"] }),
  });
}

export function useEditarParte() {
  const qc = useQueryClient();
  return useMutation<ResultadoCierre, Error, { parteId: number; otId: number; datos: DatosCierre }>({
    mutationFn: (body) =>
      pedir<ResultadoCierre>("/api/planificacion/partes", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["parte", vars.parteId] });
      qc.invalidateQueries({ queryKey: ["tablero"] });
    },
  });
}
