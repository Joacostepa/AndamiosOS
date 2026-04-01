"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Oportunidad = {
  id: string; codigo: string; cliente_id: string | null;
  cliente_nombre: string | null; cliente_telefono: string | null; cliente_email: string | null;
  tipo_cliente: string; tamano: string; perfil_decision: string; relacion: string;
  situacion: string; poder_decision: string; rango_presupuesto: string; zona: string | null;
  titulo: string; descripcion: string | null; estado: string;
  monto_estimado: number | null; probabilidad: number;
  fecha_cierre_estimada: string | null; competidores: string | null;
  motivo_perdida: string | null; origen: string; referido_por: string | null;
  responsable_id: string | null; obra_id: string | null; unidad_negocio: string | null;
  created_at: string; updated_at: string;
  clientes?: { razon_social: string } | null;
};

export type Actividad = {
  id: string; oportunidad_id: string; tipo: string; titulo: string;
  descripcion: string | null; fecha: string; fecha_seguimiento: string | null; created_at: string;
  user_profiles?: { nombre: string; apellido: string } | null;
};

export function useOportunidades() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["oportunidades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("oportunidades")
        .select("*, clientes(razon_social)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Oportunidad[];
    },
  });
}

export function useOportunidad(id: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["oportunidades", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("oportunidades")
        .select("*, clientes(razon_social)").eq("id", id).single();
      if (error) throw error;
      return data as Oportunidad;
    },
    enabled: !!id,
  });
}

export function useActividades(oportunidadId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["actividades", oportunidadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("actividades")
        .select("*, user_profiles(nombre, apellido)")
        .eq("oportunidad_id", oportunidadId).order("fecha", { ascending: false });
      if (error) throw error;
      return data as Actividad[];
    },
    enabled: !!oportunidadId,
  });
}

export function useCreateOportunidad() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Oportunidad>) => {
      const { data: op, error } = await supabase.from("oportunidades")
        .insert({ ...data, codigo: "" }).select().single();
      if (error) throw error;
      return op;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}

export function useUpdateOportunidad() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Oportunidad> }) => {
      const { data: op, error } = await supabase.from("oportunidades").update(data).eq("id", id).select().single();
      if (error) throw error;
      return op;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["oportunidades"] }); qc.invalidateQueries({ queryKey: ["oportunidades", v.id] }); },
  });
}

export function useCreateActividad() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { oportunidad_id: string; tipo: string; titulo: string; descripcion?: string }) => {
      const { data: act, error } = await supabase.from("actividades").insert(data).select().single();
      if (error) throw error;
      return act;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["actividades", v.oportunidad_id] }),
  });
}
