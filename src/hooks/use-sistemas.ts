"use client";

// Sistemas contra /api/sistemas/** (docs/sistemas/contrato.md §3 y §7.4). Todo por route
// handlers: la API repite la llave (sesión o revisor) y escribe por RPC.
//
// Query keys bajo ["sistemas", …]. Cada mutación invalida ["sistemas"] y ["alertas"]: un
// mensaje o un cambio de estado le crea un aviso a alguien, y quien lo hizo puede ser
// también destinatario de otro (un revisor que además reportó).
//
// LA SUBIDA ES EN DOS PASOS y la imagen nunca pasa por nuestro servidor: la API firma una
// subida por imagen con la service role (el bucket no tiene políticas para authenticated),
// el navegador sube directo a Storage con `uploadToSignedUrl`, y recién después se crea el
// reporte con los paths. La RPC valida que cada path sea del que reporta y que exista.
//
// Mientras las migraciones no estén aplicadas la API contesta 503 con MENSAJE_SIN_INSTALAR:
// el error lleva ese texto tal cual, para que el panel lo muestre y quede abierto.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET,
  MENSAJE_SIN_INSTALAR,
  type CandidatosRespuesta,
  type ComentarRespuesta,
  type ComentarRevisionRespuesta,
  type ConfirmarRespuesta,
  type CrearReporteBody,
  type CrearReporteRespuesta,
  type EstadoReporte,
  type ImagenLista,
  type MisReportesRespuesta,
  type PromptRespuesta,
  type RespuestaSubidas,
  type RevisarBody,
  type RevisarRespuesta,
  type RevisionDetalleRespuesta,
  type RevisionLista,
  type TipoReporte,
} from "@/lib/sistemas/tipos";

export class ErrorSistemas extends Error {
  status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.status = status;
  }
}

async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...resto } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...resto,
      headers: json !== undefined ? { "Content-Type": "application/json", ...(resto.headers ?? {}) } : resto.headers,
      body: json !== undefined ? JSON.stringify(json) : resto.body,
    });
  } catch {
    throw new ErrorSistemas("No hay conexión. Revisá internet y probá de nuevo.", 0);
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const texto = typeof body?.error === "string" ? body.error : null;
    if (res.status === 503) throw new ErrorSistemas(texto ?? MENSAJE_SIN_INSTALAR, 503);
    throw new ErrorSistemas(texto ?? `Algo falló (error ${res.status}). Probá de nuevo.`, res.status);
  }
  return body as T;
}

const BASE = "/api/sistemas";

/** Las claves, en un solo lugar: el detalle se invalida desde la lista y al revés. */
export const CLAVES = {
  todo: ["sistemas"] as const,
  mis: ["sistemas", "mis"] as const,
  lista: (f?: FiltrosRevision) => (f ? (["sistemas", "revision", "lista", f] as const) : (["sistemas", "revision", "lista"] as const)),
  detalle: (id: string) => ["sistemas", "revision", "detalle", id] as const,
  candidatos: (id: string) => ["sistemas", "revision", "candidatos", id] as const,
  prompt: (id: string) => ["sistemas", "revision", "prompt", id] as const,
};

function useInvalidarTodo() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: CLAVES.todo });
    qc.invalidateQueries({ queryKey: ["alertas"] });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// De todos
// ─────────────────────────────────────────────────────────────────────────────

/** Mis reportes, con capturas firmadas (10 min) y la conversación pública. */
export function useMisReportes(opciones: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: CLAVES.mis,
    queryFn: () => api<MisReportesRespuesta>(`${BASE}/reportes`),
    enabled: opciones.enabled ?? true,
    // Las URLs firmadas vencen a los 10 minutos: se refresca antes, y al volver a la pestaña.
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    // Un 503 (sin instalar) o un 401 no mejoran reintentando.
    retry: (n, e) => !(e instanceof ErrorSistemas && [401, 403, 503].includes(e.status)) && n < 2,
  });
}

export type NuevoReporte = {
  body: Omit<CrearReporteBody, "capturas">;
  /** Las imágenes YA APLANADAS (con las marcas quemadas). La original sin tapar nunca se sube. */
  imagenes: ImagenLista[];
};

/** Sube las imágenes (dos pasos) y crea el reporte. */
export async function crearReporte({ body, imagenes }: NuevoReporte): Promise<CrearReporteRespuesta> {
  let capturas: CrearReporteBody["capturas"] = [];
  if (imagenes.length > 0) {
    const { subidas } = await api<RespuestaSubidas>(`${BASE}/reportes/subidas`, {
      method: "POST",
      json: { archivos: imagenes.map((i) => ({ mime: i.mime, bytes: i.blob.size })) },
    });
    if (subidas.length !== imagenes.length) throw new ErrorSistemas("No pudimos preparar la subida de las imágenes. Probá de nuevo.", 500);
    const storage = createClient().storage.from(BUCKET);
    await Promise.all(
      imagenes.map(async (img, i) => {
        const { error } = await storage.uploadToSignedUrl(subidas[i].path, subidas[i].token, img.blob, { contentType: img.mime });
        if (error) throw new ErrorSistemas("No pudimos subir una de las imágenes. Revisá la conexión y probá de nuevo.", 0);
      }),
    );
    capturas = imagenes.map((img, i) => ({ path: subidas[i].path, mime: img.mime, bytes: img.blob.size, ancho: img.ancho, alto: img.alto }));
  }
  return api<CrearReporteRespuesta>(`${BASE}/reportes`, { method: "POST", json: { ...body, capturas } satisfies CrearReporteBody });
}

export function useCrearReporte() {
  const invalidar = useInvalidarTodo();
  return useMutation({ mutationFn: crearReporte, onSuccess: invalidar });
}

export function useComentarReporte(id: string) {
  const invalidar = useInvalidarTodo();
  return useMutation({
    mutationFn: (texto: string) =>
      api<ComentarRespuesta>(`${BASE}/reportes/${id}/comentarios`, { method: "POST", json: { texto } }),
    onSuccess: invalidar,
  });
}

/** «Ya está, gracias» (ok) o «Sigue pasando» (reabre y les avisa a los revisores). */
export function useConfirmarReporte(id: string) {
  const invalidar = useInvalidarTodo();
  return useMutation({
    mutationFn: (v: { ok: boolean; texto?: string }) =>
      api<ConfirmarRespuesta>(`${BASE}/reportes/${id}/confirmar`, { method: "POST", json: v }),
    onSuccess: invalidar,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Revisión (sólo con Sistemas · Revisión en «editar»)
// ─────────────────────────────────────────────────────────────────────────────

export type FiltrosRevision = { estado: EstadoReporte; tipo: TipoReporte | null; frena: boolean; q: string };

export function useRevision(filtros: FiltrosRevision) {
  return useQuery({
    queryKey: CLAVES.lista(filtros),
    queryFn: () => {
      const p = new URLSearchParams({ estado: filtros.estado });
      if (filtros.tipo) p.set("tipo", filtros.tipo);
      if (filtros.frena) p.set("frena", "1");
      if (filtros.q.trim()) p.set("q", filtros.q.trim());
      return api<RevisionLista>(`${BASE}/revision?${p}`);
    },
    // Al cambiar de pestaña o de filtro se sigue viendo la lista anterior hasta que llega la
    // nueva: sin parpadeo de esqueleto en cada tecla del buscador.
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof ErrorSistemas && [401, 403, 503].includes(e.status)) && n < 2,
  });
}

/**
 * Los reportes que ya se abrieron en esta pestaña. Sólo el PRIMER pedido de cada uno lleva
 * `?abrir=1` (el que lo pasa de `nuevo` a `visto`): los que siguen (al invalidar después de un
 * cambio, el refresco cada 5 min) no, así el botón «Nuevo» de Estado sirve para dejarlo nuevo.
 */
const abiertosEnPestana = new Set<string>();

/**
 * El detalle de un reporte. OJO: abrir uno `nuevo` lo pasa a `visto` en el servidor (sin
 * aviso). Por eso nunca se abre solo: sólo cuando la persona lo elige de la lista.
 */
export function useReporteRevision(id: string | null) {
  return useQuery({
    queryKey: CLAVES.detalle(id ?? ""),
    queryFn: async () => {
      const abrir = !!id && !abiertosEnPestana.has(id);
      const r = await api<RevisionDetalleRespuesta>(`${BASE}/revision/${id}${abrir ? "?abrir=1" : ""}`);
      if (id) abiertosEnPestana.add(id);
      return r;
    },
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
    retry: (n, e) => !(e instanceof ErrorSistemas && [401, 403, 404, 503].includes(e.status)) && n < 2,
  });
}

export function useCandidatos(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: CLAVES.candidatos(id ?? ""),
    queryFn: () => api<CandidatosRespuesta>(`${BASE}/revision/${id}/candidatos`),
    enabled: !!id && enabled,
  });
}

/** El prompt para Claude Code, sólo cuando se pide (trae URLs firmadas de 1 h). */
export function usePromptClaude(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: CLAVES.prompt(id ?? ""),
    queryFn: () => api<PromptRespuesta>(`${BASE}/revision/${id}/prompt`),
    enabled: !!id && enabled,
    // Cada vez que se abre el modal, enlaces nuevos: uno viejo puede estar por vencer.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useRevisar(id: string) {
  const qc = useQueryClient();
  const invalidar = useInvalidarTodo();
  return useMutation({
    mutationFn: (body: RevisarBody) => api<RevisarRespuesta>(`${BASE}/revision/${id}`, { method: "PATCH", json: body }),
    onSuccess: (fresco) => {
      qc.setQueryData(CLAVES.detalle(id), fresco);
      invalidar();
    },
  });
}

export function useComentarRevision(id: string) {
  const invalidar = useInvalidarTodo();
  return useMutation({
    mutationFn: (texto: string) =>
      api<ComentarRevisionRespuesta>(`${BASE}/revision/${id}/comentarios`, { method: "POST", json: { texto } }),
    onSuccess: invalidar,
  });
}
