"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type RemitoItem = {
  id: string;
  pieza_id: string;
  cantidad_remitida: number;
  cantidad_recibida: number | null;
  observacion: string | null;
  catalogo_piezas?: { codigo: string; descripcion: string };
};

export type TipoRemito = "entrega" | "devolucion" | "transferencia" | "sobrante" | "control_devolucion";

export type Remito = {
  id: string;
  numero: string;
  tipo: TipoRemito;
  obra_id: string;
  estado: string;
  fecha_emision: string;
  fecha_recepcion: string | null;
  chofer_id: string | null;
  vehiculo_id: string | null;
  receptor_nombre: string | null;
  observaciones: string | null;
  motivo: string | null;
  remito_origen_id: string | null;
  tiene_diferencia: boolean;
  created_at: string;
  obras?: { codigo: string; nombre: string };
  personal?: { nombre: string; apellido: string } | null;
  remito_items?: RemitoItem[];
};

export function useRemitos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["remitos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select("*, obras(codigo, nombre), personal:personal!remitos_chofer_id_fkey(nombre, apellido)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Remito[];
    },
  });
}

export function useRemitosByObra(obraId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["remitos", "obra", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select("*, personal:personal!remitos_chofer_id_fkey(nombre, apellido)")
        .eq("obra_id", obraId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Remito[];
    },
    enabled: !!obraId,
  });
}

export function useRemito(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["remitos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select(`
          *,
          obras(codigo, nombre),
          personal:personal!remitos_chofer_id_fkey(nombre, apellido),
          remito_items(*, catalogo_piezas(codigo, descripcion))
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Remito;
    },
    enabled: !!id,
  });
}

export type CreateRemitoData = {
  tipo: TipoRemito;
  obra_id: string;
  chofer_id?: string;
  vehiculo_id?: string;
  observaciones?: string;
  motivo?: string;               // por qué sobró (remito sobrante)
  remito_origen_id?: string;     // control_devolucion → remito de devolución que controla
  items: { pieza_id: string; cantidad: number }[];
};

export function useCreateRemito() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRemitoData) => {
      // Create remito
      const { data: remito, error: remitoError } = await supabase
        .from("remitos")
        .insert({
          tipo: data.tipo,
          obra_id: data.obra_id,
          numero: "",
          chofer_id: data.chofer_id || null,
          vehiculo_id: data.vehiculo_id || null,
          observaciones: data.observaciones || null,
          motivo: data.motivo || null,
          remito_origen_id: data.remito_origen_id || null,
        })
        .select()
        .single();

      if (remitoError) throw remitoError;

      // Create items
      const items = data.items.map((item) => ({
        remito_id: remito.id,
        pieza_id: item.pieza_id,
        cantidad_remitida: item.cantidad,
      }));

      const { error: itemsError } = await supabase
        .from("remito_items")
        .insert(items);

      if (itemsError) throw itemsError;

      return remito;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remitos"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useUpdateRemito() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        estado: string;
        fecha_recepcion: string;
        receptor_nombre: string;
        tiene_diferencia: boolean;
      }>;
    }) => {
      const { data: remito, error } = await supabase
        .from("remitos")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return remito;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["remitos"] });
      queryClient.invalidateQueries({ queryKey: ["remitos", variables.id] });
    },
  });
}

// Recepción con conteo: registra cantidad_recibida por ítem y pasa el remito a
// 'recibido' (o 'con_diferencia' si algún conteo no coincide). El trigger de DB
// mueve el stock. Es el control de ingreso del depósito.
export function useRecibirRemito() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      id: string;
      receptor_nombre?: string;
      items: { id: string; cantidad_recibida: number }[];
      conteos: { remitida: number; recibida: number }[];
    }) => {
      for (const it of vars.items) {
        const { error } = await supabase
          .from("remito_items")
          .update({ cantidad_recibida: it.cantidad_recibida })
          .eq("id", it.id);
        if (error) throw error;
      }
      const tieneDiferencia = vars.conteos.some((c) => c.remitida !== c.recibida);
      const { error: re } = await supabase
        .from("remitos")
        .update({
          estado: tieneDiferencia ? "con_diferencia" : "recibido",
          tiene_diferencia: tieneDiferencia,
          fecha_recepcion: new Date().toISOString(),
          receptor_nombre: vars.receptor_nombre || null,
        })
        .eq("id", vars.id);
      if (re) throw re;
      return { id: vars.id };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["remitos"] });
      queryClient.invalidateQueries({ queryKey: ["remitos", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}
