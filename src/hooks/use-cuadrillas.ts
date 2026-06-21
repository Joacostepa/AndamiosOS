"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type PlantelMiembro = {
  id: string;
  personal_id: string;
  personal?: { id: string; nombre: string; apellido: string; puesto: string } | null;
};

export type CuadrillaConfig = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  responsable_id: string | null;
  es_temporaria: boolean;
  cuadrilla_personal?: PlantelMiembro[];
};

const SELECT =
  "id, nombre, orden, activo, responsable_id, es_temporaria, " +
  "cuadrilla_personal(id, personal_id, personal(id, nombre, apellido, puesto))";

function invalidarTodo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["cuadrillas-config"] });
  qc.invalidateQueries({ queryKey: ["cuadrillas"] });
  qc.invalidateQueries({ queryKey: ["planificacion"] });
}

// Todas las cuadrillas (activas + inactivas) con plantel + responsable.
export function useCuadrillasConfig() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["cuadrillas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuadrillas")
        .select(SELECT)
        .order("orden")
        .order("nombre");
      if (error) throw error;
      return data as unknown as CuadrillaConfig[];
    },
  });
}

export function useCreateCuadrilla() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nombre: string; es_temporaria?: boolean }) => {
      const { data: max } = await supabase
        .from("cuadrillas")
        .select("orden")
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle();
      const orden = (max?.orden ?? 0) + 1;
      const { data: c, error } = await supabase
        .from("cuadrillas")
        .insert({ nombre: data.nombre, es_temporaria: data.es_temporaria ?? false, orden })
        .select("id")
        .single();
      if (error) throw error;
      return c;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useUpdateCuadrilla() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ nombre: string; activo: boolean; responsable_id: string | null }>;
    }) => {
      const { error } = await supabase.from("cuadrillas").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useDeleteCuadrilla() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cuadrillas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useAddOperarioPlantel() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cuadrillaId, personalId }: { cuadrillaId: string; personalId: string }) => {
      const { error } = await supabase
        .from("cuadrilla_personal")
        .insert({ cuadrilla_id: cuadrillaId, personal_id: personalId });
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useRemoveOperarioPlantel() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cuadrillaId, personalId }: { cuadrillaId: string; personalId: string }) => {
      const { error } = await supabase
        .from("cuadrilla_personal")
        .delete()
        .eq("cuadrilla_id", cuadrillaId)
        .eq("personal_id", personalId);
      if (error) throw error;
      // Si era el responsable, dejar la cuadrilla sin responsable.
      const { error: e2 } = await supabase
        .from("cuadrillas")
        .update({ responsable_id: null })
        .eq("id", cuadrillaId)
        .eq("responsable_id", personalId);
      if (e2) throw e2;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

// Jornadas futuras (fecha >= hoy) por cuadrilla — para la regla de borrar/desactivar.
export function useFuturasPorCuadrilla() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["cuadrillas", "futuras"],
    queryFn: async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("planificacion_asignaciones")
        .select("cuadrilla_id")
        .gte("fecha", hoy);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { cuadrilla_id: string }[]) {
        map[r.cuadrilla_id] = (map[r.cuadrilla_id] ?? 0) + 1;
      }
      return map;
    },
  });
}
