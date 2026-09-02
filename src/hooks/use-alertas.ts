"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// LA LECTURA ES DE CADA PERSONA, no de la alerta. Antes `leida` era una columna booleana
// en `alertas`: con avisos dirigidos a un rol entero, el primero que entraba a la
// campanita se los marcaba leídos a todos. Ahora hay una fila en `alertas_lecturas` por
// (alerta, usuario), y la ausencia de fila es "sin leer" — un solo lugar donde vive el
// estado, sin columna que pueda contradecirlo.
//
// SE CRUZA EN EL CLIENTE, no en la base. Un `NOT EXISTS` desde PostgREST necesitaría una
// vista o una función, y las dos consultas de acá son de a lo sumo 50 filas cada una.
// Cuando el volumen justifique una vista, el cruce ya está en un solo lugar.

export type Alerta = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  prioridad: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  /** Ruta interna a donde lleva el aviso. Puede faltar en alertas viejas. */
  enlace: string | null;
  created_at: string;
  /** Calculada contra alertas_lecturas de esta persona. */
  leida: boolean;
};

export type Bandeja = { alertas: Alerta[]; sinLeer: number };

const CAMPOS = "id, tipo, titulo, descripcion, prioridad, entidad_tipo, entidad_id, enlace, created_at";

/**
 * Las alertas que me tocan, con mi estado de lectura.
 *
 * `refetchInterval` de un minuto: es el header, tiene que enterarse sin que nadie
 * recargue. Un minuto de demora en un aviso que antes no existía no le molesta a nadie, y
 * evita un realtime abierto en todas las pestañas.
 */
export function useAlertas() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["alertas"],
    queryFn: async (): Promise<Bandeja> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;

      const [{ data, error }, lecturas] = await Promise.all([
        supabase.from("alertas").select(CAMPOS).order("created_at", { ascending: false }).limit(50),
        uid
          ? supabase.from("alertas_lecturas").select("alerta_id").eq("usuario_id", uid)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (error) throw error;
      if (lecturas.error) throw lecturas.error;

      const leidas = new Set((lecturas.data ?? []).map((l) => l.alerta_id as string));
      const alertas = (data ?? []).map((a) => ({ ...a, leida: leidas.has(a.id) })) as Alerta[];
      return { alertas, sinLeer: alertas.filter((a) => !a.leida).length };
    },
    refetchInterval: 60000,
  });
}

/** El número del badge. Comparte la consulta con useAlertas: no agrega un viaje. */
export function useAlertasCount() {
  const q = useAlertas();
  return { ...q, data: q.data?.sinLeer ?? 0 };
}

export function useMarkAlertaRead() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string | string[]) => {
      const lista = Array.isArray(ids) ? ids : [ids];
      if (lista.length === 0) return;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sin sesión");

      // Marcar dos veces lo mismo no es un error: la PK (alerta, usuario) lo absorbe.
      const { error } = await supabase
        .from("alertas_lecturas")
        .upsert(
          lista.map((alerta_id) => ({ alerta_id, usuario_id: uid })),
          { onConflict: "alerta_id,usuario_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    // Optimista: marcar leído tiene que sentirse instantáneo, y si falla se revierte.
    onMutate: async (ids) => {
      const lista = Array.isArray(ids) ? ids : [ids];
      await queryClient.cancelQueries({ queryKey: ["alertas"] });
      const previo = queryClient.getQueryData<Bandeja>(["alertas"]);
      if (previo) {
        const marcadas = new Set(lista);
        const alertas = previo.alertas.map((a) =>
          marcadas.has(a.id) ? { ...a, leida: true } : a,
        );
        queryClient.setQueryData<Bandeja>(["alertas"], {
          alertas,
          sinLeer: alertas.filter((a) => !a.leida).length,
        });
      }
      return { previo };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previo) queryClient.setQueryData(["alertas"], ctx.previo);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alertas"] });
    },
  });
}
