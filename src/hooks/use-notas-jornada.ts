"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotaJornada, NuevaNotaJornada } from "@/lib/tablero/tipos-nota";

// Notas de la jornada. Todo pasa por /api/planificacion/notas, que habla con Supabase.
//
// No son optimistas, a diferencia del resto del tablero: escribir una nota es un gesto
// deliberado dentro de un popover abierto —no una ráfaga de arrastres— y la escritura es
// a Supabase, que contesta en decenas de milisegundos y no en el segundo que tarda Odoo.

const CLAVE = ["notas-jornada"] as const;

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

/**
 * Las notas que tocan un rango de fechas.
 *
 * `keepPreviousData` por lo mismo que el tablero: al scrollear hasta el borde el rango
 * se amplía y cambia la queryKey. Sin esto las marcas de nota parpadearían —desaparecen
 * y vuelven— en cada ampliación.
 */
export function useNotasJornada(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...CLAVE, desde, hasta],
    queryFn: async () => {
      const r = await pedir<{ notas: NotaJornada[] }>(
        `/api/planificacion/notas?desde=${desde}&hasta=${hasta}`,
      );
      return r.notas;
    },
    enabled: !!desde && !!hasta,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

/** Invalida TODOS los rangos: una nota nueva puede caer en cualquiera de los cargados. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CLAVE });
}

export function useAgregarNotaJornada() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (nota: NuevaNotaJornada) =>
      pedir("/api/planificacion/notas", { method: "POST", body: JSON.stringify(nota) }),
    onSuccess: invalidar,
  });
}

export function useBorrarNotaJornada() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (notaId: string) =>
      pedir("/api/planificacion/notas", {
        method: "DELETE",
        body: JSON.stringify({ notaId }),
      }),
    onSuccess: invalidar,
  });
}
