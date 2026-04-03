"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type CotizacionItem = {
  id: string; cotizacion_id: string; tipo: string; concepto: string;
  detalle: string | null; cantidad: number; unidad: string;
  precio_unitario: number; subtotal: number; orden: number;
};

export type Cotizacion = {
  id: string; codigo: string; oportunidad_id: string | null;
  cliente_id: string | null; relevamiento_id: string | null;
  titulo: string; descripcion_servicio: string | null; condiciones: string | null;
  version: number; estado: string; subtotal: number; iva_porcentaje: number;
  iva_monto: number; total: number; moneda: string;
  fecha_emision: string; validez_dias: number; fecha_vencimiento: string | null;
  condicion_pago: string | null; plazo_alquiler_meses: number | null;
  incluye_montaje: boolean; incluye_desarme: boolean; incluye_transporte: boolean;
  generado_por_ia: boolean; created_at: string;
  unidad_cotizacion: string | null; sub_vertical: string | null;
  fraccion_dias: number | null; zona_entrega: string | null;
  tonelaje_estimado: number | null; urgencia: string | null;
  responsable_id: string | null;
  metadata: Record<string, unknown> | null;
  clientes?: { razon_social: string } | null;
  oportunidades?: { codigo: string; titulo: string } | null;
  cotizacion_items?: CotizacionItem[];
};

export function useCotizaciones() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["cotizaciones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cotizaciones")
        .select("*, clientes(razon_social), oportunidades(codigo, titulo)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Cotizacion[];
    },
  });
}

export function useCotizacion(id: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["cotizaciones", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cotizaciones")
        .select("*, clientes(razon_social), oportunidades(codigo, titulo), cotizacion_items(*)")
        .eq("id", id).single();
      if (error) throw error;
      return data as Cotizacion;
    },
    enabled: !!id,
  });
}

export function useCreateCotizacion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      oportunidad_id?: string; cliente_id?: string; relevamiento_id?: string;
      titulo: string; descripcion_servicio?: string; condiciones?: string;
      condicion_pago?: string; plazo_alquiler_meses?: number;
      unidad_cotizacion?: string; sub_vertical?: string;
      fraccion_dias?: number; zona_entrega?: string;
      tonelaje_estimado?: number; urgencia?: string;
      incluye_montaje?: boolean; incluye_desarme?: boolean; incluye_transporte?: boolean;
      ubicacion?: string; responsable_id?: string; metadata?: Record<string, unknown>;
      imagenes_ids?: string[];
      items: { tipo: string; concepto: string; detalle?: string; cantidad: number; unidad: string; precio_unitario: number }[];
    }) => {
      const { items, imagenes_ids, ...cotData } = data;
      const { data: cot, error } = await supabase.from("cotizaciones")
        .insert({ ...cotData, codigo: "" }).select().single();
      if (error) throw error;

      if (items.length > 0) {
        const dbItems = items.map((item, i) => ({
          cotizacion_id: cot.id, ...item,
          subtotal: item.cantidad * item.precio_unitario, orden: i,
        }));
        const { error: ie } = await supabase.from("cotizacion_items").insert(dbItems);
        if (ie) throw ie;
      }

      // Save selected reference images
      if (imagenes_ids && imagenes_ids.length > 0) {
        const imgRows = imagenes_ids.map((imgId, i) => ({
          cotizacion_id: cot.id,
          imagen_id: imgId,
          orden: i,
        }));
        await supabase.from("cotizacion_imagenes").insert(imgRows);
      }

      return cot;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cotizaciones"] }),
  });
}

export function useUpdateCotizacion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ estado: string; descripcion_servicio: string; condiciones: string }> }) => {
      const { data: c, error } = await supabase.from("cotizaciones").update(data).eq("id", id).select().single();
      if (error) throw error;
      return c;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["cotizaciones"] }); qc.invalidateQueries({ queryKey: ["cotizaciones", v.id] }); },
  });
}
