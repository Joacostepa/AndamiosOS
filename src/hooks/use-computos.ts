"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type ComputoItem = {
  id: string;
  pieza_id: string;
  cantidad_requerida: number;
  cantidad_disponible: number | null;
  notas: string | null;
  catalogo_piezas?: { codigo: string; descripcion: string; categoria: string };
};

export type Computo = {
  id: string;
  proyecto_tecnico_id: string;
  version: number;
  estado: string;
  verificado_por_id: string | null;
  aprobado_por_id: string | null;
  fecha_verificacion: string | null;
  fecha_aprobacion: string | null;
  notas: string | null;
  created_at: string;
  proyectos_tecnicos?: { codigo: string; obras: { codigo: string; nombre: string } };
  computo_items?: ComputoItem[];
};

export function useComputos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["computos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computos")
        .select("*, proyectos_tecnicos(codigo, obras(codigo, nombre))")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Computo[];
    },
  });
}

export function useComputo(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["computos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computos")
        .select("*, proyectos_tecnicos(codigo, obras(codigo, nombre)), computo_items(*, catalogo_piezas(codigo, descripcion, categoria))")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Computo;
    },
    enabled: !!id,
  });
}

export function useCreateComputo() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      proyecto_tecnico_id: string;
      notas?: string;
      items: { pieza_id: string; cantidad_requerida: number }[];
    }) => {
      const { data: computo, error: computoError } = await supabase
        .from("computos")
        .insert({
          proyecto_tecnico_id: data.proyecto_tecnico_id,
          notas: data.notas || null,
        })
        .select()
        .single();

      if (computoError) throw computoError;

      if (data.items.length > 0) {
        const items = data.items.map((item) => ({
          computo_id: computo.id,
          pieza_id: item.pieza_id,
          cantidad_requerida: item.cantidad_requerida,
        }));

        const { error: itemsError } = await supabase
          .from("computo_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return computo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["computos"] });
    },
  });
}

export function useUpdateComputo() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ estado: string; notas: string }>;
    }) => {
      const { data: computo, error } = await supabase
        .from("computos")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return computo;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["computos"] });
      queryClient.invalidateQueries({ queryKey: ["computos", variables.id] });
    },
  });
}
