"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type SolicitudExtra = {
  id: string;
  obra_id: string;
  solicitante_id: string | null;
  motivo: string;
  urgencia: string;
  estado: string;
  aprobador_id: string | null;
  remito_id: string | null;
  observaciones: string | null;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  personal?: { nombre: string; apellido: string } | null;
  solicitud_extra_items?: {
    id: string;
    pieza_id: string;
    cantidad: number;
    catalogo_piezas?: { codigo: string; descripcion: string };
  }[];
};

export function useSolicitudesExtra() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["solicitudes-extra"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitudes_extra")
        .select("*, obras(codigo, nombre), personal(nombre, apellido)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SolicitudExtra[];
    },
  });
}

export function useSolicitudExtra(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["solicitudes-extra", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitudes_extra")
        .select("*, obras(codigo, nombre), personal(nombre, apellido), solicitud_extra_items(*, catalogo_piezas(codigo, descripcion))")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as SolicitudExtra;
    },
    enabled: !!id,
  });
}

export function useCreateSolicitudExtra() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      obra_id: string;
      motivo: string;
      urgencia: string;
      observaciones?: string;
      items: { pieza_id: string; cantidad: number }[];
    }) => {
      const { data: solicitud, error: solError } = await supabase
        .from("solicitudes_extra")
        .insert({
          obra_id: data.obra_id,
          motivo: data.motivo,
          urgencia: data.urgencia,
          observaciones: data.observaciones || null,
        })
        .select()
        .single();

      if (solError) throw solError;

      if (data.items.length > 0) {
        const items = data.items.map((item) => ({
          solicitud_id: solicitud.id,
          pieza_id: item.pieza_id,
          cantidad: item.cantidad,
        }));

        const { error: itemsError } = await supabase
          .from("solicitud_extra_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return solicitud;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solicitudes-extra"] });
    },
  });
}

export function useUpdateSolicitudExtra() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ estado: string; observaciones: string }>;
    }) => {
      const { data: solicitud, error } = await supabase
        .from("solicitudes_extra")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return solicitud;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["solicitudes-extra"] });
      queryClient.invalidateQueries({ queryKey: ["solicitudes-extra", variables.id] });
    },
  });
}
