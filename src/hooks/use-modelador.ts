"use client";

// El modelador contra /api/tecnica/modelador/** (arquitectura-produccion.md §8.3). Todo por route
// handlers: la ruta repite el permiso y el cómputo se recalcula en el servidor.
//
// Query keys bajo ["modelador", …]. Generar el cómputo invalida además ["computos"].
// El guardado expone el 409 (alguien más guardó) como ErrorRevision, para que el editor muestre
// «Alguien más lo cambió: recargar / sobrescribir».

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Catalogo, Diseno } from "@/lib/tecnica/modelo";
import type { AvisoCatalogo } from "@/lib/tecnica/persistencia/catalogo";
import type {
  DecisionDiff, LineaOmitida, ModeloFila, ModeloLista, PreviaComputo, RespuestaGenerar, ResumenModelo,
} from "@/lib/tecnica/persistencia/tipos";
import type { CATEGORIAS_PLANTILLA } from "@/lib/tecnica/persistencia/validar";

type CategoriaPlantilla = (typeof CATEGORIAS_PLANTILLA)[number];

export class ErrorApi extends Error {
  status: number;
  body: Record<string, unknown> | null;
  constructor(mensaje: string, status: number, body: Record<string, unknown> | null) {
    super(mensaje);
    this.status = status;
    this.body = body;
  }
}

/** 409 al guardar: otra persona (u otra pestaña) guardó antes. */
export class ErrorRevision extends ErrorApi {
  revisionActual: number | null;
  constructor(mensaje: string, body: Record<string, unknown> | null) {
    super(mensaje, 409, body);
    this.revisionActual = typeof body?.revisionActual === "number" ? body.revisionActual : null;
  }
}

/** 422 al generar: hay líneas sin código que no van a entrar; hay que confirmar. */
export class ErrorOmitidas extends ErrorApi {
  omitidas: LineaOmitida[];
  constructor(mensaje: string, body: Record<string, unknown> | null) {
    super(mensaje, 422, body);
    this.omitidas = (body?.omitidas as LineaOmitida[]) ?? [];
  }
}

async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...resto } = init ?? {};
  const res = await fetch(url, {
    ...resto,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(resto.headers ?? {}) } : resto.headers,
    body: json !== undefined ? JSON.stringify(json) : resto.body,
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = (body?.error as string) ?? `Error ${res.status}`;
    if (res.status === 409 && "revisionActual" in (body ?? {})) throw new ErrorRevision(msg, body);
    if (res.status === 422 && Array.isArray(body?.omitidas)) throw new ErrorOmitidas(msg, body);
    throw new ErrorApi(msg, res.status, body);
  }
  return body as T;
}

const BASE = "/api/tecnica/modelador";

export type FiltroModelos = { obra?: string | null; plantillas?: boolean; sinObra?: boolean; q?: string };

export function useModelos(filtro: FiltroModelos = {}) {
  const params = new URLSearchParams();
  if (filtro.obra) params.set("obra", filtro.obra);
  if (filtro.plantillas) params.set("plantillas", "1");
  if (filtro.sinObra) params.set("sinObra", "1");
  if (filtro.q?.trim()) params.set("q", filtro.q.trim());
  const qs = params.toString();
  return useQuery({
    queryKey: ["modelador", "lista", filtro.obra ?? null, !!filtro.plantillas, !!filtro.sinObra, filtro.q?.trim() ?? ""],
    queryFn: async () => (await api<{ modelos: ModeloLista[] }>(`${BASE}${qs ? `?${qs}` : ""}`)).modelos,
    staleTime: 15_000,
  });
}

export function useModelo(id: string | null | undefined) {
  return useQuery({
    queryKey: ["modelador", "modelo", id],
    queryFn: async () => (await api<{ modelo: ModeloFila }>(`${BASE}/${id}`)).modelo,
    enabled: !!id,
    // El editor es el dueño del diseño mientras está abierto: no recargar solo por foco.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCatalogoModelador() {
  return useQuery({
    queryKey: ["modelador", "catalogo"],
    queryFn: () => api<{ catalogo: Catalogo; avisos: AvisoCatalogo[] }>(`${BASE}/catalogo`),
    staleTime: 5 * 60_000,
  });
}

export type CrearModeloInput =
  | { nombre: string; descripcion?: string | null; obra_id?: string | null; cotizacion_ref?: string | null; diseno: Diseno; resumen?: ResumenModelo | null }
  | { desdePlantilla: string; nombre?: string; obra_id?: string | null; cotizacion_ref?: string | null };

export function useCrearModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CrearModeloInput) => (await api<{ modelo: ModeloFila }>(BASE, { method: "POST", json: input })).modelo,
    onSuccess: (m) => {
      qc.setQueryData(["modelador", "modelo", m.id], m);
      qc.invalidateQueries({ queryKey: ["modelador", "lista"] });
    },
  });
}

export type GuardarModeloInput = {
  id: string;
  /** Obligatoria si va `diseno`. */
  revision?: number;
  diseno?: Diseno;
  nombre?: string;
  descripcion?: string | null;
  obra_id?: string | null;
  cotizacion_ref?: string | null;
  resumen?: ResumenModelo | null;
};

/**
 * PATCH sin pasar por react-query (lo usa el autoguardado, que corre fuera de un componente).
 * Tira ErrorRevision ante un 409. Devuelve la revisión nueva.
 */
export async function guardarModelo({ id, ...body }: GuardarModeloInput): Promise<number> {
  return (await api<{ revision: number }>(`${BASE}/${id}`, { method: "PATCH", json: body })).revision;
}

/** Sube la portada (PNG del lienzo) sin pasar por react-query. */
export async function subirImagen(id: string, png: Blob): Promise<{ imagen_path: string; url: string | null }> {
  return api(`${BASE}/${id}/imagen`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
}

/** PATCH con control optimista. Tira ErrorRevision ante un 409. Devuelve la revisión nueva. */
export function useGuardarModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: guardarModelo,
    onSuccess: (revision, v) => {
      qc.setQueryData<ModeloFila>(["modelador", "modelo", v.id], (m) => (m ? {
        ...m, revision,
        ...(v.diseno ? { diseno: v.diseno } : {}),
        ...(v.nombre !== undefined ? { nombre: v.nombre } : {}),
        ...(v.descripcion !== undefined ? { descripcion: v.descripcion } : {}),
        ...(v.obra_id !== undefined ? { obra_id: v.obra_id } : {}),
        ...(v.cotizacion_ref !== undefined ? { cotizacion_ref: v.cotizacion_ref } : {}),
        ...(v.resumen !== undefined ? { resumen: v.resumen } : {}),
      } : m));
      qc.invalidateQueries({ queryKey: ["modelador", "lista"] });
      // vincular a otra obra cambia el join: recargar el modelo
      if (v.obra_id !== undefined) qc.invalidateQueries({ queryKey: ["modelador", "modelo", v.id] });
    },
  });
}

/** Archivar (no se borra). */
export function useArchivarModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: ["modelador", "modelo", id] });
      qc.invalidateQueries({ queryKey: ["modelador", "lista"] });
    },
  });
}

export function useDuplicarModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; nombre?: string; obra_id?: string | null }) =>
      (await api<{ modelo: ModeloFila }>(`${BASE}/${id}/duplicar`, { method: "POST", json: body })).modelo,
    onSuccess: (m) => {
      qc.setQueryData(["modelador", "modelo", m.id], m);
      qc.invalidateQueries({ queryKey: ["modelador", "lista"] });
    },
  });
}

export function useGuardarComoPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; nombre: string; descripcion?: string | null; categoria: CategoriaPlantilla }) =>
      (await api<{ modelo: ModeloFila }>(`${BASE}/${id}/plantilla`, { method: "POST", json: body })).modelo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modelador", "lista"] }),
  });
}

/** Sube la portada (PNG del lienzo). */
export function useSubirImagen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, png }: { id: string; png: Blob }) => subirImagen(id, png),
    onSuccess: (r, v) => {
      qc.setQueryData<ModeloFila>(["modelador", "modelo", v.id], (m) => (m ? { ...m, imagen_path: r.imagen_path, imagen_url: r.url } : m));
      qc.invalidateQueries({ queryKey: ["modelador", "lista"] });
    },
  });
}

/** Qué haría «Generar cómputo». Es una mutación (se pide al abrir el diálogo), no una query cacheada. */
export function usePreviaComputo() {
  return useMutation({
    mutationFn: ({ id, obra_id, revision }: { id: string; obra_id: string; revision: number }) =>
      api<PreviaComputo>(`${BASE}/${id}/computo/previa`, { method: "POST", json: { obra_id, revision } }),
  });
}

export type GenerarComputoInput = {
  id: string;
  obra_id: string;
  revision: number;
  decisiones?: Record<string, DecisionDiff>;
  reemplazarOtroModelo?: boolean;
  aceptoOmitidas?: boolean;
};

/** Genera el cómputo real. Tira ErrorOmitidas (422) si hay líneas sin código y no se confirmó. */
export function useGenerarComputo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: GenerarComputoInput) => api<RespuestaGenerar>(`${BASE}/${id}/computo`, { method: "POST", json: body }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["computos"] });
      qc.invalidateQueries({ queryKey: ["modelador", "modelo", v.id] });
      qc.invalidateQueries({ queryKey: ["modelador", "lista"] });
    },
  });
}
