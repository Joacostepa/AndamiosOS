"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type FleteZona = {
  id: string;
  zona: string;
  precio: number;
  activo: boolean;
  created_at: string;
};

export function useFletes() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["fletes_zona"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fletes_zona")
        .select("*")
        .order("zona");
      if (error) throw error;
      return data as FleteZona[];
    },
  });
}

export function useCreateFlete() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { zona: string; precio: number }) => {
      const { data: row, error } = await supabase
        .from("fletes_zona")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fletes_zona"] }),
  });
}

export function useUpdateFlete() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FleteZona> }) => {
      const { error } = await supabase
        .from("fletes_zona")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fletes_zona"] }),
  });
}

export function useDeleteFlete() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fletes_zona")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fletes_zona"] }),
  });
}
