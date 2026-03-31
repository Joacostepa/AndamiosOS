"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Relevamiento = {
  id: string; oportunidad_id: string | null; obra_id: string | null;
  direccion: string; localidad: string | null; provincia: string | null;
  contacto_nombre: string | null; contacto_telefono: string | null;
  relevador_id: string | null; fecha_programada: string | null; fecha_realizada: string | null;
  estado: string; tipo_edificio: string | null; cantidad_pisos: number | null;
  altura_estimada: number | null; metros_lineales: number | null; superficie_fachada: number | null;
  tipo_acceso: string | null; tipo_suelo: string | null; interferencias: string | null;
  requiere_permiso_municipal: boolean; requiere_proteccion_peatonal: boolean;
  requiere_red_seguridad: boolean; horario_restriccion: string | null;
  sistema_recomendado: string | null; tipo_montaje: string | null;
  anclajes_especiales: boolean; observaciones_tecnicas: string | null;
  fotos: string[]; observaciones: string | null; created_at: string;
  oportunidades?: { codigo: string; titulo: string } | null;
};

export function useRelevamientos() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["relevamientos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("relevamientos")
        .select("*, oportunidades(codigo, titulo)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Relevamiento[];
    },
  });
}

export function useRelevamiento(id: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["relevamientos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("relevamientos")
        .select("*, oportunidades(codigo, titulo)").eq("id", id).single();
      if (error) throw error;
      return data as Relevamiento;
    },
    enabled: !!id,
  });
}

export function useCreateRelevamiento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Relevamiento>) => {
      const { data: r, error } = await supabase.from("relevamientos").insert(data).select().single();
      if (error) throw error;
      return r;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relevamientos"] }),
  });
}

export function useUpdateRelevamiento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Relevamiento> }) => {
      const { data: r, error } = await supabase.from("relevamientos").update(data).eq("id", id).select().single();
      if (error) throw error;
      return r;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["relevamientos"] }); qc.invalidateQueries({ queryKey: ["relevamientos", v.id] }); },
  });
}
