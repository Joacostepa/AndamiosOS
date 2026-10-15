"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { origenAlGuardar } from "@/lib/tecnica/persistencia/origen";
import type { OrigenItem } from "@/lib/tecnica/persistencia/tipos";

export type ComputoItem = {
  id: string;
  pieza_id: string;
  cantidad_requerida: number;
  cantidad_disponible: number | null;
  notas: string | null;
  /** De dónde salió la fila: el modelador ('modelo'), el modelador y después a mano ('modelo_editado') o a mano. */
  origen?: OrigenItem;
  /** Lo que dijo el modelo la última vez que generó (para el diff). null si nunca lo dijo. */
  modelo_cantidad?: number | null;
  catalogo_piezas?: {
    codigo: string;
    descripcion: string;
    categoria: string;
    unidad_medida: string;
  };
};

export type ComputoResponsable = { nombre: string; apellido: string } | null;

export type Computo = {
  id: string;
  obra_id: string;
  version: number;
  estado: string;
  verificado_por_id: string | null;
  aprobado_por_id: string | null;
  fecha_verificacion: string | null;
  fecha_aprobacion: string | null;
  notas: string | null;
  // Datos de ingeniería (antes vivían en proyectos_tecnicos)
  tipo_sistema_andamio: string | null;
  altura_maxima: number | null;
  metros_lineales: number | null;
  superficie: number | null;
  observaciones_tecnicas: string | null;
  created_at: string;
  created_by: string | null;
  // Joined
  obras?: {
    codigo: string;
    nombre: string;
    fecha_inicio_estimada: string | null;
    clientes?: { razon_social: string } | null;
  } | null;
  responsable?: ComputoResponsable;
  computo_items?: ComputoItem[];
};

const HOME_SELECT =
  "*, obras(codigo, nombre, fecha_inicio_estimada, clientes(razon_social)), responsable:user_profiles!created_by(nombre, apellido), computo_items(cantidad_requerida, catalogo_piezas(categoria))";

const DETALLE_SELECT =
  "*, obras(codigo, nombre, fecha_inicio_estimada, clientes(razon_social)), responsable:user_profiles!created_by(nombre, apellido), computo_items(*, catalogo_piezas(codigo, descripcion, categoria, unidad_medida))";

export function useComputos() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["computos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computos")
        .select(HOME_SELECT)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as Computo[];
    },
  });
}

export function useComputo(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["computos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computos")
        .select(DETALLE_SELECT)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as unknown as Computo;
    },
    enabled: !!id,
  });
}

// Cómputo de una obra (Pantalla 2 está indexada por obraId). null si la obra
// todavía no tiene cómputo iniciado.
export function useComputoByObra(obraId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["computos", "obra", obraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computos")
        .select(DETALLE_SELECT)
        .eq("obra_id", obraId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as Computo) ?? null;
    },
    enabled: !!obraId,
  });
}

export function useCreateComputo() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      obra_id: string;
      tipo_sistema_andamio?: string;
      altura_maxima?: number;
      metros_lineales?: number;
      superficie?: number;
      observaciones_tecnicas?: string;
      notas?: string;
      items: { pieza_id: string; cantidad_requerida: number }[];
    }) => {
      const campos = data;
      const { data: computo, error: computoError } = await supabase
        .from("computos")
        .insert({
          obra_id: campos.obra_id,
          tipo_sistema_andamio: campos.tipo_sistema_andamio || null,
          altura_maxima: campos.altura_maxima ?? null,
          metros_lineales: campos.metros_lineales ?? null,
          superficie: campos.superficie ?? null,
          observaciones_tecnicas: campos.observaciones_tecnicas || null,
          notas: campos.notas || null,
        })
        .select()
        .single();

      if (computoError) throw computoError;

      if (data.items.length > 0) {
        const items = data.items.map((item) => ({
          computo_id: computo.id,
          pieza_id: item.pieza_id,
          cantidad_requerida: item.cantidad_requerida,
        }));

        const { error: itemsError } = await supabase
          .from("computo_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return computo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["computos"] });
    },
  });
}

export function useUpdateComputo() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ estado: string; notas: string }>;
    }) => {
      const { data: computo, error } = await supabase
        .from("computos")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return computo;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["computos"] });
      queryClient.invalidateQueries({ queryKey: ["computos", variables.id] });
    },
  });
}

export type SaveComputoInput = {
  computoId: string | null;
  obraId: string;
  items: { pieza_id: string; cantidad_requerida: number }[];
};

// Persiste el set completo de ítems de una obra (autoguardado de Pantalla 2).
// Crea el cómputo si todavía no existe (estado default 'borrador') y reemplaza
// los ítems (delete + insert). Devuelve el id del cómputo para reusarlo.
//
// El reemplazo CONSERVA de dónde salió cada fila (computo_items.origen / modelo_cantidad, del
// modelador): una fila del modelo cuya cantidad se cambió acá pasa a 'modelo_editado' (y el modelador
// no la pisa sin preguntar); una fila nueva es 'manual'. Ver origenAlGuardar.
export function useSaveComputoItems() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ computoId, obraId, items }: SaveComputoInput) => {
      let id = computoId;

      if (!id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: computo, error: createError } = await supabase
          .from("computos")
          .insert({ obra_id: obraId, created_by: user?.id ?? null })
          .select("id")
          .single();

        if (createError) throw createError;
        id = computo.id as string;
      }

      // Lo que había, para no perder el origen. Si la base todavía no tiene las columnas del
      // modelador (migración 20261015000001 sin aplicar), se guarda como antes. Un cómputo recién
      // creado no tiene nada que conservar: sus filas toman el default de la base ('manual').
      let previos: Map<string, { origen: OrigenItem; modelo_cantidad: number | null }> | null = null;
      if (computoId) {
        const { data: actuales, error: readError } = await supabase
          .from("computo_items")
          .select("pieza_id, origen, modelo_cantidad")
          .eq("computo_id", id);
        if (readError) {
          if (readError.code !== "42703") throw readError;
          previos = null;
        } else {
          previos = new Map();
          for (const r of (actuales ?? []) as { pieza_id: string; origen: OrigenItem | null; modelo_cantidad: number | null }[]) {
            previos.set(r.pieza_id, { origen: r.origen ?? "manual", modelo_cantidad: r.modelo_cantidad });
          }
        }
      }

      // Reemplazar ítems: borrar los actuales e insertar los activos (>0).
      const { error: deleteError } = await supabase
        .from("computo_items")
        .delete()
        .eq("computo_id", id);

      if (deleteError) throw deleteError;

      const activos = items.filter((i) => i.cantidad_requerida > 0);
      if (activos.length > 0) {
        const rows = activos.map((i) => ({
          computo_id: id,
          pieza_id: i.pieza_id,
          cantidad_requerida: i.cantidad_requerida,
          ...(previos ? origenAlGuardar(previos.get(i.pieza_id), i.cantidad_requerida) : {}),
        }));
        const { error: insertError } = await supabase
          .from("computo_items")
          .insert(rows);

        if (insertError) throw insertError;
      }

      return { id: id as string };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["computos"] });
      queryClient.invalidateQueries({
        queryKey: ["computos", "obra", variables.obraId],
      });
    },
  });
}
