"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Inspeccion = {
  id: string; obra_id: string; fecha: string; tipo: string;
  inspector_nombre: string; resultado: string; observaciones: string | null;
  proxima_inspeccion: string | null; acciones_correctivas: string | null; created_at: string;
  obras?: { codigo: string; nombre: string };
};

export function useInspecciones() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["inspecciones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspecciones")
        .select("*, obras(codigo, nombre)").order("fecha", { ascending: false });
      if (error) throw error;
      return data as Inspeccion[];
    },
  });
}

export function useCreateInspeccion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { obra_id: string; tipo: string; inspector_nombre: string; resultado: string; observaciones?: string; proxima_inspeccion?: string; acciones_correctivas?: string }) => {
      const { data: i, error } = await supabase.from("inspecciones").insert(data).select().single();
      if (error) throw error;
      return i;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspecciones"] }),
  });
}
