import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearAlertas } from "@/lib/alertas/servicio";

/**
 * Fallas de la API de Claude al revisar documentos (legajo del cliente y póliza).
 *
 * El 16/09 la cuenta se quedó sin saldo a las 12:32 y hasta la noche 7 documentos del portal
 * quedaron sin revisar: quien los subió vio el JSON de la API en inglés como observación y nadie
 * de ABA se enteró. Desde entonces el texto para quien sube el archivo no lleva el error de la
 * API (queda en el historial del trámite) y una falla de la cuenta avisa al canal una vez por día.
 */

/** Motivo propio y legible por el que un documento no se puede revisar (formato, archivo que falta). */
export class NoRevisable extends Error {}

type FallaDeCuenta = { tipo: "saldo" | "clave" | "limite" | "caida"; motivo: string; queHacer: string };

/** Si el error es de la cuenta o del servicio de Claude (no del documento), qué pasó y qué hacer. */
export function fallaDeCuenta(e: unknown): FallaDeCuenta | null {
  if (!(e instanceof Anthropic.APIError)) return null;
  const tipoError = (e.error as { error?: { type?: string } } | undefined)?.error?.type;
  if (e.status === 402 || tipoError === "billing_error" || /credit balance/i.test(e.message)) {
    return { tipo: "saldo", motivo: "La cuenta de la API de Claude se quedó sin saldo", queHacer: "Cargar saldo en https://console.anthropic.com/settings/billing (conviene la recarga automática)." };
  }
  if (e.status === 401 || e.status === 403) {
    return { tipo: "clave", motivo: "La API de Claude rechazó la clave (ANTHROPIC_API_KEY)", queHacer: "Revisar la clave en Vercel y en la consola de Anthropic." };
  }
  if (e.status === 429) {
    return { tipo: "limite", motivo: "La API de Claude está limitando los pedidos de la cuenta", queHacer: "Revisar los límites de uso en https://console.anthropic.com/settings/limits." };
  }
  if (e.status === undefined || e.status >= 500) {
    return { tipo: "caida", motivo: "La API de Claude no respondió", queHacer: "Suele ser momentáneo: volver a revisar los documentos más tarde." };
  }
  return null;
}

/** El texto de la observación para quien subió el archivo: sin el error técnico de afuera. */
export function observacionSinRevisar(e: unknown, quien: string): string {
  return e instanceof NoRevisable
    ? `No se pudo revisar automáticamente (${e.message}). ${quien}`
    : `No se pudo revisar automáticamente. ${quien}`;
}

/** Un aviso por día y por tipo de falla al canal de permisos. Nunca tira. */
export async function avisarFallaDeCuenta(db: SupabaseClient, falla: FallaDeCuenta): Promise<void> {
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  await crearAlertas(db, [{
    tipo: "permiso_robot",
    clave: `permiso_robot:ia:${falla.tipo}:${hoy}`,
    titulo: "La revisión automática de documentos no anda",
    descripcion: `${falla.motivo}. Los documentos y pólizas que se suban quedan sin revisar (los mira una persona o se vuelven a revisar cuando se arregle). ${falla.queHacer}`,
    prioridad: "alta",
    enlace: "/permisos-via-publica",
  }]).catch(() => 0);
}
