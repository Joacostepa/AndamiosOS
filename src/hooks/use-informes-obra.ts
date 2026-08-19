"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InformeObra, ListadoInformes } from "@/lib/informes-obra/tipos";

// Informes de obra. Los informes están CONGELADOS en Supabase, así que estas consultas no
// tocan Odoo: leer la lista de 278 informes no cuesta un solo RPC.
//
// La única que sí toca Odoo es la regeneración, y por eso es la única lenta.

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useInformesObra() {
  return useQuery({
    queryKey: ["informes-obra"],
    queryFn: () => pedir<ListadoInformes>("/api/informes-obra"),
    refetchOnWindowFocus: false,
  });
}

export function useInformeObra(saleOrderId: number | null, version?: number) {
  return useQuery({
    queryKey: ["informe-obra", saleOrderId, version ?? null],
    queryFn: () =>
      pedir<{ informe: InformeObra; versiones: number[] }>(
        `/api/informes-obra/${saleOrderId}${version ? `?version=${version}` : ""}`,
      ),
    enabled: !!saleOrderId,
    refetchOnWindowFocus: false,
    // Un informe congelado no cambia salvo que alguien lo regenere a mano.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Regenera el informe después de corregir datos en Odoo.
 *
 * Crea una versión nueva y conserva la anterior: la versión vieja es el registro de lo
 * que se sabía en ese momento, y pisarla convertiría el informe en algo que no prueba
 * nada. Es lenta a propósito — vuelve a leer Odoo.
 */
export function useRegenerarInforme(saleOrderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      pedir<{ informe: InformeObra }>(`/api/informes-obra/${saleOrderId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["informe-obra", saleOrderId] });
      qc.invalidateQueries({ queryKey: ["informes-obra"] });
    },
  });
}
