"use client";

// Acceso a la API del modelador desde la pantalla. Todo sale de los hooks oficiales
// (src/hooks/use-modelador.ts); acá solo queda el catálogo con respaldo: si la ruta falla, el
// editor usa el catálogo de prueba y lo dice en pantalla.

import { useQuery } from "@tanstack/react-query";
import { CATALOGO_FIXTURE, type Catalogo } from "@/lib/tecnica/modelo";
import type { AvisoCatalogo } from "@/lib/tecnica/persistencia/catalogo";

export {
  ErrorApi, ErrorOmitidas, ErrorRevision, guardarModelo, subirImagen,
  useArchivarModelo, useCrearModelo, useDuplicarModelo, useGenerarComputo, useGuardarComoPlantilla,
  useGuardarModelo, useModelo, useModelos, usePreviaComputo, useSubirImagen,
} from "@/hooks/use-modelador";

const BASE = "/api/tecnica/modelador";

/**
 * Catálogo real (catalogo_piezas + stock + tec_pieza_mapa + tec_kits). Si la ruta no responde,
 * devuelve el catálogo de prueba con `error` para que la pantalla avise que códigos y pesos no
 * son los reales. La key es distinta de la del hook oficial porque la forma del dato cambia.
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
        return { catalogo: CATALOGO_FIXTURE, avisos: [], error: e instanceof Error ? e.message : "No se pudo leer el catálogo" };
      }
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
