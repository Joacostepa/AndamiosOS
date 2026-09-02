"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cajon, CambioPendiente, NotaCajon, Pendiente } from "@/lib/tablero/tipos-cajon";

// Cajón de planificación. Todo pasa por /api/planificacion/cajon, que habla con Supabase.

const CLAVE = ["cajon-planificacion"] as const;

// LAS TRES MUTACIONES DE PENDIENTES SON OPTIMISTAS Y NINGUNA INVALIDA.
//
// La primera versión sólo hacía optimista el tildado, con el argumento de que agregar y
// borrar eran "gestos de a uno". Era falso: se cargan cinco pendientes seguidos. Y encima
// cada mutación invalidaba, así que un Enter costaba POST → GET → y ese GET arrastraba la
// purga de hechos viejos: tres o cuatro viajes antes de que se moviera un píxel.
//
// Ahora la caché se actualiza a mano con lo que devuelve el servidor y no hay refetch.
// Lo que escriba otra persona llega igual: la query refetchea al volver a la pestaña, y
// el cajón se remonta cada vez que se abre.

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

/**
 * Agrega un pendiente, optimista.
 *
 * El ítem se pinta con un id inventado y el servidor devuelve la fila real, que lo
 * reemplaza. Sin ese reemplazo el ítem quedaría con un id que no existe y el primer
 * tilde o borrado se iría contra la nada.
 */
export function useAgregarPendiente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) =>
      pedir<{ pendiente: Pendiente }>("/api/planificacion/cajon", {
        method: "POST",
        body: JSON.stringify({ texto }),
      }),
    onMutate: async (texto) => {
      await qc.cancelQueries({ queryKey: CLAVE });
      const previo = qc.getQueryData<Cajon>(CLAVE);
      const provisorio = `temp:${crypto.randomUUID()}`;
      qc.setQueryData<Cajon>(CLAVE, (prev) =>
        prev
          ? {
              ...prev,
              pendientes: [
                ...prev.pendientes,
                {
                  id: provisorio,
                  texto,
                  hecho: false,
                  posicion: Math.max(0, ...prev.pendientes.map((p) => p.posicion)) + 1,
                  hechoAt: null,
                  autorNombre: null,
                },
              ],
            }
          : prev,
      );
      return { previo, provisorio };
    },
    onSuccess: ({ pendiente }, _t, ctx) => {
      qc.setQueryData<Cajon>(CLAVE, (prev) =>
        prev
          ? {
              ...prev,
              pendientes: prev.pendientes.map((p) =>
                p.id === ctx?.provisorio ? pendiente : p,
              ),
            }
          : prev,
      );
    },
    onError: (_e, _t, ctx) => {
      if (ctx?.previo) qc.setQueryData(CLAVE, ctx.previo);
    },
  });
}

/**
 * Tilda / corrige un pendiente, optimista.
 *
 * Un ítem recién agregado que todavía no volvió del servidor tiene id provisorio: no se
 * manda nada, sólo se pinta. El PATCH contra un id inventado sería un 400 seguro.
 */
export function useActualizarPendiente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string } & CambioPendiente) => {
      if (v.id.startsWith("temp:")) return Promise.resolve({ ok: true });
      return pedir("/api/planificacion/cajon", { method: "PATCH", body: JSON.stringify(v) });
    },
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
                      // hechos cae el ítem.
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
  });
}

/** Borra un pendiente, optimista. Ver la nota de arriba sobre los ids provisorios. */
export function useBorrarPendiente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pendienteId: string) => {
      if (pendienteId.startsWith("temp:")) return Promise.resolve({ ok: true });
      return pedir("/api/planificacion/cajon", {
        method: "DELETE",
        body: JSON.stringify({ pendienteId }),
      });
    },
    onMutate: async (pendienteId) => {
      await qc.cancelQueries({ queryKey: CLAVE });
      const previo = qc.getQueryData<Cajon>(CLAVE);
      qc.setQueryData<Cajon>(CLAVE, (prev) =>
        prev ? { ...prev, pendientes: prev.pendientes.filter((p) => p.id !== pendienteId) } : prev,
      );
      return { previo };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previo) qc.setQueryData(CLAVE, ctx.previo);
    },
  });
}
