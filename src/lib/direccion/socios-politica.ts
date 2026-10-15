// La política de retiros vigente (direccion_politica_retiros), leída con la sesión del
// usuario: la RLS sólo deja leerla a los socios. SÓLO SERVIDOR (la usa la página Socios).
// Sin la tabla (migración sin aplicar): { disponible: false, vigente: null }.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esTablaFaltante } from "./supabase.ts";
import { leerPolitica, type PoliticaRetiros } from "./calculo/socios-reglas.ts";

export type PoliticaVigente = {
  disponible: boolean;
  vigente: { version: number; contenido: PoliticaRetiros; fecha: string; autor: string | null } | null;
};

export async function leerPoliticaVigente(db: SupabaseClient): Promise<PoliticaVigente> {
  const { data, error } = await db
    .from("direccion_politica_retiros")
    .select("version, contenido, created_at, autor:user_profiles(nombre)")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!esTablaFaltante(error)) console.warn("[direccion] política:", error.message);
    return { disponible: !esTablaFaltante(error), vigente: null };
  }
  const contenido = data ? leerPolitica(data.contenido) : null;
  if (!data || !contenido) return { disponible: true, vigente: null };
  const a = data.autor as { nombre?: string } | { nombre?: string }[] | null;
  return {
    disponible: true,
    vigente: { version: Number(data.version), contenido, fecha: String(data.created_at), autor: (Array.isArray(a) ? a[0]?.nombre : a?.nombre) ?? null },
  };
}
