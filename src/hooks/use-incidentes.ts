"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Incidente = {
  id: string; obra_id: string | null; tipo: string; severidad: string;
  descripcion: string; acciones_tomadas: string | null; acciones_correctivas: string | null;
  estado: string; fecha_cierre: string | null; created_at: string;
  obras?: { codigo: string; nombre: string } | null;
};

export function useIncidentes() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["incidentes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("incidentes")
        .select("*, obras(codigo, nombre)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Incidente[];
    },
  });
}

export function useCreateIncidente() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { obra_id?: string; tipo: string; severidad: string; descripcion: string; acciones_tomadas?: string }) => {
      const { data: inc, error } = await supabase.from("incidentes").insert(data).select().single();
      if (error) throw error;
      return inc;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidentes"] }),
  });
}

export function useUpdateIncidente() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ estado: string; acciones_correctivas: string; fecha_cierre: string }> }) => {
      const { data: inc, error } = await supabase.from("incidentes").update(data).eq("id", id).select().single();
      if (error) throw error;
      return inc;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidentes"] }),
  });
}
