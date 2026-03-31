"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type ParteObra = {
  id: string;
  obra_id: string;
  fecha: string;
  tipo_tarea: string;
  cuadrilla: string[];
  horas_trabajadas: Record<string, number>;
  avance_descripcion: string | null;
  metros_montados: number | null;
  material_utilizado: unknown[];
  observaciones: string | null;
  fotos: string[];
  clima: string | null;
  firmado_por_id: string | null;
  estado: string;
  created_at: string;
  obras?: { codigo: string; nombre: string };
};

export type ParteFormData = {
  obra_id: string;
  fecha?: string;
  tipo_tarea: string;
  cuadrilla?: string[];
  horas_trabajadas?: Record<string, number>;
  avance_descripcion?: string;
  metros_montados?: number;
  observaciones?: string;
  clima?: string;
};

export function usePartes() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["partes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partes_obra")
        .select("*, obras(codigo, nombre)")
        .order("fecha", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as ParteObra[];
    },
  });
}

export function useCreateParte() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ParteFormData) => {
      const { data: parte, error } = await supabase
        .from("partes_obra")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return parte;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partes"] });
    },
  });
}

export function useUpdateParte() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ParteFormData & { estado: string }>;
    }) => {
      const { data: parte, error } = await supabase
        .from("partes_obra")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return parte;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partes"] });
    },
  });
}
