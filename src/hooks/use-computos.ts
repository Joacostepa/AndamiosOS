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
  obra_id: string;
  version: number;
  estado: string;
  verificado_por_id: string | null;
  aprobado_por_id: string | null;
  fecha_verificacion: string | null;
  fecha_aprobacion: string | null;
  notas: string | null;
  // Datos de ingeniería (antes vivían en proyectos_tecnicos)
  tipo_sistema_andamio: string | null;
  altura_maxima: number | null;
  metros_lineales: number | null;
  superficie: number | null;
  observaciones_tecnicas: string | null;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  computo_items?: ComputoItem[];
};

export function useComputos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["computos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computos")
        .select("*, obras(codigo, nombre)")
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
        .select("*, obras(codigo, nombre), computo_items(*, catalogo_piezas(codigo, descripcion, categoria))")
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
      obra_id: string;
      tipo_sistema_andamio?: string;
      altura_maxima?: number;
      metros_lineales?: number;
      superficie?: number;
      observaciones_tecnicas?: string;
      notas?: string;
      items: { pieza_id: string; cantidad_requerida: number }[];
    }) => {
      const { items: _items, ...campos } = data;
      const { data: computo, error: computoError } = await supabase
        .from("computos")
        .insert({
          obra_id: campos.obra_id,
          tipo_sistema_andamio: campos.tipo_sistema_andamio || null,
          altura_maxima: campos.altura_maxima ?? null,
          metros_lineales: campos.metros_lineales ?? null,
          superficie: campos.superficie ?? null,
          observaciones_tecnicas: campos.observaciones_tecnicas || null,
          notas: campos.notas || null,
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
