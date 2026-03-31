"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type RemitoItem = {
  id: string;
  pieza_id: string;
  cantidad_remitida: number;
  cantidad_recibida: number | null;
  observacion: string | null;
  catalogo_piezas?: { codigo: string; descripcion: string };
};

export type Remito = {
  id: string;
  numero: string;
  tipo: "entrega" | "devolucion" | "transferencia";
  obra_id: string;
  estado: string;
  fecha_emision: string;
  fecha_recepcion: string | null;
  chofer_id: string | null;
  vehiculo_id: string | null;
  receptor_nombre: string | null;
  observaciones: string | null;
  tiene_diferencia: boolean;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  personal?: { nombre: string; apellido: string } | null;
  remito_items?: RemitoItem[];
};

export function useRemitos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["remitos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select("*, obras(codigo, nombre), personal:personal!remitos_chofer_id_fkey(nombre, apellido)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Remito[];
    },
  });
}

export function useRemito(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["remitos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select(`
          *,
          obras(codigo, nombre),
          personal:personal!remitos_chofer_id_fkey(nombre, apellido),
          remito_items(*, catalogo_piezas(codigo, descripcion))
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Remito;
    },
    enabled: !!id,
  });
}

export type CreateRemitoData = {
  tipo: "entrega" | "devolucion" | "transferencia";
  obra_id: string;
  chofer_id?: string;
  vehiculo_id?: string;
  observaciones?: string;
  items: { pieza_id: string; cantidad: number }[];
};

export function useCreateRemito() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRemitoData) => {
      // Create remito
      const { data: remito, error: remitoError } = await supabase
        .from("remitos")
        .insert({
          tipo: data.tipo,
          obra_id: data.obra_id,
          numero: "",
          chofer_id: data.chofer_id || null,
          vehiculo_id: data.vehiculo_id || null,
          observaciones: data.observaciones || null,
        })
        .select()
        .single();

      if (remitoError) throw remitoError;

      // Create items
      const items = data.items.map((item) => ({
        remito_id: remito.id,
        pieza_id: item.pieza_id,
        cantidad_remitida: item.cantidad,
      }));

      const { error: itemsError } = await supabase
        .from("remito_items")
        .insert(items);

      if (itemsError) throw itemsError;

      return remito;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remitos"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useUpdateRemito() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        estado: string;
        fecha_recepcion: string;
        receptor_nombre: string;
        tiene_diferencia: boolean;
      }>;
    }) => {
      const { data: remito, error } = await supabase
        .from("remitos")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return remito;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["remitos"] });
      queryClient.invalidateQueries({ queryKey: ["remitos", variables.id] });
    },
  });
}
