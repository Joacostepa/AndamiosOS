"use client";

import { useQuery } from "@tanstack/react-query";
import type { Tarifas } from "@/lib/cotizador/tipos";
import type { Render } from "@/lib/parametros-cotizacion/tipos";
import type { AccionVista, BorradorVista, Evento, PdfVista } from "@/lib/asistente/eventos";
import type { Formulario } from "@/lib/cotizador-rapido/formulario";
import type { PropuestaIA } from "@/lib/cotizador-rapido/interpretar";

// El cotizador rápido del lado de la pantalla: tarifas para calcular al instante, y las llamadas
// a /api/comercial/asistente/cotizador (guardar el formulario, herramientas, interpretar, confirmar).

const BASE = "/api/comercial/asistente/cotizador";

export class ErrorConBorrador extends Error {
  constructor(mensaje: string, public status: number, public borrador: BorradorVista | null) {
    super(mensaje);
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const body = (await res.json().catch(() => null)) as (T & { error?: string; borrador?: BorradorVista }) | null;
  if (!res.ok) throw new ErrorConBorrador(body?.error ?? `Error ${res.status}`, res.status, body?.borrador ?? null);
  return body as T;
}

export function useContextoCotizador() {
  return useQuery({
    queryKey: ["cotizador-contexto"],
    queryFn: () => pedir<{ tarifas: Tarifas; renders: Render[] }>(BASE),
    staleTime: 30 * 60_000,
  });
}

export function crearCotizacion(tipo?: Formulario["tipo"]) {
  return pedir<{ conversacion: { id: string } }>(BASE, { method: "POST", body: JSON.stringify(tipo ? { tipo } : {}) });
}

export function guardarFormulario(conversacionId: string, version: number, formulario: Formulario) {
  return pedir<{ borrador: BorradorVista }>(`${BASE}/${conversacionId}`, { method: "PUT", body: JSON.stringify({ version, formulario }) });
}

export type RespuestaAccion = { contenido: unknown; esError: boolean; borrador: BorradorVista; eventos: Evento[] };

export function llamarHerramienta(conversacionId: string, nombre: string, input: Record<string, unknown> = {}) {
  return pedir<RespuestaAccion>(`${BASE}/${conversacionId}/accion`, { method: "POST", body: JSON.stringify({ nombre, input }) });
}

export function interpretar(conversacionId: string, texto: string, adjuntos: { path: string; tipo: string; nombre: string }[]) {
  return pedir<{ propuesta: PropuestaIA; usoUsd: number }>(`${BASE}/${conversacionId}/interpretar`, { method: "POST", body: JSON.stringify({ texto, adjuntos }) });
}

export type RespuestaConfirmar = { ok: boolean; motivo: string | null; accion: AccionVista; borrador: BorradorVista | null; pdf: PdfVista | null; whatsapp: string | null };

export function decidirAccion(accionId: string, decision: "confirmar" | "rechazar" | "reintentar") {
  return pedir<RespuestaConfirmar>(`${BASE}/acciones/${accionId}`, { method: "POST", body: JSON.stringify({ decision }) });
}

/** La propuesta de la IA leída en la pantalla de inicio, para aplicarla al abrir el presupuesto. */
const CLAVE = (id: string) => `cotizador-propuesta-${id}`;
export function dejarPropuesta(id: string, p: PropuestaIA) {
  try {
    sessionStorage.setItem(CLAVE(id), JSON.stringify(p));
  } catch {
    // Sin sessionStorage la propuesta se pierde: el vendedor la pega de nuevo.
  }
}
export function tomarPropuesta(id: string): PropuestaIA | null {
  try {
    const s = sessionStorage.getItem(CLAVE(id));
    if (!s) return null;
    sessionStorage.removeItem(CLAVE(id));
    return JSON.parse(s) as PropuestaIA;
  } catch {
    return null;
  }
}
