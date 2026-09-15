"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bandeja, FichaExpediente } from "@/lib/permisos-via-publica/tipos";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * La bandeja se refresca sola: cada minuto normalmente, y cada 10 segundos mientras hay una
 * revisión pedida, para que el resultado de "Revisar ahora" aparezca sin recargar.
 */
export function useBandejaPermisos() {
  return useQuery({
    queryKey: ["permisos-via-publica"],
    queryFn: () => pedir<Bandeja>("/api/permisos-via-publica"),
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.revisando ? 10_000 : 60_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useExpediente(id: string) {
  return useQuery({
    queryKey: ["permiso-via-publica", id],
    queryFn: () => pedir<FichaExpediente>(`/api/permisos-via-publica/${id}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRevisarAhora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ ok: true; yaPedida: boolean }>("/api/permisos-via-publica/revisar", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos-via-publica"] }),
  });
}
