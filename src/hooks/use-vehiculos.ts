"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Vehiculo = {
  id: string; patente: string; marca: string | null; modelo: string | null;
  anio: number | null; tipo: string; capacidad_carga_kg: number | null;
  estado: string; km_actual: number; activo: boolean; observaciones: string | null;
  created_at: string;
  personal?: { nombre: string; apellido: string } | null;
};

export type Mantenimiento = {
  id: string; entidad_tipo: string; entidad_id: string; tipo: string;
  descripcion: string; fecha_programada: string | null; fecha_realizada: string | null;
  proximo_mantenimiento: string | null; costo: number | null; proveedor: string | null;
  estado: string; observaciones: string | null; created_at: string;
};

export function useVehiculos() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["vehiculos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehiculos")
        .select("*, personal:personal!vehiculos_chofer_habitual_id_fkey(nombre, apellido)")
        .eq("activo", true).order("patente");
      if (error) throw error;
      return data as Vehiculo[];
    },
  });
}

export function useMantenimientos(vehiculoId?: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["mantenimientos", vehiculoId],
    queryFn: async () => {
      let q = supabase.from("mantenimientos").select("*").order("fecha_programada", { ascending: false });
      if (vehiculoId) q = q.eq("entidad_id", vehiculoId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Mantenimiento[];
    },
  });
}

export function useCreateVehiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { patente: string; marca?: string; modelo?: string; anio?: number; tipo: string; capacidad_carga_kg?: number }) => {
      const { data: v, error } = await supabase.from("vehiculos").insert(data).select().single();
      if (error) throw error;
      return v;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehiculos"] }),
  });
}

export function useCreateMantenimiento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { entidad_tipo?: string; entidad_id: string; tipo: string; descripcion: string; fecha_programada?: string; costo?: number; proveedor?: string }) => {
      const { data: m, error } = await supabase.from("mantenimientos").insert({ ...data, entidad_tipo: data.entidad_tipo || "vehiculo" }).select().single();
      if (error) throw error;
      return m;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mantenimientos"] }),
  });
}
