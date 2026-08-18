"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
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
    // CRÍTICO para el scroll horizontal: al llegar al borde el tablero amplía el rango,
    // y eso cambia la queryKey. Sin esto `data` vuelve a undefined, el board cae al
    // skeleton, la grilla SE DESMONTA y el scroll se pierde; al remontar arranca en 0,
    // que es otra vez el borde, y pide otra semana. Un lazo que se retroalimenta.
    // Conservando los datos previos la grilla nunca se desmonta y el scroll queda quieto.
    placeholderData: keepPreviousData,
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

/** Suma una jornada al avance de cada OT indicada (crea la entrada si no estaba). */
function sumarProgreso(progreso: TableroPayload["progreso"], otIds: number[]) {
  const mapa = new Map(progreso.map((p) => [p.otId, { ...p }]));
  for (const otId of otIds) {
    const actual = mapa.get(otId) ?? { otId, asignadas: 0, cerradas: 0 };
    mapa.set(otId, { ...actual, asignadas: actual.asignadas + 1 });
  }
  return [...mapa.values()];
}

/** Resta una jornada del avance por cada asignación borrada. */
function restarProgreso(progreso: TableroPayload["progreso"], otIds: number[]) {
  const mapa = new Map(progreso.map((p) => [p.otId, { ...p }]));
  for (const otId of otIds) {
    const actual = mapa.get(otId);
    if (actual) mapa.set(otId, { ...actual, asignadas: Math.max(0, actual.asignadas - 1) });
  }
  return [...mapa.values()].filter((p) => p.asignadas > 0 || p.cerradas > 0);
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
        progreso: sumarProgreso(data.progreso, nuevas.map((n) => n.otId)),
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
        const borradas = data.asignaciones.filter((a) => ids.includes(a.id));
        return {
          ...data,
          asignaciones: data.asignaciones.filter((a) => !ids.includes(a.id)),
          // Liberar jornadas devuelve la obra a la bandeja con su remanente: el avance
          // baja en la cantidad de jornadas liberadas, no de golpe a cero.
          progreso: restarProgreso(data.progreso, borradas.map((a) => a.otId)),
        };
      }),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo quitar del tablero", error),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}
