// El render de la bandeja fácil. Sale de `agente_facil_render` en Parámetros y, si está vacío,
// del render por defecto de bandeja de la biblioteca (el mismo que propone el cotizador).
// JS, 19/11: la primera tarjeta fácil (Gaby, Lavalleja 230) no se pudo mandar porque el
// parámetro nunca se cargó y el borrador quedó sin render.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function renderBandejaFacil(db: SupabaseClient, desdeParametro: string | null): Promise<string | null> {
  if (desdeParametro?.trim()) return desdeParametro.trim();
  const { data, error } = await db
    .from("cotizacion_renders")
    .select("id")
    .eq("tipo", "bandeja")
    .eq("por_defecto", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[clientes] render por defecto de bandeja", error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}
