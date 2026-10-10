"use client";

// Pañol, pantallas del encargado (tablet del depósito y oficina): conteo cíclico, control
// del equipo de cuadrilla y "¿Qué hay afuera?". Lo común (catálogo, personas, vales) está en
// use-panol.ts; acá sólo lo que usan estas pantallas.
//
// Igual que allá: directo a Supabase. Las RPC de conteo validan quién firma con el token
// del kiosco o, desde la app, con el usuario (pan_quien).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { rpc, useCatalogoPanol, useParametrosPanol, usePersonasPanol } from "@/hooks/use-panol";
import { useUser } from "@/hooks/use-user";
import { agruparAfuera } from "@/lib/panol/afuera";
import type { Conteo, ConteoItem, EstadoConteo } from "@/lib/panol/conteo";
import { hoyBA } from "@/lib/panol/estado";

// ─── Conteo ─────────────────────────────────────────────────────────────────

export type ItemACargar = {
  articuloId: string;
  varianteId?: string | null;
  unidadId?: string | null;
  contado: number;
  encontradoExtra?: boolean;
  nota?: string;
};

export const abrirConteo = (ubicacionId: string, token: string | null) =>
  rpc<string>("pan_conteo_abrir", { p_ubicacion: ubicacionId, p_token: token });

/** Se llama ítem por ítem, a medida que se carga: así `contado_at` es la hora real del conteo. */
export const cargarConteo = (conteoId: string, items: ItemACargar[], token: string | null) =>
  rpc<null>("pan_conteo_cargar", { p_conteo: conteoId, p_items: items, p_token: token });

export const cerrarConteo = (conteoId: string, token: string | null) =>
  rpc<{ estado: Extract<EstadoConteo, "por_aprobar" | "aplicado"> }>("pan_conteo_cerrar", { p_conteo: conteoId, p_token: token });

const COLUMNAS_CONTEO = "id, ubicacion_id, estado, umbral_pct, iniciado_at, cerrado_at, contado_por_id";

export async function leerConteo(conteoId: string): Promise<{ conteo: Conteo | null; items: ConteoItem[] }> {
  const db = createClient();
  const [c, i] = await Promise.all([
    db.from("pan_conteos").select(COLUMNAS_CONTEO).eq("id", conteoId).maybeSingle(),
    db.from("pan_conteo_items").select("*").eq("conteo_id", conteoId),
  ]);
  if (c.error) throw new Error(c.error.message);
  if (i.error) throw new Error(i.error.message);
  const items = ((i.data ?? []) as ConteoItem[]).map((x) => ({
    ...x,
    contado: x.contado === null ? null : Number(x.contado),
    esperado: x.esperado === null ? null : Number(x.esperado),
  }));
  const conteo = c.data ? { ...(c.data as Conteo), umbral_pct: c.data.umbral_pct === null ? null : Number(c.data.umbral_pct) } : null;
  return { conteo, items };
}

/** Los últimos conteos, para saber qué estantería hace más que no se cuenta. */
export function useConteosPanol() {
  return useQuery({
    queryKey: ["panol", "conteos"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("pan_conteos").select(COLUMNAS_CONTEO).order("iniciado_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Conteo[];
    },
    staleTime: 60_000,
  });
}

// ─── ¿Qué hay afuera? ───────────────────────────────────────────────────────

/** Todo lo que está afuera, agrupado por titular (lib/panol/afuera.ts). */
export function useAfueraPanol() {
  const catalogo = useCatalogoPanol();
  const personas = usePersonasPanol();
  const parametros = useParametrosPanol();
  const hoy = hoyBA();
  const grupos = useMemo(() => {
    if (!catalogo.data || !personas.data) return null;
    return agruparAfuera({ ...catalogo.data, ...personas.data }, hoy);
  }, [catalogo.data, personas.data, hoy]);
  return {
    grupos,
    catalogo: catalogo.data,
    personas: personas.data,
    perdidaDias: parametros.data?.faltante_perdida_dias ?? 15,
    hoy,
    cargando: catalogo.isLoading || personas.isLoading,
    error: catalogo.error ?? personas.error,
  };
}

/**
 * Desde la oficina, un vale se firma con el legajo del usuario (`personal.user_id`). Si no
 * tiene legajo vinculado, la pantalla le pide elegir a nombre de quién.
 */
export function useMiLegajo() {
  const { data: user } = useUser();
  const { data: personas } = usePersonasPanol();
  return useMemo(
    () => (user && personas ? personas.personas.find((p) => p.tipo === "persona" && p.userId === user.id) ?? null : null),
    [user, personas],
  );
}
