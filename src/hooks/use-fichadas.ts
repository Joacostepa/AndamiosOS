"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Fichada = {
  id: string; personal_id: string; tipo: string; obra_id: string | null;
  ubicacion: string; latitud: number | null; longitud: number | null;
  dentro_geocerca: boolean; distancia_obra: number | null;
  device_id: string | null; estado: string; foto_url: string | null;
  observaciones: string | null; fecha: string;
  personal?: { nombre: string; apellido: string; dni: string };
  obras?: { codigo: string; nombre: string } | null;
};

export function useFichadas(fecha?: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["fichadas", fecha],
    queryFn: async () => {
      let q = supabase.from("fichadas")
        .select("*, personal(nombre, apellido, dni), obras(codigo, nombre)")
        .order("fecha", { ascending: false }).limit(100);
      if (fecha) {
        q = q.gte("fecha", `${fecha}T00:00:00`).lte("fecha", `${fecha}T23:59:59`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Fichada[];
    },
  });
}

export function useRegistrarFichada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      personal_id: string; tipo: string; qr_token: string;
      latitud?: number; longitud?: number; precision_gps?: number;
      device_id?: string; nombre_dispositivo?: string;
    }) => {
      const res = await fetch("/api/fichadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fichadas"] }),
  });
}

export function useGenerarQR() {
  return useMutation({
    mutationFn: async (params: { obra_id?: string; ubicacion?: string }) => {
      const url = new URL("/api/fichadas", window.location.origin);
      url.searchParams.set("action", "generate-qr");
      if (params.obra_id) url.searchParams.set("obra_id", params.obra_id);
      if (params.ubicacion) url.searchParams.set("ubicacion", params.ubicacion);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data as { token: string; expira_at: string };
    },
  });
}
