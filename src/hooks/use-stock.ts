"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type StockItem = {
  id: string;
  pieza_id: string;
  total: number;
  en_deposito: number;
  comprometido: number;
  en_obras: number;
  en_transito: number;
  danado: number;
  updated_at: string;
  catalogo_piezas: {
    codigo: string;
    descripcion: string;
    categoria: string;
    sistema_andamio: string;
    stock_minimo: number;
  };
};

export type Movimiento = {
  id: string;
  tipo: string;
  pieza_id: string;
  cantidad: number;
  obra_origen_id: string | null;
  obra_destino_id: string | null;
  remito_id: string | null;
  motivo: string | null;
  responsable_id: string | null;
  fecha: string;
  catalogo_piezas?: { codigo: string; descripcion: string };
  obras_origen?: { nombre: string } | null;
  obras_destino?: { nombre: string } | null;
};

export function useStock() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock")
        .select("*, catalogo_piezas(codigo, descripcion, categoria, sistema_andamio, stock_minimo)")
        .order("pieza_id");

      if (error) throw error;
      return data as StockItem[];
    },
  });
}

export function useMovimientos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["movimientos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimientos")
        .select(`
          *,
          catalogo_piezas(codigo, descripcion),
          obras_origen:obras!movimientos_obra_origen_id_fkey(nombre),
          obras_destino:obras!movimientos_obra_destino_id_fkey(nombre)
        `)
        .order("fecha", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as Movimiento[];
    },
  });
}

export type MovimientoFormData = {
  tipo: string;
  pieza_id: string;
  cantidad: number;
  obra_origen_id?: string;
  obra_destino_id?: string;
  motivo?: string;
};

export function useCreateMovimiento() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MovimientoFormData) => {
      const { data: mov, error } = await supabase
        .from("movimientos")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return mov;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
    },
  });
}
