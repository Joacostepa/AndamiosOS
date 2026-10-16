// El interruptor general de Sofía (clientes_ia_activa en Parámetros). Aparte de agente.ts para
// que la bandeja y el webhook lo lean sin cargar el SDK de Claude. SOLO server-side.

import type { SupabaseClient } from "@supabase/supabase-js";

/** ¿Está prendida Sofía? Sin la clave (migración sin aplicar) o ante cualquier error, no. */
export async function iaClientesActiva(db: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await db.from("cotizacion_parametros").select("valor").eq("clave", "clientes_ia_activa").maybeSingle();
    if (error) return false;
    return Number(data?.valor ?? 0) === 1;
  } catch {
    return false;
  }
}

