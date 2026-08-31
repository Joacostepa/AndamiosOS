"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  AdjuntoRequisito, Bandeja, EstadoRequisito, FichaHabilitacion, ModalidadPermiso,
  Nota, Paquete, TipoGestion, TramiteEstado,
} from "@/lib/habilitaciones/tipos";
import type { FriccionDeOt } from "@/app/api/habilitaciones/candado/route";

// Habilitaciones. La gestión vive en Supabase y el estado en Odoo; todo pasa por
// /api/habilitaciones para que el reparto quede en un solo lugar.
//
// Los adjuntos son la excepción: van directo a Supabase Storage desde el browser. Pasar
// PDFs de capacitaciones por una ruta de API no aporta nada — el bucket es privado y sus
// políticas de RLS ya controlan quién sube y quién lee.

const BUCKET = "habilitaciones";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

// ─── Bandeja ────────────────────────────────────────────────────────────────

export function useBandejaHabilitaciones() {
  return useQuery({
    queryKey: ["habilitaciones"],
    queryFn: () => pedir<Bandeja>("/api/habilitaciones"),
    refetchOnWindowFocus: false,
  });
}

/**
 * Triage por lote. Invalida la bandeja al terminar.
 *
 * No espera a Odoo: la ruta escribe en Supabase, contesta, y sincroniza en after(). Con
 * ~68 entradas por mes el triage tiene que ser de un clic o la bandeja se llena de ruido.
 *
 * `pendiente` deshace el triage. Existe porque lo otro es irreversible desde la UI, y
 * una acción por lote sobre decenas de obras sin vuelta atrás es una trampa.
 */
export function useTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { otIds: number[]; decision: "aplica" | "no_aplica" | "pendiente" }) =>
      pedir<{ resueltas: number }>("/api/habilitaciones/triage", {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["habilitaciones"] });
      for (const otId of v.otIds) qc.invalidateQueries({ queryKey: ["habilitacion", otId] });
    },
  });
}

export function useReconciliar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      pedir<{ reparadas: number; fallidas: number; huerfanas: number }>(
        "/api/habilitaciones/reconciliar",
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habilitaciones"] }),
  });
}

// ─── Ficha ──────────────────────────────────────────────────────────────────

export function useHabilitacion(otId: number | null) {
  return useQuery({
    queryKey: ["habilitacion", otId],
    queryFn: async () =>
      (await pedir<{ ficha: FichaHabilitacion }>(`/api/habilitaciones/${otId}`)).ficha,
    enabled: !!otId,
    refetchOnWindowFocus: false,
  });
}

export function usePaquetes() {
  return useQuery({
    queryKey: ["hab-paquetes"],
    queryFn: async () =>
      (await pedir<{ paquetes: Paquete[] }>("/api/habilitaciones/paquetes")).paquetes,
    staleTime: 5 * 60_000,
  });
}

/** Lo que devuelven las mutaciones: el estado fresco de lo que vive en Supabase. */
type RespuestaGestion = {
  gestion?: {
    requisitos: FichaHabilitacion["requisitos"];
    notas: FichaHabilitacion["notas"];
    gestiones: FichaHabilitacion["gestiones"];
    reclamos: number;
  };
};

/**
 * Aplica el resultado de una mutación SIN volver a pedir la ficha.
 *
 * POR QUÉ NO SE INVALIDA: refrescar la ficha obliga a releer la OT y su venta en Odoo
 * —dos llamadas secuenciales de ~300 ms, porque hay que leer la OT para saber cuál es la
 * venta—, y marcar un requisito o aplicar un paquete no cambia nada de Odoo. Eran ~2
 * segundos de espera para traer datos idénticos a los que ya estaban en pantalla.
 *
 * La ruta devuelve el bloque de Supabase ya fresco y acá se pisa en la caché. Los campos
 * que sí dependen de Odoo —etapa, semáforo— se actualizan en el próximo refresco natural,
 * que es lo que pasaba igual: esa sincronización va en background.
 *
 * La bandeja sí se invalida, pero como no está montada mientras se mira la ficha, sólo
 * queda marcada como vieja y se refresca al volver.
 */
function useAplicar(otId: number) {
  const qc = useQueryClient();
  return (res: unknown) => {
    const gestion = (res as RespuestaGestion)?.gestion;
    if (gestion) {
      qc.setQueryData<FichaHabilitacion>(["habilitacion", otId], (prev) =>
        prev ? { ...prev, ...gestion } : prev,
      );
    } else {
      qc.invalidateQueries({ queryKey: ["habilitacion", otId] });
    }
    qc.invalidateQueries({ queryKey: ["habilitaciones"] });
  };
}

// ─── Requisitos ─────────────────────────────────────────────────────────────

export function useCambiarRequisito(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { requisitoId: string; estado: EstadoRequisito; motivo?: string | null }) =>
      pedir(`/api/habilitaciones/${otId}/requisitos`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: aplicar,
  });
}

/** Mover TODOS los requisitos que corresponda de un solo gesto. */
export function useMarcarTodos(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (todos: "enviado" | "aprobado") =>
      pedir<{ movidos: number }>(`/api/habilitaciones/${otId}/requisitos`, {
        method: "PATCH",
        body: JSON.stringify({ todos }),
      }),
    onSuccess: aplicar,
  });
}

/**
 * Declarar habilitada la obra, o revertirlo.
 *
 * Invalida la ficha entera y no sólo la gestión: la etapa y el semáforo los computa Odoo
 * a partir del estado que este gesto acaba de cambiar, así que hay que volver a leerlos.
 */
export function useDeclararHabilitacion(otId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { habilitar: boolean; faltan: number; motivo?: string | null }) =>
      pedir(`/api/habilitaciones/${otId}/habilitacion`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habilitacion", otId] });
      qc.invalidateQueries({ queryKey: ["habilitaciones"] });
    },
  });
}

/** Registrar que ya se le consultó al cliente. Es lo único que pasa de la etapa `a` a la `b`. */
export function useRegistrarConsulta(otId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => pedir(`/api/habilitaciones/${otId}/consulta`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habilitacion", otId] });
      qc.invalidateQueries({ queryKey: ["habilitaciones"] });
    },
  });
}

export function useAgregarRequisito(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { nombre: string } | { paqueteId: string }) =>
      pedir(`/api/habilitaciones/${otId}/requisitos`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: aplicar,
  });
}

export function useBorrarRequisito(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (requisitoId: string) =>
      pedir(`/api/habilitaciones/${otId}/requisitos`, {
        method: "DELETE",
        body: JSON.stringify({ requisitoId }),
      }),
    onSuccess: aplicar,
  });
}

// ─── Adjuntos ───────────────────────────────────────────────────────────────
//
// LOS ARCHIVOS CUELGAN DEL REQUISITO, NO DE LA OBRA: si el cliente observa las
// capacitaciones, se sabe exactamente qué reemplazar.

function prefijo(otId: number, requisitoId: string) {
  return `habilitaciones/${otId}/${requisitoId}`;
}

export function useAdjuntos(otId: number, requisitoId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["hab-adjuntos", otId, requisitoId],
    queryFn: async (): Promise<AdjuntoRequisito[]> => {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefijo(otId, requisitoId));
      if (error) throw error;
      return (data ?? [])
        .filter((f) => f.id !== null)
        .map((f) => ({
          nombre: f.name,
          path: `${prefijo(otId, requisitoId)}/${f.name}`,
          tamano: (f.metadata?.size as number | undefined) ?? null,
        }));
    },
  });
}

export function useSubirAdjunto(otId: number, requisitoId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (archivo: File) => {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${prefijo(otId, requisitoId)}/${archivo.name}`, archivo, { upsert: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hab-adjuntos", otId, requisitoId] }),
  });
}

export function useBorrarAdjunto(otId: number, requisitoId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hab-adjuntos", otId, requisitoId] }),
  });
}

/** El bucket es privado: para ver un archivo hace falta una URL firmada. */
export async function urlFirmada(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

// ─── Notas ──────────────────────────────────────────────────────────────────

export function useAgregarNota(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { texto: string; fijada?: boolean }) =>
      pedir(`/api/habilitaciones/${otId}/notas`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: aplicar,
  });
}

export function useFijarNota(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { notaId: string; fijada: boolean }) =>
      pedir(`/api/habilitaciones/${otId}/notas`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: aplicar,
  });
}

export function useBorrarNota(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (notaId: string) =>
      pedir(`/api/habilitaciones/${otId}/notas`, {
        method: "DELETE",
        body: JSON.stringify({ notaId }),
      }),
    onSuccess: aplicar,
  });
}

// ─── Gestiones y permiso ────────────────────────────────────────────────────

/** Registra la gestión. NO manda ningún mail: lo que aporta el sistema es la fecha. */
export function useRegistrarGestion(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: { tipo: TipoGestion; detalle?: string | null }) =>
      pedir(`/api/habilitaciones/${otId}/gestiones`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: aplicar,
  });
}

export function useActualizarPermiso(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (v: {
      modalidad?: ModalidadPermiso | null;
      tramite?: TramiteEstado | null;
      expedienteNro?: string | null;
      expedienteFecha?: string | null;
      permisoFecha?: string | null;
    }) => pedir(`/api/habilitaciones/${otId}/permiso`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: aplicar,
  });
}

export function useVencimiento(otId: number) {
  const aplicar = useAplicar(otId);
  return useMutation({
    mutationFn: (vencimiento: string | null) =>
      pedir(`/api/habilitaciones/${otId}`, { method: "PATCH", body: JSON.stringify({ vencimiento }) }),
    onSuccess: aplicar,
  });
}

/**
 * Las notas fijadas de una OT, para el panel del tablero y la ficha de la OT.
 *
 * No toca Odoo: abrir un panel no puede costar los ~800 ms de un RPC para mostrar dos
 * líneas de texto.
 */
export function useNotasFijadas(otId: number | null) {
  return useQuery({
    queryKey: ["hab-notas-fijadas", otId],
    queryFn: async () => {
      const r = await pedir<{ notas: Record<string, Nota[]> }>(
        `/api/habilitaciones/notas-fijadas?otIds=${otId}`,
      );
      return r.notas[String(otId)] ?? [];
    },
    enabled: !!otId,
    staleTime: 60_000,
  });
}

// ─── Candado del tablero ────────────────────────────────────────────────────

/**
 * Las fricciones de las OTs del tablero. Sólo lee Odoo (sale.order), así que no depende
 * de Supabase: si Supabase se cae, la planificación sigue funcionando.
 */
export function useCandado(otIds: number[]) {
  const clave = [...new Set(otIds)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["hab-candado", clave],
    queryFn: async () =>
      new Map(
        (
          await pedir<{ fricciones: FriccionDeOt[] }>(
            `/api/habilitaciones/candado?otIds=${clave.join(",")}`,
          )
        ).fricciones.map((f) => [f.otId, f]),
      ),
    enabled: clave.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/** Registra el pedido de modalidad al técnico, o la excepción con su motivo. */
export function useRegistrarCandado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { otId: number; tipo: "consulta" | "excepcion"; motivo?: string | null }) =>
      pedir<{ registrada: boolean; pedido?: number }>("/api/habilitaciones/candado", {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hab-candado"] });
      qc.invalidateQueries({ queryKey: ["habilitaciones"] });
    },
  });
}
