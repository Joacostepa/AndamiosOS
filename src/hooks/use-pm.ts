"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAcceso } from "@/components/providers/acceso-provider";
import { useUser } from "@/hooks/use-user";
import { pedir } from "@/hooks/use-tablero";
import { accesoDeFila } from "@/lib/auth/acceso";
import { avisarCambio } from "@/lib/tablero/avisos";
import type { CandidatoPm, PmDeObra } from "@/lib/tablero/pm";

// El PM de cada obra, del lado del navegador (pedido de JS del 19/11/2026).
//
// CLAVE PROPIA Y NUNCA BAJO ["tablero"], por lo mismo que los comodines (use-comodines.ts):
// aplicarOptimista reescribe todo lo que cuelga de esa clave como si fuera el payload de Odoo.
//
// LO AJENO LLEGA POR LOS AVISOS EN VIVO: al tomar, pasar o soltar se avisa por el canal del
// tablero (avisarCambio) y use-avisos-tablero invalida esta clave en las demás pantallas. Si
// igual dos tocan "Tomar" a la vez, el servidor le contesta al segundo "Ya la tomó Juani".

export const CLAVE_PM = ["pm-obras"] as const;

type Payload = { pms: PmDeObra[]; candidatos: CandidatoPm[] };

export function usePms() {
  const query = useQuery({
    queryKey: CLAVE_PM,
    queryFn: () => pedir<Payload>("/api/planificacion/pm"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const porOt = useMemo(() => new Map((query.data?.pms ?? []).map((p) => [p.otId, p])), [query.data]);
  return { porOt, candidatos: query.data?.candidatos ?? [], cargando: query.isLoading, error: query.error };
}

/**
 * Quién mira, para el modo PM: su id, si puede ser PM (lo tiene tildado EN SU PERFIL; el atajo
 * de admin no cuenta, igual que en la base) y si edita Planificación (asigna a cualquiera).
 */
export function useYoPm(): { id: string | null; esPm: boolean } {
  const acceso = useAcceso();
  const { data: perfil } = useUser();
  const permisos = perfil ? accesoDeFila(perfil)?.permisos : acceso?.permisos;
  return { id: perfil?.id ?? null, esPm: permisos?.["planificacion-pm"] === "editar" };
}

export type CambioPm =
  | { tipo: "tomar"; otId: number; pm: string; titulo?: string | null }
  | { tipo: "pasar"; otId: number; pm: string; de: string; titulo?: string | null }
  | { tipo: "quitar"; otId: number; titulo?: string | null };

/**
 * Tomar, asignar, pasar o soltar. OPTIMISTA: la tarjeta cambia ya, y si el servidor dice que
 * no (otro la tomó antes, sin permiso) se vuelve atrás con un toast que dice quién la tiene.
 */
export function useCambiarPm() {
  const qc = useQueryClient();
  const { data: perfil } = useUser();
  return useMutation<{ ok: true; pm?: PmDeObra }, Error, CambioPm, { previo: Payload | undefined }>({
    mutationFn: (c) => {
      if (c.tipo === "quitar") return pedir(`/api/planificacion/pm?otId=${c.otId}`, { method: "DELETE" });
      if (c.tipo === "pasar") {
        return pedir("/api/planificacion/pm", { method: "PATCH", body: JSON.stringify({ otId: c.otId, pm: c.pm, de: c.de }) });
      }
      return pedir("/api/planificacion/pm", { method: "POST", body: JSON.stringify({ otId: c.otId, pm: c.pm }) });
    },
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: CLAVE_PM });
      const previo = qc.getQueryData<Payload>(CLAVE_PM);
      qc.setQueryData<Payload>(CLAVE_PM, (d) => {
        if (!d) return d;
        const sin = d.pms.filter((p) => p.otId !== c.otId);
        if (c.tipo === "quitar") return { ...d, pms: sin };
        const nombre = d.candidatos.find((x) => x.id === c.pm)?.nombre ?? "…";
        return {
          ...d,
          pms: [
            ...sin,
            {
              otId: c.otId,
              pmId: c.pm,
              pmNombre: nombre,
              asignadoEl: new Date().toISOString(),
              asignadoPorNombre: perfil?.nombre?.trim() || null,
            },
          ],
        };
      });
      return { previo };
    },
    onSuccess: (r, c) => {
      if (r.pm) {
        const fila = r.pm;
        qc.setQueryData<Payload>(CLAVE_PM, (d) => (d ? { ...d, pms: [...d.pms.filter((p) => p.otId !== c.otId), fila] } : d));
      }
      const yo = perfil?.id;
      const quien = r.pm?.pmNombre ?? "";
      const obra = c.titulo ?? null;
      if (c.tipo === "quitar") {
        avisarCambio("sacó el PM de", obra, "pm");
        toast.success("La obra quedó sin PM");
      } else if (c.pm === yo && c.tipo === "tomar") {
        avisarCambio("tomó como PM", obra, "pm");
        toast.success("Sos el PM de la obra", { description: "Operaciones ya te ve en el tablero." });
      } else {
        avisarCambio(`puso a ${quien} de PM en`, obra, "pm");
        toast.success(`${quien} es el PM de la obra`);
      }
    },
    onError: (error, _c, ctx) => {
      qc.setQueryData(CLAVE_PM, ctx?.previo);
      toast.error("No se pudo cambiar el PM", { description: error.message });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_PM });
    },
  });
}
