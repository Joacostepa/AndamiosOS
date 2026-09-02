"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cajon, CambioPendiente, NotaCajon } from "@/lib/tablero/tipos-cajon";

// Cajón de planificación. Todo pasa por /api/planificacion/cajon, que habla con Supabase.

const CLAVE = ["cajon-planificacion"] as const;

/** Lo tira el guardado de notas cuando otro escribió primero. Trae la versión de al lado. */
export class ConflictoNota extends Error {
  constructor(readonly actual: NotaCajon) {
    super("Alguien más editó las notas");
    this.name = "ConflictoNota";
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; nota?: NotaCajon }
      | null;
    if (res.status === 409 && body?.nota) throw new ConflictoNota(body.nota);
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useCajon() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: () => pedir<Cajon>("/api/planificacion/cajon"),
    // El cajón es contexto que dejó otro: si estuvo abierto toda la mañana, al volver a
    // la pestaña conviene que traiga lo que se agregó mientras tanto. Es lo contrario de
    // la grilla, donde refetchear al enfocar interrumpiría un arrastre.
    refetchOnWindowFocus: true,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CLAVE });
}

/**
 * Guarda las notas mandando el `updatedAt` que se leyó.
 *
 * En vez de invalidar, escribe la respuesta en la caché: el textarea es un campo
 * controlado y una invalidación en medio de la escritura devolvería texto del servidor
 * pisando lo que se está tipeando. Lo que sí hay que refrescar es el sello, o el
 * siguiente guardado se rechazaría a sí mismo por conflicto.
 */
export function useGuardarNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { texto: string; updatedAt: string }) =>
      pedir<{ nota: NotaCajon }>("/api/planificacion/cajon", {
        method: "PUT",
        body: JSON.stringify(v),
      }),
    onSuccess: ({ nota }) => {
      qc.setQueryData<Cajon>(CLAVE, (prev) => (prev ? { ...prev, nota } : prev));
    },
  });
}

export function useAgregarPendiente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (texto: string) =>
      pedir("/api/planificacion/cajon", { method: "POST", body: JSON.stringify({ texto }) }),
    onSuccess: invalidar,
  });
}

/**
 * Tilda / corrige un pendiente, OPTIMISTA — la única mutación del cajón que lo es.
 *
 * Un checkbox es un gesto de ráfaga: se tildan tres seguidos y el ida y vuelta se siente
 * como que la casilla no responde. El resto (agregar, borrar) son gestos de a uno y
 * pueden esperar la confirmación, igual que las notas de la jornada.
 */
export function useActualizarPendiente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string } & CambioPendiente) =>
      pedir("/api/planificacion/cajon", { method: "PATCH", body: JSON.stringify(v) }),
    onMutate: async ({ id, ...cambio }) => {
      await qc.cancelQueries({ queryKey: CLAVE });
      const previo = qc.getQueryData<Cajon>(CLAVE);
      qc.setQueryData<Cajon>(CLAVE, (prev) =>
        prev
          ? {
              ...prev,
              pendientes: prev.pendientes.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      ...cambio,
                      // El sello viaja junto: de él depende de qué lado del plegable de
                      // hechos cae el ítem mientras el servidor confirma.
                      hechoAt:
                        cambio.hecho === undefined
                          ? p.hechoAt
                          : cambio.hecho
                            ? new Date().toISOString()
                            : null,
                    }
                  : p,
              ),
            }
          : prev,
      );
      return { previo };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previo) qc.setQueryData(CLAVE, ctx.previo);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useBorrarPendiente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (pendienteId: string) =>
      pedir("/api/planificacion/cajon", {
        method: "DELETE",
        body: JSON.stringify({ pendienteId }),
      }),
    onSuccess: invalidar,
  });
}
