"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAcceso } from "@/components/providers/acceso-provider";
import { useUser } from "@/hooks/use-user";
import { pedir } from "@/hooks/use-tablero";
import { accesoDeFila, nivelEn } from "@/lib/auth/acceso";
import { avisarCambio } from "@/lib/tablero/avisos";
import type { Marcados } from "@/lib/tablero/comodines";
import type { MarcaComodin } from "@/lib/tablero/guardias-tipos";

// Las marcas de comodín, del lado del navegador (guardias-contrato.md §2, 18/10).
//
// UN COMODÍN ES UNA MARCA DE PLANIFICACIÓN (plan_comodines), no una regla: esto la lee y la
// pone o la saca. Qué se hace con la marca —cruzarla con el tablero, ordenar el grupo de la
// bandeja, decir si puede ir a una guardia— es puro y vive en src/lib/tablero/comodines.ts.
//
// CLAVE PROPIA Y NUNCA BAJO ["tablero"]. aplicarOptimista reescribe todo lo que cuelga de esa
// clave como si fuera el payload de asignaciones (la regla del módulo, handoff.md): una lista
// de marcas ahí abajo se rompería en el primer arrastre. Además no tiene por qué viajar con
// Odoo: marcar no cambia ninguna jornada, y reconsultar el rango entero por una marca sería
// pagar ~1,2 s y seis llamadas a Odoo por nada.
//
// LO AJENO LLEGA POR LOS AVISOS EN VIVO, como todo el tablero: al marcar o quitar se avisa por
// el canal (avisarCambio) y use-avisos-tablero invalida esta clave en las otras pantallas. El
// foco de la pestaña es la red de seguridad.

export const CLAVE_COMODINES = ["comodines-tablero"] as const;

/** Todas las marcas (la más vieja primero). Pocas filas: una por OT marcada. */
export function useComodines() {
  return useQuery({
    queryKey: CLAVE_COMODINES,
    queryFn: async () => (await pedir<{ marcas: MarcaComodin[] }>("/api/planificacion/comodines")).marcas,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

/**
 * Las marcas como las pide la regla pura (otId → cuándo), y por OT con el nombre de quién la
 * puso. Mientras no cargan —o si la lectura falla— no hay comodines: el tablero se dibuja sin
 * ellos y el candado del servidor, que lee la base, es el que decide de verdad.
 */
export function useMarcados(): { marcados: Marcados; porOt: Map<number, MarcaComodin> } {
  const { data } = useComodines();
  return useMemo(() => {
    const lista = data ?? [];
    return {
      marcados: new Map(lista.map((m) => [m.otId, m.marcadoEl])),
      porOt: new Map(lista.map((m) => [m.otId, m])),
    };
  }, [data]);
}

/**
 * ¿Quien mira puede marcar o quitar comodines? Quien EDITA Planificación (contrato §2, 18/10).
 *
 * Sale del PERFIL (useUser) y, mientras no carga, de lo que el layout leyó en el servidor
 * (useAcceso), igual que usePuedeAutorizar: son la misma fila. Es para ARMAR la pantalla
 * —mostrar o no "Marcar como comodín"—; la puerta de verdad es la ruta (exigirPermisoDeApi) y
 * la RLS de plan_comodines.
 */
export function usePuedeEditarPlanificacion(): boolean {
  const acceso = useAcceso();
  const { data: perfil } = useUser();
  const efectivo = perfil ? accesoDeFila(perfil) : acceso;
  return nivelEn(efectivo, "planificacion") === "editar";
}

export type CambioComodin = {
  otId: number;
  /** true = marcar, false = quitar. */
  marcar: boolean;
  /** Para el aviso a las otras pantallas ("Juan marcó como comodín: S02658 · Callao 1234"). */
  titulo?: string | null;
};

/**
 * Marcar o quitar. OPTIMISTA: el naipe, el chip y el grupo de la bandeja cambian ya, y si el
 * servidor dice que no se vuelve atrás con un toast que explica por qué (sin permiso, la OT ya
 * se cerró, Odoo caído).
 */
export function useCambiarComodin() {
  const qc = useQueryClient();
  const { data: perfil } = useUser();
  return useMutation<
    { ok: true; marca?: MarcaComodin; quitada?: boolean },
    Error,
    CambioComodin,
    { previo: MarcaComodin[] | undefined }
  >({
    mutationFn: ({ otId, marcar }) =>
      marcar
        ? pedir("/api/planificacion/comodines", { method: "POST", body: JSON.stringify({ otId }) })
        : pedir(`/api/planificacion/comodines?otId=${otId}`, { method: "DELETE" }),
    onMutate: async ({ otId, marcar }) => {
      // Que una lectura en vuelo no pise el optimista con la lista de antes.
      await qc.cancelQueries({ queryKey: CLAVE_COMODINES });
      const previo = qc.getQueryData<MarcaComodin[]>(CLAVE_COMODINES);
      qc.setQueryData<MarcaComodin[]>(CLAVE_COMODINES, (lista = []) => {
        const sin = lista.filter((m) => m.otId !== otId);
        // Si ya estaba marcada, la marca original se queda (el servidor hace lo mismo): el
        // orden de la bandeja es por cuándo se marcó, y un doble clic no la manda al final.
        if (!marcar) return sin;
        if (lista.some((m) => m.otId === otId)) return lista;
        return [...sin, { otId, marcadoEl: new Date().toISOString(), marcadoPorNombre: perfil?.nombre?.trim() || null }];
      });
      return { previo };
    },
    onSuccess: (r, { otId, marcar, titulo }) => {
      // La marca que guardó el servidor (con su hora real) reemplaza a la optimista.
      if (marcar && r.marca) {
        const marca = r.marca;
        qc.setQueryData<MarcaComodin[]>(CLAVE_COMODINES, (lista = []) => [...lista.filter((m) => m.otId !== otId), marca]);
      }
      avisarCambio(marcar ? "marcó como comodín" : "sacó de comodines", titulo ?? null);
      toast.success(marcar ? "Marcada como comodín" : "Ya no es comodín", {
        description: marcar
          ? "Puede ir cualquier día: está en el grupo Comodines de la bandeja."
          : "Sale del grupo Comodines y deja de ofrecerse para rellenar guardias.",
      });
    },
    onError: (error, { marcar }, ctx) => {
      qc.setQueryData(CLAVE_COMODINES, ctx?.previo);
      toast.error(marcar ? "No se pudo marcar como comodín" : "No se pudo quitar el comodín", {
        description: error.message,
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_COMODINES });
    },
  });
}
