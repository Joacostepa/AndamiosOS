"use client";

// Acceso a la API del modelador desde la pantalla. Todo sale de los hooks oficiales
// (src/hooks/use-modelador.ts); acá solo queda el catálogo con respaldo de desarrollo.

import { useQuery } from "@tanstack/react-query";
import { CATALOGO_FIXTURE, type Catalogo } from "@/lib/tecnica/modelo";
import type { AvisoCatalogo } from "@/lib/tecnica/persistencia/catalogo";

export {
  ErrorApi, ErrorOmitidas, ErrorRevision, guardarModelo, subirImagen,
  useArchivarModelo, useCrearModelo, useDuplicarModelo, useRestaurarModelo, useGenerarComputo, useGuardarComoPlantilla,
  useGuardarModelo, useModelo, useModelos, usePreviaComputo, useSubirImagen,
} from "@/hooks/use-modelador";

const BASE = "/api/tecnica/modelador";

/** En producción nunca se usa el catálogo de prueba: pesos y stock inventados no pueden llegar a la base. */
export const PERMITE_FIXTURE = process.env.NODE_ENV !== "production";

/**
 * Catálogo real (catalogo_piezas + stock + tec_pieza_mapa + tec_kits).
 * - Producción: si la ruta falla (sesión vencida, 500, red) la query FALLA y reintenta; la página muestra
 *   un estado de error. Nunca cae al catálogo de prueba.
 * - Desarrollo: cae al catálogo de prueba con `error`, para poder trabajar sin base, y el editor lo dice.
 * La key es distinta de la del hook oficial porque la forma del dato cambia.
 */
export function useCatalogoModelador() {
  return useQuery({
    queryKey: ["modelador", "catalogo", "con-respaldo"],
    queryFn: async (): Promise<{ catalogo: Catalogo; avisos: AvisoCatalogo[]; error: string | null }> => {
      try {
        const res = await fetch(`${BASE}/catalogo`);
        const body = (await res.json().catch(() => null)) as { catalogo?: Catalogo; avisos?: AvisoCatalogo[]; error?: string } | null;
        if (!res.ok || !body?.catalogo) throw new Error(body?.error ?? `Error ${res.status}`);
        return { catalogo: body.catalogo, avisos: body.avisos ?? [], error: null };
      } catch (e) {
        if (!PERMITE_FIXTURE) throw e;
        return { catalogo: CATALOGO_FIXTURE, avisos: [], error: e instanceof Error ? e.message : "No se pudo leer el catálogo" };
      }
    },
    retry: 2,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
