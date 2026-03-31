"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type ProyectoTecnico = {
  id: string;
  obra_id: string;
  codigo: string;
  tecnico_asignado_id: string | null;
  estado: string;
  fecha_solicitud: string;
  fecha_entrega_estimada: string | null;
  fecha_entrega_real: string | null;
  tipo_sistema_andamio: string | null;
  altura_maxima: number | null;
  metros_lineales: number | null;
  superficie: number | null;
  observaciones_tecnicas: string | null;
  version: number;
  aprobado_por_id: string | null;
  fecha_aprobacion: string | null;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  user_profiles?: { nombre: string; apellido: string } | null;
};

export type ProyectoFormData = {
  obra_id: string;
  tecnico_asignado_id?: string;
  fecha_entrega_estimada?: string;
  tipo_sistema_andamio?: string;
  altura_maxima?: number;
  metros_lineales?: number;
  superficie?: number;
  observaciones_tecnicas?: string;
};

export function useProyectos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos_tecnicos")
        .select("*, obras(codigo, nombre), user_profiles:user_profiles!proyectos_tecnicos_tecnico_asignado_id_fkey(nombre, apellido)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ProyectoTecnico[];
    },
  });
}

export function useProyecto(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["proyectos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos_tecnicos")
        .select("*, obras(codigo, nombre), user_profiles:user_profiles!proyectos_tecnicos_tecnico_asignado_id_fkey(nombre, apellido)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as ProyectoTecnico;
    },
    enabled: !!id,
  });
}

export function useCreateProyecto() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProyectoFormData) => {
      const { data: proyecto, error } = await supabase
        .from("proyectos_tecnicos")
        .insert({ ...data, codigo: "" })
        .select()
        .single();

      if (error) throw error;
      return proyecto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proyectos"] });
    },
  });
}

export function useUpdateProyecto() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ProyectoFormData & { estado: string }>;
    }) => {
      const { data: proyecto, error } = await supabase
        .from("proyectos_tecnicos")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return proyecto;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["proyectos"] });
      queryClient.invalidateQueries({ queryKey: ["proyectos", variables.id] });
    },
  });
}
