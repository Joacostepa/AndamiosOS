"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Permiso = {
  id: string; obra_id: string; tipo_permiso: string; organismo: string;
  fecha_solicitud: string; fecha_otorgamiento: string | null; fecha_vencimiento: string | null;
  estado: string; costo: number | null; notas_seguimiento: { fecha: string; nota: string }[];
  created_at: string; obras?: { codigo: string; nombre: string };
};

export function usePermisos() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["permisos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permisos_municipales")
        .select("*, obras(codigo, nombre)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Permiso[];
    },
  });
}

export function useCreatePermiso() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { obra_id: string; tipo_permiso: string; organismo: string; fecha_vencimiento?: string; costo?: number }) => {
      const { data: p, error } = await supabase.from("permisos_municipales").insert(data).select().single();
      if (error) throw error;
      return p;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos"] }),
  });
}

export function useUpdatePermiso() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ estado: string }> }) => {
      const { data: p, error } = await supabase.from("permisos_municipales").update(data).eq("id", id).select().single();
      if (error) throw error;
      return p;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos"] }),
  });
}
