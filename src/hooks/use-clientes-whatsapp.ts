"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { DetalleCharla, ListaCharlas } from "@/lib/clientes/vista";

// La bandeja de WhatsApp de clientes del lado de la pantalla.
//
// EN VIVO POR CONSULTA PERIÓDICA (como `seguirTurno` del asistente): la lista cada 8 s y la
// charla abierta cada 4 s, sólo con la pestaña a la vista (react-query no consulta en segundo
// plano). Con las ~6 charlas por día que se esperan alcanza; si un día pesa, se pasa a Supabase
// Realtime (la migración ya deja la lectura por RLS para quien tiene el módulo).

const BASE = "/api/comercial/clientes";

export class ErrorPedido extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo?: string) {
    super(mensaje);
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; codigo?: string } | null;
    throw new ErrorPedido(body?.error ?? `Error ${res.status}`, res.status, body?.codigo);
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
