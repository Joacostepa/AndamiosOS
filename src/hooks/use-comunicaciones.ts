"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Comunicacion = {
  id: string; obra_id: string; tipo: string; asunto: string;
  contenido: string; autor_id: string | null; created_at: string;
  user_profiles?: { nombre: string; apellido: string } | null;
};

export function useComunicaciones(obraId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["comunicaciones", obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from("comunicaciones")
        .select("*, user_profiles(nombre, apellido)")
        .eq("obra_id", obraId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Comunicacion[];
    },
    enabled: !!obraId,
  });
}

export function useCreateComunicacion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { obra_id: string; tipo?: string; asunto: string; contenido: string }) => {
      const { data: c, error } = await supabase.from("comunicaciones").insert({ ...data, tipo: data.tipo || "nota" }).select().single();
      if (error) throw error;
      return c;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["comunicaciones", vars.obra_id] }),
  });
}
