"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { FiltroOrdenes, ListadoOrdenes, OrdenDetalle } from "@/lib/tablero/tipos-orden";

// Órdenes de Trabajo contra Odoo. Reemplaza a la lectura de la tabla `ordenes_trabajo`
// de Supabase: eran dos listas de OT que no se veían entre sí.

async function pedir<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useOrdenesOdoo(filtro: FiltroOrdenes) {
  return useQuery({
    queryKey: ["ordenes-odoo", filtro],
    queryFn: () => pedir<ListadoOrdenes>(`/api/ordenes-trabajo?filtro=${filtro}`),
    // Cambiar de chip no vacía la tabla: se muestra el filtro anterior hasta que llega el
    // nuevo, para que los contadores no parpadeen.
    placeholderData: keepPreviousData,
    // Un minuto de vigencia. Sin esto, ir de planificación a órdenes y volver repetía las
    // llamadas a Odoo enteras para traer lo mismo — y volver es lo que más se hace.
    // Un minuto es corto para una lista que se mira, no se edita: lo que se escribe acá
    // invalida la query igual.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useOrdenOdoo(id: number | null) {
  return useQuery({
    queryKey: ["orden-odoo", id],
    queryFn: async () => (await pedir<{ orden: OrdenDetalle }>(`/api/ordenes-trabajo/${id}`)).orden,
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}
