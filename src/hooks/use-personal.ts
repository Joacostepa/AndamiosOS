"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Personal = {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  cuil: string | null;
  fecha_nacimiento: string | null;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  puesto: string;
  categoria: string | null;
  especialidad: string | null;
  fecha_ingreso: string | null;
  estado_habilitacion: string;
  art_empresa: string | null;
  obra_social: string | null;
  disponible: boolean;
  activo: boolean;
  observaciones: string | null;
  created_at: string;
};

export type PersonalFormData = {
  nombre: string;
  apellido: string;
  dni: string;
  cuil?: string;
  fecha_nacimiento?: string;
  domicilio?: string;
  telefono?: string;
  email?: string;
  contacto_emergencia_nombre?: string;
  contacto_emergencia_telefono?: string;
  puesto: string;
  categoria?: string;
  especialidad?: string;
  fecha_ingreso?: string;
  art_empresa?: string;
  obra_social?: string;
  observaciones?: string;
};

export function usePersonal() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["personal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("*")
        .eq("activo", true)
        .order("apellido");

      if (error) throw error;
      return data as Personal[];
    },
  });
}

export function usePersonalById(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["personal", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Personal;
    },
    enabled: !!id,
  });
}

export function useCreatePersonal() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PersonalFormData) => {
      const { data: person, error } = await supabase
        .from("personal")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return person;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personal"] });
    },
  });
}

export function useUpdatePersonal() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<PersonalFormData>;
    }) => {
      const { data: person, error } = await supabase
        .from("personal")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return person;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["personal"] });
      queryClient.invalidateQueries({ queryKey: ["personal", variables.id] });
    },
  });
}

// Documentos
export type Documento = {
  id: string;
  entidad_tipo: string;
  entidad_id: string;
  tipo_documento: string;
  descripcion: string | null;
  archivo_url: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  estado: "vigente" | "por_vencer" | "vencido";
  created_at: string;
};

export function useDocumentos(entidadTipo: string, entidadId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["documentos", entidadTipo, entidadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .eq("entidad_tipo", entidadTipo)
        .eq("entidad_id", entidadId)
        .order("fecha_vencimiento", { ascending: true });

      if (error) throw error;
      return data as Documento[];
    },
    enabled: !!entidadId,
  });
}

export type DocumentoFormData = {
  entidad_tipo: string;
  entidad_id: string;
  tipo_documento: string;
  descripcion?: string;
  fecha_emision?: string;
  fecha_vencimiento?: string;
};

export function useCreateDocumento() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: DocumentoFormData) => {
      const { data: doc, error } = await supabase
        .from("documentos")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return doc;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["documentos", variables.entidad_tipo, variables.entidad_id],
      });
    },
  });
}
