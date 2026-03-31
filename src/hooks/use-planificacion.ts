"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Tarea = {
  id: string;
  tipo: string;
  obra_id: string;
  fecha_programada: string;
  hora_inicio: string | null;
  hora_fin_estimada: string | null;
  cuadrilla: string[];
  vehiculo_id: string | null;
  estado: string;
  prioridad: string;
  observaciones: string | null;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  vehiculos?: { patente: string; marca: string; modelo: string } | null;
};

export type TareaFormData = {
  tipo: string;
  obra_id: string;
  fecha_programada: string;
  hora_inicio?: string;
  hora_fin_estimada?: string;
  cuadrilla?: string[];
  vehiculo_id?: string;
  prioridad?: string;
  observaciones?: string;
};

export function useTareas(fecha?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["planificacion", fecha],
    queryFn: async () => {
      let query = supabase
        .from("planificacion_tareas")
        .select("*, obras(codigo, nombre), vehiculos(patente, marca, modelo)")
        .order("fecha_programada", { ascending: true })
        .order("hora_inicio", { ascending: true });

      if (fecha) {
        query = query.eq("fecha_programada", fecha);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Tarea[];
    },
  });
}

export function useCreateTarea() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TareaFormData) => {
      const { data: tarea, error } = await supabase
        .from("planificacion_tareas")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return tarea;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planificacion"] });
    },
  });
}

export function useUpdateTarea() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<TareaFormData & { estado: string }>;
    }) => {
      const { data: tarea, error } = await supabase
        .from("planificacion_tareas")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return tarea;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planificacion"] });
    },
  });
}
