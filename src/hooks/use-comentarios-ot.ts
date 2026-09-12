"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComentarioOt, ResumenComentarios } from "@/lib/tablero/tipos-comentario";

// Comentarios de la OT. Todo pasa por Supabase; nada toca Odoo.
//
// No son optimistas, igual que las notas de la jornada: escribir un comentario es un
// gesto deliberado dentro de un panel abierto —no una ráfaga de arrastres— y la escritura
// va a Supabase, que contesta en decenas de milisegundos.
//
// Las rutas devuelven el HILO COMPLETO después de escribir, así que la mutación siembra
// la caché con lo que ya vino en la respuesta en vez de pedirlo de nuevo. Sin eso,
// mandar un comentario costaba dos viajes y el hilo parpadeaba en el medio.

const HILO = "comentarios-ot";
const RESUMEN = "comentarios-resumen";

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

/** El hilo de una OT. Se pide al abrir el panel, no antes. */
export function useComentariosOt(otId: number | null) {
  return useQuery({
    queryKey: [HILO, otId],
    queryFn: async () => {
      const r = await pedir<{ comentarios: ComentarioOt[] }>(
        `/api/ordenes-trabajo/${otId}/comentarios`,
      );
      return r.comentarios;
    },
    enabled: !!otId,
    staleTime: 30_000,
  });
}

/**
 * Cuántos comentarios tiene cada OT del tablero y cuál fue el último.
 *
 * Una sola consulta para toda la grilla, con la misma forma que useCandado: la clave se
 * normaliza —únicos y ordenados— para que reordenar las asignaciones no dispare un
 * refetch de algo que no cambió.
 */
export function useResumenComentarios(otIds: number[]) {
  const clave = [...new Set(otIds)].sort((a, b) => a - b);
  return useQuery({
    queryKey: [RESUMEN, clave],
    queryFn: async () => {
      const r = await pedir<{ resumen: Record<string, ResumenComentarios> }>(
        `/api/planificacion/comentarios?otIds=${clave.join(",")}`,
      );
      return new Map(Object.entries(r.resumen).map(([id, v]) => [Number(id), v]));
    },
    enabled: clave.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/**
 * Lo que comparten las tres mutaciones: se quedan con el hilo que devolvió la ruta y
 * marcan el resumen del tablero como viejo, para que el globito de la tarjeta aparezca
 * —o desaparezca— sin recargar la página.
 */
function useAplicar(otId: number) {
  const qc = useQueryClient();
  return (r: { comentarios: ComentarioOt[] }) => {
    qc.setQueryData([HILO, otId], r.comentarios);
    qc.invalidateQueries({ queryKey: [RESUMEN] });
  };
}

export function useComentar(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { texto: string; fijado?: boolean }) =>
      pedir<{ comentarios: ComentarioOt[] }>(`/api/ordenes-trabajo/${otId}/comentarios`, {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: aplicar,
  });
}

export function useFijarComentario(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { id: string; fijado: boolean }) =>
      pedir<{ comentarios: ComentarioOt[] }>(`/api/ordenes-trabajo/${otId}/comentarios`, {
        method: "PATCH",
        body: JSON.stringify(v),
      }),
    onSuccess: aplicar,
  });
}

export function useBorrarComentario(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (id: string) =>
      pedir<{ comentarios: ComentarioOt[] }>(`/api/ordenes-trabajo/${otId}/comentarios`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      }),
    onSuccess: aplicar,
  });
}
