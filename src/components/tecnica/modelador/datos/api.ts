"use client";

// Cliente de la API del modelador (/api/tecnica/modelador/**, arquitectura §8.3).
//
// Los hooks "oficiales" (src/hooks/use-modelador.ts) son de persistencia y se escriben en
// paralelo. Estos hacen lo mismo contra las mismas rutas y con los mismos query keys
// (["modelador", …]), así que se pueden reemplazar uno por otro sin tocar la pantalla.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CATALOGO_FIXTURE, type Catalogo, type Diseno } from "@/lib/tecnica/modelo";
import type {
  DecisionDiff, FiltroModelos, ModeloFila, ModeloLista, PreviaComputo, RespuestaGenerar, ResumenModelo,
} from "./tipos";

const BASE = "/api/tecnica/modelador";

/** Error de la API con el status (el 409 de revisión lo maneja el autoguardado). */
export class ErrorApi extends Error {
  status: number;
  datos: Record<string, unknown>;
  constructor(status: number, mensaje: string, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.status = status;
    this.datos = datos;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const datos = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof datos.error === "string" ? datos.error : `Error ${res.status}`;
    throw new ErrorApi(res.status, msg, datos);
  }
  return datos as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function useModelos(filtro: FiltroModelos) {
  const qs = new URLSearchParams();
  if (filtro.obra) qs.set("obra", filtro.obra);
  if (filtro.plantillas) qs.set("plantillas", "1");
  if (filtro.q) qs.set("q", filtro.q);
  return useQuery({
    queryKey: ["modelador", "lista", filtro.obra ?? null, !!filtro.plantillas, filtro.q ?? ""],
    queryFn: async () => (await pedir<{ modelos: ModeloLista[] }>(`${BASE}?${qs}`)).modelos,
    retry: false,
  });
}

export function useModelo(id: string | null) {
  return useQuery({
    queryKey: ["modelador", "modelo", id],
    queryFn: async () => (await pedir<{ modelo: ModeloFila }>(`${BASE}/${id}`)).modelo,
    enabled: !!id,
    retry: false,
    // El editor es la fuente de verdad mientras está abierto: no recargar por foco.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCrearModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body:
        | { nombre: string; obra_id?: string | null; cotizacion_ref?: string | null; diseno: Diseno }
        | { desdePlantilla: string; obra_id?: string | null; nombre?: string },
    ) => (await pedir<{ modelo: ModeloFila }>(BASE, json("POST", body))).modelo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modelador", "lista"] }),
  });
}

export interface CambiosModelo {
  revision: number;
  diseno?: Diseno;
  nombre?: string;
  descripcion?: string | null;
  obra_id?: string | null;
  resumen?: ResumenModelo;
}

/** PATCH con control optimista: si la revisión no coincide, tira ErrorApi 409 con `revisionActual`. */
export async function guardarModelo(id: string, cambios: CambiosModelo): Promise<{ revision: number }> {
  return pedir<{ revision: number }>(`${BASE}/${id}`, json("PATCH", cambios));
}

export function useArchivarModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => pedir<void>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modelador", "lista"] }),
  });
}

export function useGuardarComoPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; nombre: string; descripcion?: string; categoria: string }) =>
      (await pedir<{ modelo: ModeloFila }>(`${BASE}/${id}/plantilla`, json("POST", body))).modelo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modelador", "lista"] }),
  });
}

export async function subirImagen(id: string, png: Blob): Promise<{ imagen_path: string; url: string }> {
  return pedir(`${BASE}/${id}/imagen`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
}

/**
 * Catálogo real (catalogo_piezas + stock + tec_pieza_mapa + tec_kits). Si la ruta todavía no
 * existe o falla, el editor usa el catálogo de prueba y lo dice en pantalla (fuente 'fixture').
 */
export function useCatalogoModelador() {
  return useQuery({
    queryKey: ["modelador", "catalogo"],
    queryFn: async (): Promise<{ catalogo: Catalogo; error: string | null }> => {
      try {
        const r = await pedir<{ catalogo: Catalogo }>(`${BASE}/catalogo`);
        return { catalogo: r.catalogo, error: null };
      } catch (e) {
        return { catalogo: CATALOGO_FIXTURE, error: e instanceof Error ? e.message : "No se pudo leer el catálogo" };
      }
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function usePreviaComputo() {
  return useMutation({
    mutationFn: async ({ id, obra_id, revision }: { id: string; obra_id: string; revision: number }) =>
      pedir<PreviaComputo>(`${BASE}/${id}/computo/previa`, json("POST", { obra_id, revision })),
  });
}

export function useGenerarComputo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; obra_id: string; revision: number; decisiones: Record<string, DecisionDiff> }) =>
      pedir<RespuestaGenerar>(`${BASE}/${id}/computo`, json("POST", body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["computos"] });
      qc.invalidateQueries({ queryKey: ["modelador"] });
    },
  });
}
