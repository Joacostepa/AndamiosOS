// Una conversación nueva, con el prompt del sistema congelado al día de hoy (la usan el chat
// de la pantalla y WhatsApp).

import type { SupabaseClient } from "@supabase/supabase-js";
import { leerParametros } from "@/lib/parametros-cotizacion/servidor";
import { crearConversacion, type Conversacion } from "./datos";
import { construirSistema } from "./prompt";

const ESFUERZOS = new Set(["low", "medium", "high", "xhigh", "max"]);

export async function abrirConversacion(db: SupabaseClient, usuarioId: string, canal: "web" | "whatsapp" = "web"): Promise<Conversacion> {
  const [sistema, parametros] = await Promise.all([construirSistema(db), leerParametros(db)]);
  const texto = (clave: string) => parametros.find((p) => p.clave === clave)?.texto?.trim() || null;
  const esfuerzo = texto("asistente_esfuerzo");
  return crearConversacion(db, {
    usuario_id: usuarioId,
    canal,
    modelo: texto("asistente_modelo") ?? "claude-opus-5",
    esfuerzo: esfuerzo && ESFUERZOS.has(esfuerzo) ? esfuerzo : "high",
    system_snapshot: sistema.bloques,
    system_hash: sistema.hash,
    criterio_version: sistema.criterioVersion,
    parametros_version: sistema.parametrosVersion,
  });
}
