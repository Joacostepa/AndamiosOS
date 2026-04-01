"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ObraFormData } from "@/lib/validators/obra";

export type Obra = {
  id: string;
  codigo: string;
  cliente_id: string;
  nombre: string;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  tipo_obra: string;
  tipo_andamio: string;
  estado: string;
  fecha_aprobacion: string | null;
  fecha_inicio_estimada: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_estimada: string | null;
  fecha_fin_real: string | null;
  presupuesto_referencia: string | null;
  observaciones: string | null;
  condiciones_acceso: string | null;
  horario_permitido: string | null;
  unidad_negocio: string | null;
  fecha_vigencia_inicio: string | null;
  fecha_vigencia_fin: string | null;
  estado_pago: string | null;
  monto_alquiler_mensual: number | null;
  cotizacion_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  clientes?: { razon_social: string };
};

export function useObras() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*, clientes(razon_social)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Obra[];
    },
  });
}

export function useObra(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["obras", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*, clientes(razon_social)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Obra;
    },
    enabled: !!id,
  });
}

export function useCreateObra() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ObraFormData) => {
      const { data: obra, error } = await supabase
        .from("obras")
        .insert({ ...data, codigo: "" })
        .select()
        .single();

      if (error) throw error;
      return obra;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["obras"] });
    },
  });
}

export function useUpdateObra() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ObraFormData & { estado: string }>;
    }) => {
      const { data: obra, error } = await supabase
        .from("obras")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return obra;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["obras"] });
      queryClient.invalidateQueries({ queryKey: ["obras", variables.id] });
    },
  });
}
