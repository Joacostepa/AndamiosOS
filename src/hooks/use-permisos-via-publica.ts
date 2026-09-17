"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bandeja, FichaExpediente, FichaTramite, VentaParaIniciar } from "@/lib/permisos-via-publica/tipos";
import type { Supervision } from "@/lib/permisos-via-publica/supervision";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * La bandeja se refresca sola: cada minuto normalmente, y cada 10 segundos mientras hay una
 * revisión pedida, para que el resultado de "Revisar ahora" aparezca sin recargar.
 */
export function useBandejaPermisos() {
  return useQuery({
    queryKey: ["permisos-via-publica"],
    queryFn: () => pedir<Bandeja>("/api/permisos-via-publica"),
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.revisando ? 10_000 : 60_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useExpediente(id: string) {
  return useQuery({
    queryKey: ["permiso-via-publica", id],
    queryFn: () => pedir<FichaExpediente>(`/api/permisos-via-publica/${id}`),
    staleTime: 30_000,
    // Mientras una póliza se revisa (~1 min) se consulta seguido, para que el resultado
    // aparezca sin recargar.
    refetchInterval: (q) => (q.state.data?.documentos.some((d) => d.estado === "revisando") ? 5_000 : 60_000),
  });
}

export function useVentasParaIniciar() {
  return useQuery({
    queryKey: ["permisos-ventas-para-iniciar"],
    queryFn: () => pedir<VentaParaIniciar[]>("/api/permisos-via-publica/ventas"),
    staleTime: 60_000,
  });
}

/** Guarda los interruptores del modo supervisado. */
export function useGuardarSupervision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: Partial<Supervision>) =>
      pedir<Supervision>("/api/permisos-via-publica/supervision", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos-via-publica"] }),
  });
}

/** "Pedir endoso a Segucom" desde la ficha del trámite (modo supervisado). */
export function usePedirEndosoTramite(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ ok: true }>(`/api/permisos-via-publica/tramites/${id}/endoso`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

/** Sube el certificado visado de la encomienda del CPAU. */
export function useSubirCertificado(id: string) {
  const qc = useQueryClient();
  return useMutation({
    /** La encomienda final y la certificación, en ese orden: el servidor las une en un PDF. */
    mutationFn: (archivos: File[]) => {
      const form = new FormData();
      for (const archivo of archivos) form.append("archivo", archivo);
      return pedir<{ ok: true; estado: string; observacion: string | null }>(`/api/permisos-via-publica/tramites/${id}/certificado`, { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

export function useIniciarTramite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ventaId: number) =>
      pedir<{ resultado: string; tramiteId: string; linkEnviado?: boolean; linkEnviadoA?: string | null }>(`/api/permisos-via-publica/ventas/${ventaId}/iniciar`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permisos-ventas-para-iniciar"] });
      qc.invalidateQueries({ queryKey: ["permisos-via-publica"] });
    },
  });
}

/** "Probar el circuito": trámite de prueba cuyos mails llegan a la casilla de la app. */
export function useCrearPrueba() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ tramiteId: string; linkEnviado: boolean }>("/api/permisos-via-publica/prueba", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos-via-publica"] }),
  });
}

/** Sólo trámites de prueba: el servidor rechaza borrar uno real. */
export function useBorrarTramite(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ ok: true }>(`/api/permisos-via-publica/tramites/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos-via-publica"] }),
  });
}

export function useTramite(id: string) {
  return useQuery({
    queryKey: ["tramite-permiso", id],
    queryFn: () => pedir<FichaTramite>(`/api/permisos-via-publica/tramites/${id}`),
    staleTime: 30_000,
    // Seguido mientras se revisa un documento o el robot trabaja en la encomienda del CPAU.
    refetchInterval: (q) =>
      q.state.data?.documentos.some((d) => d.estado === "revisando") ||
      ["pendiente", "tomada"].includes(q.state.data?.encomienda?.estado ?? "") ||
      // Un reintento programado (TAD no respondía) espera media hora: no hace falta mirar cada 5 s.
      (["pendiente", "tomada"].includes(q.state.data?.presentacion.tarea?.estado ?? "") && !q.state.data?.presentacion.tarea?.reintentar_desde) ||
      q.state.data?.presentacion.tarea?.estado === "tomada"
        ? 5_000
        : 60_000,
  });
}

/** Pide la presentación en TAD (o la prueba, en un trámite de prueba). */
export function usePresentacion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ resultado: "pedida" | "ya_pedida"; programadaPara: string | null }>(`/api/permisos-via-publica/tramites/${id}/presentacion`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

export type AccionPresentacion = "descartar_borrador" | "probar_ahora" | "dejar_de_reintentar";

/**
 * Acciones sobre la presentación desde la ficha: dejar de seguir el borrador de TAD (ya borrado a
 * mano) y adelantar o cortar el reintento automático cuando TAD no respondía.
 */
export function useAccionPresentacion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accion: AccionPresentacion) =>
      pedir<{ borrador?: number; ok?: true }>(`/api/permisos-via-publica/tramites/${id}/presentacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

export type AccionEncomienda = "pedir" | "finalizar" | "descartar";

/** Encomienda del CPAU: pedirla al robot, aprobar el Finalizar o descartarla. */
export function useEncomienda(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accion: AccionEncomienda) =>
      pedir<{ ok?: true; resultado?: "pedida" | "ya_pedida" }>(`/api/permisos-via-publica/tramites/${id}/encomienda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

/** Genera informe técnico y croquis. Sin venta (prueba) hay que pasar tipo y medidas. */
export function useGenerarDocumentos(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (medidas: { tipo: string; base: number; alto: number } | null) =>
      pedir<{ tipo: string; base: number; alto: number; smp: string | null; plancheta: boolean }>(`/api/permisos-via-publica/tramites/${id}/generar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(medidas ?? {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

export function useReenviarLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ ok: boolean }>(`/api/permisos-via-publica/tramites/${id}/link`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

/** Le vuelve a pedir al cliente que corrija un documento observado (mail con el motivo y el link). */
export function usePedirCorreccion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentoId: string) =>
      pedir<{ ok: boolean }>(`/api/permisos-via-publica/tramites/${id}/correccion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentoId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tramite-permiso", id] }),
  });
}

export function usePedirEndoso(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { titularNombre: string; titularCuit: string; permisoHasta: string | null }) =>
      pedir<{ ok: true }>(`/api/permisos-via-publica/${id}/endoso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permiso-via-publica", id] }),
  });
}

/** Subir a mano el PDF de un documento (p. ej. la póliza que Segucom mandó por mail). */
export function useSubirDocumento(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentoId, archivo }: { documentoId: string; archivo: File }) => {
      const form = new FormData();
      form.append("archivo", archivo);
      return pedir<{ ok: true }>(`/api/permisos-via-publica/documentos/${documentoId}`, { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permiso-via-publica", id] }),
  });
}

export type AccionVinculo = { accion: "confirmar" } | { accion: "descartar" } | { accion: "vincular"; venta: string };

/** Confirmar, descartar o elegir a mano la venta de Odoo de un expediente. */
export function useVinculoVenta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AccionVinculo) =>
      pedir<{ ok: true }>(`/api/permisos-via-publica/${id}/vinculo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permiso-via-publica", id] });
      qc.invalidateQueries({ queryKey: ["permisos-via-publica"] });
    },
  });
}

export function useRevisarAhora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir<{ ok: true; yaPedida: boolean }>("/api/permisos-via-publica/revisar", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permisos-via-publica"] }),
  });
}
