"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ClienteFormData } from "@/lib/validators/cliente";

export type Cliente = {
  id: string;
  razon_social: string;
  cuit: string | null;
  domicilio_fiscal: string | null;
  telefono: string | null;
  email: string | null;
  condicion_iva: string | null;
  contactos: Array<{ nombre: string; telefono: string; cargo: string }>;
  estado: "activo" | "inactivo";
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export function useClientes() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("razon_social");

      if (error) throw error;
      return data as Cliente[];
    },
  });
}

export function useCliente(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["clientes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Cliente;
    },
    enabled: !!id,
  });
}

export function useCreateCliente() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ClienteFormData) => {
      const { data: cliente, error } = await supabase
        .from("clientes")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return cliente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}

export function useUpdateCliente() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ClienteFormData>;
    }) => {
      const { data: cliente, error } = await supabase
        .from("clientes")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return cliente;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({
        queryKey: ["clientes", variables.id],
      });
    },
  });
}
