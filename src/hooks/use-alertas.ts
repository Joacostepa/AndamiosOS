"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Alerta = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  prioridad: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  leida: boolean;
  created_at: string;
};

export function useAlertas() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as Alerta[];
    },
  });
}

export function useAlertasCount() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["alertas-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("alertas")
        .select("*", { count: "exact", head: true })
        .eq("leida", false);

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60000,
  });
}

export function useMarkAlertaRead() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alertas")
        .update({ leida: true })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertas"] });
      queryClient.invalidateQueries({ queryKey: ["alertas-count"] });
    },
  });
}
