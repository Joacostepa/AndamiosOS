"use client";

import { useQuery } from "@tanstack/react-query";
import type { ClimaDia } from "@/lib/clima/pronostico";

/**
 * Lluvia y viento del rango visible, para el encabezado del tablero.
 *
 * NO SE PIDE POR RANGO. El pronóstico son nueve días desde hoy y el servidor ya los tiene
 * todos en una sola respuesta; parametrizar por el rango del tablero —que crece al
 * scrollear— generaría una entrada de cache nueva por cada semana que alguien mire, todas
 * con el mismo contenido. Se pide una ventana fija de diez días y la grilla usa las fechas
 * que le sirven.
 *
 * `staleTime` de una hora, igual que el cache del servidor: es cada cuánto MET actualiza
 * el modelo, y pedirlo más seguido sería traer dos veces el mismo dato.
 */
export function useClima(hoy: string) {
  const hasta = new Date(new Date(hoy).getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["clima", hoy],
    queryFn: async (): Promise<Map<string, ClimaDia>> => {
      const res = await fetch(`/api/clima?desde=${hoy}&hasta=${hasta}`);
      if (!res.ok) throw new Error("No se pudo leer el pronóstico");
      const { clima } = (await res.json()) as { clima: ClimaDia[] };
      return new Map(clima.map((d) => [d.fecha, d]));
    },
    enabled: !!hoy,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    // El clima es un adorno del encabezado: si el servicio de terceros no está, no vale
    // la pena reintentar en ráfaga ni ensuciar la consola.
    retry: 1,
  });
}
