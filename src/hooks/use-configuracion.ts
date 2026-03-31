"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Configuracion = {
  id: string;
  clave: string;
  valor: string;
  descripcion: string | null;
  updated_at: string;
};

export function useConfiguracion() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["configuracion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracion")
        .select("*")
        .order("clave");
      if (error) throw error;
      return data as Configuracion[];
    },
  });
}

export function useUpdateConfiguracion() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clave, valor }: { clave: string; valor: string }) => {
      const { data, error } = await supabase
        .from("configuracion")
        .update({ valor })
        .eq("clave", clave)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["configuracion"] }),
  });
}
