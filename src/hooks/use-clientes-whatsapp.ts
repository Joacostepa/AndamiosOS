"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { DetalleCharla, ListaCharlas } from "@/lib/clientes/vista";
import type { Auditoria, CorreccionPedida, ResultadoDecision, TarjetasCharla, VistaCorreccion } from "@/lib/clientes/vista-aprobacion";

// La bandeja de WhatsApp de clientes del lado de la pantalla.
//
// EN VIVO POR CONSULTA PERIÓDICA (como `seguirTurno` del asistente): la lista cada 8 s y la
// charla abierta cada 4 s, sólo con la pestaña a la vista (react-query no consulta en segundo
// plano). Con las ~6 charlas por día que se esperan alcanza; si un día pesa, se pasa a Supabase
// Realtime (la migración ya deja la lectura por RLS para quien tiene el módulo).

const BASE = "/api/comercial/clientes";

export class ErrorPedido extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo?: string, readonly datos?: Record<string, unknown>) {
    super(mensaje);
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ({ error?: string; codigo?: string } & Record<string, unknown>) | null;
    throw new ErrorPedido(body?.error ?? `Error ${res.status}`, res.status, body?.codigo, body ?? undefined);
  }
  return (await res.json()) as T;
}

export function useCharlas() {
  return useQuery({
    queryKey: ["clientes-charlas"],
    queryFn: () => pedir<ListaCharlas>(`${BASE}/conversaciones`),
    refetchInterval: 8000,
    staleTime: 3000,
  });
}

export function useCharla(id: string | null) {
  return useQuery({
    queryKey: ["clientes-charla", id],
    queryFn: () => pedir<DetalleCharla>(`${BASE}/conversaciones/${id}`),
    enabled: !!id,
    refetchInterval: 4000,
    staleTime: 2000,
  });
}

function refrescar(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: ["clientes-charla", id] });
  void qc.invalidateQueries({ queryKey: ["clientes-charlas"] });
}

export function useCambiarEstado(id: string | null) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ErrorPedido, { accion: "tomar" | "soltar" | "cerrar" | "devolver"; forzar?: boolean; nota?: string }>({
    mutationFn: (b) => pedir(`${BASE}/conversaciones/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    onSettled: () => id && refrescar(qc, id),
  });
}

export type ArchivoSubido = { path: string; mime: string; nombre: string };

/** Sube un archivo para mandarle al cliente: URL firmada y directo a Storage. */
export async function subirArchivo(id: string, archivo: File): Promise<ArchivoSubido> {
  const mime = archivo.type || "application/octet-stream";
  const destino = await pedir<{ path: string; token: string }>(`${BASE}/conversaciones/${id}/adjuntos`, {
    method: "POST",
    body: JSON.stringify({ tipo: mime }),
  });
  const { error } = await createClient().storage.from("comercial").uploadToSignedUrl(destino.path, destino.token, archivo, { contentType: mime });
  if (error) throw new Error(`No se pudo subir ${archivo.name}: ${error.message}`);
  return { path: destino.path, mime, nombre: archivo.name };
}

export function useResponder(id: string | null) {
  const qc = useQueryClient();
  return useMutation<{ ok: true; id: string }, ErrorPedido, { texto?: string; archivo?: ArchivoSubido }>({
    mutationFn: (b) => pedir(`${BASE}/conversaciones/${id}/responder`, { method: "POST", body: JSON.stringify(b) }),
    onSettled: () => id && refrescar(qc, id),
  });
}

// ── La tarjeta de aprobación (paso 6) ───────────────────────────────────────────────────

export function useAprobaciones(id: string | null) {
  return useQuery({
    queryKey: ["clientes-aprobaciones", id],
    queryFn: () => pedir<TarjetasCharla>(`${BASE}/conversaciones/${id}/aprobaciones`),
    enabled: !!id,
    refetchInterval: 6000,
    staleTime: 2000,
  });
}

export type PedidoTarjeta =
  | { accion: "aprobar"; montoVisto: number; correccion?: CorreccionPedida | null; confirmarVentana?: boolean; despues?: "sofia" | "persona" | null }
  | { accion: "reintentar" }
  | { accion: "tomar"; motivo?: string }
  | { accion: "confirmar"; elegida?: { tecnico: string | null; asistente: string | null } | null; avisar: boolean; despues?: "sofia" | "persona" | null }
  | { accion: "mandar"; texto: string; despues?: "sofia" | "persona" | null };

export function useDecidir(charlaId: string) {
  const qc = useQueryClient();
  return useMutation<Extract<ResultadoDecision, { ok: true }>, ErrorPedido, { aprobacionId: string; pedido: PedidoTarjeta }>({
    mutationFn: ({ aprobacionId, pedido }) => pedir(`${BASE}/conversaciones/${charlaId}/aprobaciones/${aprobacionId}`, { method: "POST", body: JSON.stringify(pedido) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["clientes-aprobaciones", charlaId] });
      refrescar(qc, charlaId);
    },
  });
}

/** «Recalcular» al corregir: el nuevo, antes de mandar. No escribe nada. */
export function useVistaCorreccion(charlaId: string) {
  return useMutation<VistaCorreccion, ErrorPedido, { aprobacionId: string; correccion: CorreccionPedida }>({
    mutationFn: ({ aprobacionId, correccion }) =>
      pedir(`${BASE}/conversaciones/${charlaId}/aprobaciones/${aprobacionId}`, { method: "POST", body: JSON.stringify({ accion: "corregir", correccion }) }),
  });
}

export function urlPdfVistaPrevia(charlaId: string, aprobacionId: string, correccion?: CorreccionPedida | null): string {
  const base = `${BASE}/conversaciones/${charlaId}/aprobaciones/${aprobacionId}/pdf`;
  return correccion ? `${base}?correccion=${encodeURIComponent(JSON.stringify(correccion))}` : base;
}

export function useAuditoria(habilitado: boolean) {
  return useQuery({
    queryKey: ["clientes-auditoria"],
    queryFn: () => pedir<Auditoria>(`${BASE}/revisar`),
    enabled: habilitado,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}
