"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JornadasPlan } from "@/lib/planificacion/jornadas-plan";

// Cuántas jornadas tiene cada obra según Operaciones. Todo pasa por
// /api/planificacion/jornadas-plan, que habla con Supabase.
//
// No es optimista, a diferencia de los arrastres del tablero: corregir la duración de una
// obra es un gesto deliberado dentro de un diálogo, no una ráfaga, y la escritura va a
// Supabase, que contesta en decenas de milisegundos y no en el segundo que tarda Odoo.

const CLAVE = ["plan-jornadas"] as const;

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
 * Todas las correcciones vigentes, indexadas por OT.
 *
 * Devuelve un Map y no la lista porque el único uso es la pregunta "¿esta obra tiene
 * número propio?", una vez por obra en cada render de la bandeja.
 */
export function usePlanJornadas() {
  const query = useQuery({
    queryKey: CLAVE,
    queryFn: () => pedir<{ planes: JornadasPlan[] }>("/api/planificacion/jornadas-plan"),
    // Es un dato de otro planificador, no del que está arrastrando: conviene que llegue
    // al volver a la pestaña, igual que el cajón.
    refetchOnWindowFocus: true,
  });
  const porOt = useMemo(
    () => new Map((query.data?.planes ?? []).map((p) => [p.otId, p])),
    [query.data],
  );
  return { porOt, isLoading: query.isLoading };
}

export function useFijarJornadasPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { otId: number; jornadas: number; motivo?: string | null }) =>
      pedir("/api/planificacion/jornadas-plan", { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useBorrarJornadasPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otId: number) =>
      pedir("/api/planificacion/jornadas-plan", {
        method: "DELETE",
        body: JSON.stringify({ otId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}
