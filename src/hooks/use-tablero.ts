"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AsignacionTablero,
  CambioAsignacion,
  MovimientoAsignacion,
  NuevaAsignacion,
  TableroPayload,
} from "@/lib/tablero/tipos";

// Acceso al Tablero de Planificación. Todo pasa por /api/planificacion, que habla con
// Odoo server-side: la app no tiene base de datos propia para las asignaciones.
//
// DECISIÓN (UX): las escrituras son optimistas. El tablero se edita en ráfagas y
// esperar el round-trip a Odoo por cada arrastre lo haría inusable. Si la escritura
// falla, se revierte el cambio en pantalla y se avisa con un toast.

const CLAVE = ["tablero"] as const;

export function claveTablero(desde: string, hasta: string) {
  return [...CLAVE, desde, hasta];
}

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

export function useTablero(desde: string, hasta: string) {
  return useQuery({
    queryKey: claveTablero(desde, hasta),
    queryFn: () =>
      pedir<TableroPayload>(`/api/planificacion/tablero?desde=${desde}&hasta=${hasta}`),
    enabled: !!desde && !!hasta,
    // Odoo Online limita las consultas concurrentes: no conviene refetchear cada vez
    // que la pestaña vuelve al foco, ni reintentar en ráfaga si algo falló.
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (intento) => 800 * 2 ** intento,
  });
}

// ── Andamiaje de las mutaciones optimistas ───────────────────────────────────

type Contexto = { previos: [readonly unknown[], TableroPayload | undefined][] };

/** Aplica un cambio a todas las semanas cacheadas y devuelve el snapshot para revertir. */
async function aplicarOptimista(
  qc: QueryClient,
  fn: (data: TableroPayload) => TableroPayload,
): Promise<Contexto> {
  await qc.cancelQueries({ queryKey: CLAVE });
  const previos = qc.getQueriesData<TableroPayload>({ queryKey: CLAVE });
  qc.setQueriesData<TableroPayload>({ queryKey: CLAVE }, (data) => (data ? fn(data) : data));
  return { previos };
}

function revertir(qc: QueryClient, ctx: Contexto | undefined, mensaje: string, error: Error) {
  for (const [clave, data] of ctx?.previos ?? []) qc.setQueryData(clave, data);
  toast.error(mensaje, { description: error.message });
}

// Ids temporales para las tarjetas que todavía no existen en Odoo. Negativos para no
// chocar nunca con un id real.
let proximoIdTemporal = -1;

// ── Mutaciones ───────────────────────────────────────────────────────────────

export function useCrearAsignaciones() {
  const qc = useQueryClient();
  return useMutation<{ ids: number[] }, Error, NuevaAsignacion[], Contexto>({
    mutationFn: (asignaciones) =>
      pedir<{ ids: number[] }>("/api/planificacion/asignaciones", {
        method: "POST",
        body: JSON.stringify({ asignaciones }),
      }),
    onMutate: (asignaciones) => {
      const nuevas: AsignacionTablero[] = asignaciones.map((a) => ({
        id: proximoIdTemporal--,
        otId: a.otId,
        fecha: a.fecha,
        cuadrillaId: a.cuadrillaId,
        fraccion: Number(a.fraccion),
        estado: a.estado,
        ordenDia: a.ordenDia,
        notas: a.notas ?? null,
        // Una asignación recién creada nunca nace cerrada.
        parteId: null,
      }));
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: [...data.asignaciones, ...nuevas],
        otsAsignadas: [...new Set([...data.otsAsignadas, ...nuevas.map((n) => n.otId)])],
      }));
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo asignar", error),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useActualizarAsignaciones() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { ids: number[]; cambio: CambioAsignacion }, Contexto>({
    mutationFn: (body) =>
      pedir<{ ok: true }>("/api/planificacion/asignaciones", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: ({ ids, cambio }) =>
      aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) =>
          ids.includes(a.id)
            ? {
                ...a,
                ...(cambio.fecha !== undefined ? { fecha: cambio.fecha } : {}),
                ...(cambio.cuadrillaId !== undefined ? { cuadrillaId: cambio.cuadrillaId } : {}),
                ...(cambio.fraccion !== undefined ? { fraccion: Number(cambio.fraccion) } : {}),
                ...(cambio.estado !== undefined ? { estado: cambio.estado } : {}),
                ...(cambio.ordenDia !== undefined ? { ordenDia: cambio.ordenDia } : {}),
                ...(cambio.notas !== undefined ? { notas: cambio.notas ?? null } : {}),
              }
            : a,
        ),
      })),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo guardar el cambio", error),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

/** Mover un bloque: cada jornada a su nueva fecha, todas juntas. */
export function useMoverAsignaciones() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, MovimientoAsignacion[], Contexto>({
    mutationFn: (movimientos) =>
      pedir<{ ok: true }>("/api/planificacion/asignaciones", {
        method: "PATCH",
        body: JSON.stringify({ movimientos }),
      }),
    onMutate: (movimientos) => {
      const porId = new Map(movimientos.map((m) => [m.id, m]));
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) => {
          const m = porId.get(a.id);
          if (!m) return a;
          return {
            ...a,
            fecha: m.fecha,
            ...(m.cuadrillaId !== undefined ? { cuadrillaId: m.cuadrillaId } : {}),
            ...(m.ordenDia !== undefined ? { ordenDia: m.ordenDia } : {}),
          };
        }),
      }));
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo mover la obra", error),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useBorrarAsignaciones() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, number[], Contexto>({
    mutationFn: (ids) =>
      pedir<{ ok: true }>("/api/planificacion/asignaciones", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
    onMutate: (ids) =>
      aplicarOptimista(qc, (data) => {
        const quedan = data.asignaciones.filter((a) => !ids.includes(a.id));
        const conAsignacion = new Set(quedan.map((a) => a.otId));
        const borradas = data.asignaciones.filter((a) => ids.includes(a.id)).map((a) => a.otId);
        return {
          ...data,
          asignaciones: quedan,
          // Una OT vuelve a la bandeja solo si no le queda ninguna jornada en el rango
          // visible; si tiene jornadas en otra semana, sigue contando como asignada.
          otsAsignadas: data.otsAsignadas.filter((id) => !borradas.includes(id) || conAsignacion.has(id)),
        };
      }),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo quitar del tablero", error),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}
