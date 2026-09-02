"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Feriado } from "@/lib/feriados/argentina";
import { fechasDeJornadas } from "@/lib/tablero/bloques";
import { CLAVE_CONFIRMACIONES } from "@/hooks/use-confirmaciones";
import type { RegistroConfirmacion } from "@/lib/tablero/tipos-confirmacion";
import type {
  AsignacionTablero,
  CambioAsignacion,
  MovimientoAsignacion,
  NuevaAsignacion,
  CambioTarea,
  NuevaTarea,
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

/**
 * Feriados nacionales del rango visible.
 *
 * Query aparte de la del tablero: cambian una vez al año, no dependen de Odoo y no
 * tienen por qué volver a pedirse cada vez que se refresca la semana. Si la API de
 * terceros no contesta, el servidor devuelve el respaldo local, así que esto no falla.
 */
export function useFeriados(desde: string, hasta: string) {
  // Se piden los AÑOS completos, no el rango exacto: el rango del tablero crece al
  // scrollear, y cachear por año con datos recortados al rango viejo dejaría feriados
  // afuera sin volver a preguntar. Un año entero son 19 fechas.
  const anios: [string, string] = [`${desde.slice(0, 4)}-01-01`, `${hasta.slice(0, 4)}-12-31`];
  return useQuery({
    queryKey: ["feriados", ...anios],
    queryFn: () => pedir<{ feriados: Feriado[] }>(`/api/feriados?desde=${anios[0]}&hasta=${anios[1]}`),
    enabled: !!desde && !!hasta,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ── Andamiaje de las mutaciones optimistas ───────────────────────────────────

type Contexto = {
  previos: [readonly unknown[], TableroPayload | undefined][];
  /** Ids temporales que creó esta mutación, en el orden en que se pidieron. */
  temporales?: number[];
};

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
  // Cuando algo falla el refresco NO se agrupa: la pantalla acaba de volver atrás y hay
  // que saber ya qué quedó realmente escrito en Odoo. Agrupar está bien mientras todo
  // sale bien, que es el caso normal.
  void qc.invalidateQueries({ queryKey: CLAVE });
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

/**
 * Refresco de fondo contra Odoo, AGRUPADO.
 *
 * Antes cada escritura invalidaba al terminar, y planificar es una ráfaga de arrastres:
 * eran N consultas de ~49 KB y ~1,4 s cada una contra una Odoo Online que limita la
 * concurrencia, encoladas una atrás de la otra.
 *
 * No es lo que pinta la pantalla —todas las mutaciones son optimistas y exactas, ids
 * reales incluidos— sino la red que trae lo que hayan tocado otros. Así que puede
 * esperar a que la mano pare, y ahí se hace una sola.
 */
let refrescoPendiente: ReturnType<typeof setTimeout> | null = null;
const ESPERA_REFRESCO = 1500;

function refrescarPronto(qc: QueryClient) {
  if (refrescoPendiente) clearTimeout(refrescoPendiente);
  refrescoPendiente = setTimeout(() => {
    refrescoPendiente = null;
    void qc.invalidateQueries({ queryKey: CLAVE });
  }, ESPERA_REFRESCO);
}

// ── Mutaciones ───────────────────────────────────────────────────────────────

export function useCrearAsignaciones() {
  const qc = useQueryClient();
  return useMutation<{ ids: number[] }, Error, NuevaAsignacion[], Contexto>({
    mutationFn: (asignaciones) =>
      pedir<{ ids: number[] }>("/api/planificacion/asignaciones", {
        method: "POST",
        body: JSON.stringify({ asignaciones }),
      }),
    onMutate: async (asignaciones) => {
      const temporales = asignaciones.map(() => proximoIdTemporal--);
      const nuevas: AsignacionTablero[] = asignaciones.map((a, i) => ({
        id: temporales[i],
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
      const ctx = await aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: [...data.asignaciones, ...nuevas],
        progreso: sumarProgreso(data.progreso, nuevas.map((n) => n.otId)),
      }));
      return { ...ctx, temporales };
    },
    /**
     * Los ids reales entran en cuanto Odoo contesta, sin esperar al refetch.
     *
     * Es la mitad de lo que se sentía como "queda cargando": la tarjeta se bloquea
     * mientras tenga ids negativos (ver `guardando` en TarjetaAsignacion — no se puede
     * arrastrar, sin menú, cursor de reloj), y antes esos ids negativos vivían hasta que
     * volvía el tablero entero. O sea que se esperaban ~1,4 s por una respuesta que ya
     * teníamos en la mano: el POST devuelve los ids creados.
     */
    onSuccess: ({ ids }, _vars, ctx) => {
      const temporales = ctx?.temporales ?? [];
      // Odoo devuelve los ids en el mismo orden en que se mandaron los valores. Si las
      // longitudes no coinciden no se adivina el emparejamiento: se deja que el refresco
      // de fondo traiga la verdad, en vez de dejar tarjetas apuntando a otra fila.
      if (ids.length !== temporales.length) return;
      const real = new Map(temporales.map((t, i) => [t, ids[i]]));
      qc.setQueriesData<TableroPayload>({ queryKey: CLAVE }, (data) =>
        data
          ? {
              ...data,
              asignaciones: data.asignaciones.map((a) =>
                real.has(a.id) ? { ...a, id: real.get(a.id) as number } : a,
              ),
            }
          : data,
      );
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo asignar", error),
    onSettled: () => refrescarPronto(qc),
  });
}

export function useActualizarAsignaciones() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; registrado?: boolean },
    Error,
    // `contexto` sólo viaja al cambiar el ESTADO: dice de qué obra y de qué días son
    // estos ids, para que el servidor pueda anotar quién confirmó sin releer Odoo.
    { ids: number[]; cambio: CambioAsignacion; contexto?: RegistroConfirmacion },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ok: true; registrado?: boolean }>("/api/planificacion/asignaciones", {
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
    onSuccess: ({ registrado }, { cambio, contexto }) => {
      if (!cambio.estado || !contexto) return;
      // El historial del panel cambió: se vuelve a pedir sólo el de esta obra.
      void qc.invalidateQueries({ queryKey: [...CLAVE_CONFIRMACIONES, contexto.otId] });
      // El estado SÍ cambió en Odoo pero el registro no se pudo escribir. Se avisa en vez
      // de dejarlo pasar: una auditoría con agujeros silenciosos no sirve de auditoría.
      if (registrado === false) {
        toast.warning("La jornada cambió de estado, pero no quedó registrado quién lo hizo", {
          description: "El cambio está guardado en Odoo. El historial de confirmaciones de esta obra va a tener un hueco.",
        });
      }
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo guardar el cambio", error),
    onSettled: () => refrescarPronto(qc),
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
    onSettled: () => refrescarPronto(qc),
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
    onSettled: () => refrescarPronto(qc),
  });
}

// ── Tarjetas de operaciones ──────────────────────────────────────────────────
//
// Van a /api/planificacion/tareas (Supabase) en vez de /asignaciones (Odoo), pero
// escriben en el MISMO array optimista: en la caché una tarea es una asignación más, y
// tiene que serlo para que la capacidad de la celda y los bloques la vean. Lo único que
// cambia es a qué endpoint viaja.
//
// Qué operación corresponde a cuál la decide el board mirando `bloque.origen`.

export function useCrearTarea() {
  const qc = useQueryClient();
  return useMutation<
    { ids: number[] },
    Error,
    NuevaTarea & { dias?: number },
    Contexto
  >({
    mutationFn: (tarea) =>
      pedir<{ ids: number[] }>("/api/planificacion/tareas", {
        method: "POST",
        body: JSON.stringify(tarea),
      }),
    onMutate: (tarea) => {
      // El grupo real lo asigna Supabase; hasta que vuelva, los días comparten un grupo
      // temporal negativo para que ya se dibujen como una sola tarjeta.
      const grupoTemporal = proximoIdTemporal--;
      const fechas = fechasDeJornadas(tarea.fecha, tarea.dias ?? 1, { permitirDomingo: true });
      const nuevas: AsignacionTablero[] = fechas.map((fecha) => ({
        id: proximoIdTemporal--,
        origen: "tarea",
        otId: 0,
        tarea: {
          grupoId: grupoTemporal,
          titulo: tarea.titulo,
          tipo: tarea.tipo,
          hecha: false,
        },
        fecha,
        cuadrillaId: tarea.cuadrillaId,
        fraccion: Number(tarea.fraccion),
        estado: "confirmada",
        ordenDia: tarea.ordenDia ?? 0,
        notas: tarea.notas ?? null,
        parteId: null,
      }));
      // Sin tocar `progreso`: eso cuenta jornadas de OBRAS y una tarea no es una.
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: [...data.asignaciones, ...nuevas],
      }));
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo crear la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}

export function useActualizarTareas() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true },
    Error,
    { ids: number[]; cambio: CambioTarea } | { grupoId: number; cambio: CambioTarea },
    Contexto
  >({
    mutationFn: (body) =>
      pedir<{ ok: true }>("/api/planificacion/tareas", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: (body) => {
      const { cambio } = body;
      // Renombrar toca todos los días de la tarea; cambiar la fracción, sólo los que se
      // pasaron. Por eso el filtro mira el grupo en un caso y los ids en el otro.
      const alcanza = (a: AsignacionTablero) =>
        "grupoId" in body ? a.tarea?.grupoId === body.grupoId : body.ids.includes(a.id);
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) =>
          a.origen === "tarea" && a.tarea && alcanza(a)
            ? {
                ...a,
                ...(cambio.fecha !== undefined ? { fecha: cambio.fecha } : {}),
                ...(cambio.cuadrillaId !== undefined ? { cuadrillaId: cambio.cuadrillaId } : {}),
                ...(cambio.fraccion !== undefined ? { fraccion: Number(cambio.fraccion) } : {}),
                ...(cambio.ordenDia !== undefined ? { ordenDia: cambio.ordenDia } : {}),
                ...(cambio.notas !== undefined ? { notas: cambio.notas ?? null } : {}),
                tarea: {
                  ...a.tarea,
                  ...(cambio.titulo !== undefined ? { titulo: cambio.titulo } : {}),
                  ...(cambio.tipo !== undefined ? { tipo: cambio.tipo } : {}),
                  ...(cambio.hecha !== undefined ? { hecha: cambio.hecha } : {}),
                },
              }
            : a,
        ),
      }));
    },
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo guardar la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}

/** Mover una tarjeta de operaciones: cada día a su nueva fecha y cuadrilla. */
export function useMoverTareas() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, MovimientoAsignacion[], Contexto>({
    mutationFn: (movimientos) =>
      pedir<{ ok: true }>("/api/planificacion/tareas", {
        method: "PATCH",
        body: JSON.stringify({ movimientos }),
      }),
    onMutate: (movimientos) => {
      const porId = new Map(movimientos.map((m) => [m.id, m]));
      return aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) => {
          const m = a.origen === "tarea" ? porId.get(a.id) : undefined;
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
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo mover la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}

export function useBorrarTareas() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, number[], Contexto>({
    mutationFn: (ids) =>
      pedir<{ ok: true }>("/api/planificacion/tareas", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
    onMutate: (ids) =>
      aplicarOptimista(qc, (data) => ({
        ...data,
        // Sin tocar `progreso`, por lo mismo que en el alta.
        asignaciones: data.asignaciones.filter(
          (a) => !(a.origen === "tarea" && ids.includes(a.id)),
        ),
      })),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo borrar la tarea", error),
    onSettled: () => refrescarPronto(qc),
  });
}
