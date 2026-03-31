"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type PrecioItem = {
  id: string;
  unidad_cotizacion: string;
  producto: string;
  descripcion: string | null;
  fraccion_dias: number | null;
  precio: number;
  zona: string | null;
  precio_flete: number | null;
  activo: boolean;
  created_at: string;
};

export function useListaPrecios(unidad?: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["lista_precios", unidad],
    queryFn: async () => {
      let query = supabase
        .from("lista_precios")
        .select("*")
        .order("producto")
        .order("fraccion_dias");
      if (unidad) query = query.eq("unidad_cotizacion", unidad);
      const { data, error } = await query;
      if (error) throw error;
      return data as PrecioItem[];
    },
  });
}

export function useCreatePrecio() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<PrecioItem, "id" | "created_at">) => {
      const { data: row, error } = await supabase
        .from("lista_precios")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lista_precios"] }),
  });
}

export function useUpdatePrecio() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PrecioItem> }) => {
      const { error } = await supabase
        .from("lista_precios")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lista_precios"] }),
  });
}

export function useDeletePrecio() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lista_precios")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lista_precios"] }),
  });
}
