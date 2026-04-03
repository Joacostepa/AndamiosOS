"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type ImagenReferencia = {
  id: string;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  tags: string[];
  url: string;
  activo: boolean;
  created_at: string;
};

export function useImagenesReferencia(categoria?: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["imagenes_referencia", categoria],
    queryFn: async () => {
      let query = supabase
        .from("imagenes_referencia")
        .select("*")
        .eq("activo", true)
        .order("created_at", { ascending: false });
      if (categoria) query = query.eq("categoria", categoria);
      const { data, error } = await query;
      if (error) throw error;
      return data as ImagenReferencia[];
    },
  });
}

export function useCreateImagenReferencia() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      titulo: string;
      descripcion?: string | null;
      categoria: string;
      tags?: string[];
      url: string;
    }) => {
      const { data: img, error } = await supabase
        .from("imagenes_referencia")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return img;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["imagenes_referencia"] }),
  });
}

export function useDeleteImagenReferencia() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imagenes_referencia").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["imagenes_referencia"] }),
  });
}

export function useCotizacionImagenes(cotizacionId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["cotizacion_imagenes", cotizacionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cotizacion_imagenes")
        .select("*, imagenes_referencia(*)")
        .eq("cotizacion_id", cotizacionId)
        .order("orden");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!cotizacionId,
  });
}
