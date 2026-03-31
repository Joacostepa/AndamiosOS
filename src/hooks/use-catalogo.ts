"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Pieza = {
  id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  sistema_andamio: string;
  peso_kg: number | null;
  unidad_medida: string;
  foto_url: string | null;
  activo: boolean;
  stock_minimo: number;
  created_at: string;
};

export type PiezaFormData = {
  codigo: string;
  descripcion: string;
  categoria: string;
  sistema_andamio: string;
  peso_kg?: number | null;
  unidad_medida?: string;
  stock_minimo?: number;
};

export function useCatalogo() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["catalogo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_piezas")
        .select("*")
        .eq("activo", true)
        .order("codigo");

      if (error) throw error;
      return data as Pieza[];
    },
  });
}

export function useCreatePieza() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PiezaFormData) => {
      const { data: pieza, error } = await supabase
        .from("catalogo_piezas")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return pieza;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useUpdatePieza() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<PiezaFormData>;
    }) => {
      const { data: pieza, error } = await supabase
        .from("catalogo_piezas")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return pieza;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
    },
  });
}
