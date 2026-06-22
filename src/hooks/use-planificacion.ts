"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Cuadrilla = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  responsable_id: string | null;
  cuadrilla_personal?: {
    personal_id: string;
    personal?: { id: string; nombre: string; apellido: string } | null;
  }[];
};

export type ViajePlan = {
  id: string;
  asignacion_id: string;
  camion_id: string;
  chofer_id: string | null;
  franja_desde: string;
  franja_hasta: string;
  camion?: { patente: string; marca: string | null; modelo: string | null } | null;
  chofer?: { nombre: string; apellido: string } | null;
};

export type PersonalAsignado = {
  personal_id: string;
  personal?: { id: string; nombre: string; apellido: string; puesto: string } | null;
};

export type AsignacionOTLite = {
  codigo: string;
  tipo: string;
  es_adicional: boolean;
  horas_estimadas: number | null;
  estado: string;
  requiere_habilitacion: boolean;
  habilitacion_aprobada: boolean;
  obras?: { nombre: string } | null;
};

export type Asignacion = {
  id: string;
  ot_id: string;
  cuadrilla_id: string;
  fecha: string;
  horas_jornada: number;
  hora_inicio: string;
  estado: string;
  observaciones: string | null;
  jornada_id: string | null;
  ordenes_trabajo?: AsignacionOTLite | null;
  jornada?: { numero: number } | null;
  planificacion_asignacion_personal?: PersonalAsignado[];
  planificacion_viajes?: ViajePlan[];
};

export type JornadaColaRow = {
  id: string;
  ot_id: string;
  numero: number;
  estado: string; // pendiente | asignada | ejecutada
  asignacion_id: string | null;
  ordenes_trabajo: ColaOT;
  asignacion?: { fecha: string; cuadrilla_id: string } | null;
};

export type Bloqueo = {
  id: string;
  cuadrilla_id: string;
  fecha: string;
  franja_desde: string;
  franja_hasta: string;
  motivo: string | null;
};

export type ColaOT = {
  id: string;
  codigo: string;
  tipo: string;
  es_adicional: boolean;
  horas_estimadas: number | null;
  estado: string;
  requiere_habilitacion: boolean;
  habilitacion_aprobada: boolean;
  obras?: { nombre: string } | null;
};

const ASIGNACION_SELECT =
  "*, ordenes_trabajo(codigo, tipo, es_adicional, horas_estimadas, estado, requiere_habilitacion, habilitacion_aprobada, obras(nombre)), " +
  "planificacion_asignacion_personal(personal_id, personal(id, nombre, apellido, puesto)), " +
  "planificacion_viajes(id, asignacion_id, camion_id, chofer_id, franja_desde, franja_hasta, camion:vehiculos!camion_id(patente, marca, modelo), chofer:personal!chofer_id(nombre, apellido)), " +
  "jornada:ot_jornadas!jornada_id(numero)";

export function useCuadrillas() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["cuadrillas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuadrillas")
        .select(
          "id, nombre, orden, activo, responsable_id, cuadrilla_personal(personal_id, personal(id, nombre, apellido))",
        )
        .eq("activo", true)
        .order("orden");
      if (error) throw error;
      return data as unknown as Cuadrilla[];
    },
  });
}

export function useAsignacionesSemana(desde: string, hasta: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["planificacion", "asignaciones", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planificacion_asignaciones")
        .select(ASIGNACION_SELECT)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("hora_inicio");
      if (error) throw error;
      return data as unknown as Asignacion[];
    },
    enabled: !!desde && !!hasta,
  });
}

export function useBloqueosSemana(desde: string, hasta: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["planificacion", "bloqueos", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planificacion_bloqueos")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (error) throw error;
      return data as Bloqueo[];
    },
    enabled: !!desde && !!hasta,
  });
}

// OTs candidatas para la cola: pendientes/programadas (las en_curso ya están en el
// tablero, las cerradas no aparecen). El front separa habilitadas vs pendientes de
// habilitación y excluye las que ya tienen asignación en la semana visible.
export function useColaOTs() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["planificacion", "cola"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_trabajo")
        .select(
          "id, codigo, tipo, es_adicional, horas_estimadas, estado, requiere_habilitacion, habilitacion_aprobada, obras(nombre)",
        )
        .in("estado", ["pendiente", "programada"])
        .order("fecha_programada", { ascending: true });
      if (error) throw error;
      return data as unknown as ColaOT[];
    },
  });
}

export type SaveAsignacionInput = {
  id: string | null;
  ot_id: string;
  cuadrilla_id: string;
  fecha: string;
  horas_jornada: number;
  hora_inicio: string;
  estado: string;
  jornada_id?: string | null;
  personalIds: string[];
  viajes: {
    camion_id: string;
    chofer_id: string | null;
    franja_desde: string;
    franja_hasta: string;
  }[];
};

// Crea/actualiza la jornada y reemplaza personal y viajes (delete + insert).
export function useSaveAsignacion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveAsignacionInput) => {
      let id = input.id;

      if (!id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: asig, error } = await supabase
          .from("planificacion_asignaciones")
          .insert({
            ot_id: input.ot_id,
            cuadrilla_id: input.cuadrilla_id,
            fecha: input.fecha,
            horas_jornada: input.horas_jornada,
            hora_inicio: input.hora_inicio,
            estado: input.estado,
            jornada_id: input.jornada_id ?? null,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = asig.id as string;
      } else {
        const { error } = await supabase
          .from("planificacion_asignaciones")
          .update({
            cuadrilla_id: input.cuadrilla_id,
            fecha: input.fecha,
            horas_jornada: input.horas_jornada,
            hora_inicio: input.hora_inicio,
            estado: input.estado,
            jornada_id: input.jornada_id ?? null,
          })
          .eq("id", id);
        if (error) throw error;
      }

      // Reemplazar personal
      const { error: delPers } = await supabase
        .from("planificacion_asignacion_personal")
        .delete()
        .eq("asignacion_id", id);
      if (delPers) throw delPers;
      if (input.personalIds.length > 0) {
        const { error: insPers } = await supabase
          .from("planificacion_asignacion_personal")
          .insert(input.personalIds.map((personal_id) => ({ asignacion_id: id, personal_id })));
        if (insPers) throw insPers;
      }

      // Reemplazar viajes
      const { error: delV } = await supabase
        .from("planificacion_viajes")
        .delete()
        .eq("asignacion_id", id);
      if (delV) throw delV;
      if (input.viajes.length > 0) {
        const { error: insV } = await supabase
          .from("planificacion_viajes")
          .insert(input.viajes.map((v) => ({ ...v, asignacion_id: id })));
        if (insV) throw insV;
      }

      return { id: id as string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}

export function useDeleteAsignacion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("planificacion_asignaciones")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}

export function useCreateBloqueo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      cuadrilla_id: string;
      fecha: string;
      franja_desde: string;
      franja_hasta: string;
      motivo?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: b, error } = await supabase
        .from("planificacion_bloqueos")
        .insert({ ...data, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return b as Bloqueo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}

export function useDeleteBloqueo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planificacion_bloqueos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}

// Jornadas de las OTs candidatas (pendiente/programada), para la cola agrupada.
export function useJornadasCola() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["planificacion", "jornadas-cola"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ot_jornadas")
        .select(
          "id, ot_id, numero, estado, asignacion_id, " +
            "ordenes_trabajo!inner(id, codigo, tipo, es_adicional, horas_estimadas, estado, requiere_habilitacion, habilitacion_aprobada, obras(nombre)), " +
            "asignacion:planificacion_asignaciones!asignacion_id(fecha, cuadrilla_id)",
        )
        .in("ordenes_trabajo.estado", ["pendiente", "programada"])
        .order("numero");
      if (error) throw error;
      return data as unknown as JornadaColaRow[];
    },
  });
}

export function useMoverAsignacion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fecha }: { id: string; fecha: string }) => {
      const { error } = await supabase
        .from("planificacion_asignaciones")
        .update({ fecha })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}

// Reordenar las jornadas de un día: re-encadena hora_inicio según el nuevo orden.
export function useReordenarDia() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; hora_inicio: string }[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from("planificacion_asignaciones")
          .update({ hora_inicio: u.hora_inicio })
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}

// Volver una OT completa a pendiente: borra todas sus asignaciones (los triggers
// liberan las jornadas a 'pendiente').
export function useVolverOtPendiente() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otId: string) => {
      const { error } = await supabase
        .from("planificacion_asignaciones")
        .delete()
        .eq("ot_id", otId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planificacion"] }),
  });
}
