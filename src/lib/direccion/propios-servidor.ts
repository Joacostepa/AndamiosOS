// Lo propio de Dirección (notas, dueños, metas) del lado del servidor, con lo reservado
// decidido ACÁ y no en el navegador. SÓLO SERVIDOR.
//
//  · Al leer: sólo viajan los dueños y las notas de las decisiones que esa persona ve, y
//    las metas de indicadores que puede ver (la RLS además recorta las filas reservadas).
//  · Al escribir: la marca `reservado` de una nota o un dueño sale de la decisión tal como
//    la calcula La semana SIN recortar (decisiones.ts → reservaDeNota / reservaDeDueno).

import type { SupabaseClient } from "@supabase/supabase-js";
import { marcaDe, propiosDeDecisiones, type MarcaDecision } from "./calculo/decisiones.ts";
import { metasVisibles } from "./diccionario.ts";
import { leerPropios, type Propios } from "./propios.ts";
import { obtenerPantalla, resultadoCrudo } from "./servidor.ts";

/** Lo guardado que puede ver esta persona (para /api/direccion/propios y las páginas). */
export async function propiosParaUsuario(db: SupabaseClient, conSocios: boolean, idsVisibles?: string[]): Promise<Propios> {
  const [propios, ids] = await Promise.all([
    leerPropios(db),
    idsVisibles
      ? Promise.resolve(idsVisibles)
      : obtenerPantalla("semana", { conSocios }).then((r) => (r.ok ? (r.decisiones ?? []).map((d) => d.id) : [])).catch(() => [] as string[]),
  ]);
  const { duenos, notas } = propiosDeDecisiones(ids, propios.duenos, propios.notas);
  return { ...propios, duenos, notas, metas: metasVisibles(propios.metas, conSocios) };
}

/** La marca de una decisión en La semana sin recortar. null si no se pudo calcular (Odoo). */
export async function marcaDecision(alertaId: string): Promise<MarcaDecision | null> {
  try {
    const r = await resultadoCrudo("semana");
    return marcaDe(alertaId, r.decisiones ?? []);
  } catch (e) {
    console.warn("[direccion] marca de la decisión:", e instanceof Error ? e.message : e);
    return null;
  }
}
