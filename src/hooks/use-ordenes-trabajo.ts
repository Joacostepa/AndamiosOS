"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type OrdenTrabajo = {
  id: string; codigo: string; obra_id: string; tipo: string;
  descripcion: string | null; estado: string;
  fecha_programada: string | null; fecha_ejecucion: string | null;
  hora_inicio: string | null; hora_fin: string | null;
  cuadrilla: string[]; vehiculo_id: string | null;
  responsable_id: string | null;
  horas_estimadas: number | null; horas_reales: number | null;
  observaciones: string | null;
  requiere_habilitacion: boolean; habilitacion_aprobada: boolean;
  es_adicional: boolean; aprobada_comercial: boolean; motivo_adicional: string | null;
  odoo_ot_id: number | null; odoo_sync_estado: string; odoo_sync_error: string | null;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  vehiculos?: { patente: string } | null;
};

export type GateObra = {
  id: string; obra_id: string; tipo_gate: string;
  estado: string; fecha_aprobacion: string | null;
  observaciones: string | null;
};

export type PeriodoAlquiler = {
  id: string; obra_id: string; numero_periodo: number;
  fecha_inicio: string; fecha_fin: string; monto: number;
  estado: string; factura_referencia: string | null;
};

export function useOrdenesTrabajoByObra(obraId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["ordenes-trabajo", "obra", obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordenes_trabajo")
        .select("*, obras(codigo, nombre), vehiculos(patente)")
        .eq("obra_id", obraId).order("fecha_programada", { ascending: false });
      if (error) throw error;
      return data as OrdenTrabajo[];
    },
    enabled: !!obraId,
  });
}

export function useOrdenesTrabajo() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["ordenes-trabajo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordenes_trabajo")
        .select("*, obras(codigo, nombre), vehiculos(patente)")
        .order("fecha_programada", { ascending: true });
      if (error) throw error;
      return data as OrdenTrabajo[];
    },
  });
}

// RETIRADO: useOrdenesPendientesHabilitacion().
//
// Era la cola vieja del módulo —`requiere_habilitacion && !habilitacion_aprobada` sobre
// la tabla `ordenes_trabajo` de Supabase— y modelaba la habilitación como un solo
// booleano. La reemplaza /habilitaciones, que lee las OTs de Odoo y trabaja con
// requisitos de estado propio: en una obra exigente el cliente aprueba 7 documentos y
// observa 2, y ese rebote es lo que hace que una habilitación tarde semanas.
//
// Las dos columnas booleanas quedan en la base sin uso hasta una migración posterior.

export function useGatesObra(obraId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["gates", obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gates_obra")
        .select("*").eq("obra_id", obraId).order("tipo_gate");
      if (error) throw error;
      return data as GateObra[];
    },
    enabled: !!obraId,
  });
}

export function usePeriodosAlquiler(obraId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["periodos", obraId],
    queryFn: async () => {
      const { data, error } = await supabase.from("periodos_alquiler")
        .select("*").eq("obra_id", obraId).order("numero_periodo");
      if (error) throw error;
      return data as PeriodoAlquiler[];
    },
    enabled: !!obraId,
  });
}




export function useUpdateOrdenTrabajo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OrdenTrabajo> }) => {
      const { data: ot, error } = await supabase.from("ordenes_trabajo")
        .update(data).eq("id", id).select().single();
      if (error) throw error;
      return ot;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ordenes-trabajo"] }),
  });
}

export function useUpdateGate() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GateObra> }) => {
      const { data: gate, error } = await supabase.from("gates_obra")
        .update(data).eq("id", id).select().single();
      if (error) throw error;
      return gate;
    },
    onSuccess: (g) => qc.invalidateQueries({ queryKey: ["gates", g.obra_id] }),
  });
}

export function useCreatePeriodo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { obra_id: string; numero_periodo: number; fecha_inicio: string; fecha_fin: string; monto: number }) => {
      const { data: p, error } = await supabase.from("periodos_alquiler").insert(data).select().single();
      if (error) throw error;
      return p;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["periodos", v.obra_id] }),
  });
}
