// Los parámetros de hd_parametros que necesitan los layouts de Planificación antes de
// dibujar: la hora de corte ("abre en Mañana desde las 15"). Una sola consulta con la service role (son parámetros, no datos de nadie: el proxy ya exigió la
// sesión para estas rutas). Si falla, los valores por defecto: la pantalla abre igual.

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { normHora, toMin } from "./estado";

export type ParametrosPantalla = { corteMin: number };

/** Con `cache`: el layout y la página del mismo pedido comparten la lectura. */
export const leerParametrosPantalla = cache(async (): Promise<ParametrosPantalla> => {
  try {
    const r = await createAdminClient().from("hd_parametros").select("clave, valor").in("clave", ["hora_corte_manana"]);
    const valor = (k: string) => r.data?.find((x) => x.clave === k)?.valor;
    const corte = valor("hora_corte_manana");
    return {
      corteMin: toMin(normHora(typeof corte === "string" ? corte : null)) ?? 15 * 60,
    };
  } catch {
    return { corteMin: 15 * 60 };
  }
});
