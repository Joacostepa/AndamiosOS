"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { hoyISO, preverDerivados } from "@/lib/habilitaciones/derivacion";
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

/**
 * La bandeja. Se refresca sola, que es lo que antes no pasaba.
 *
 * LAS OTs NUEVAS: no hay demora de sincronización —`cabecerasDe` siembra la fila en la
 * misma lectura, así que una OT recién creada en Odoo aparece en cuanto se lee la
 * bandeja—. Lo que fallaba es que la bandeja no se volvía a leer NUNCA: sin staleTime pero
 * con `refetchOnWindowFocus: false`, con la pestaña abierta se quedaba congelada hasta
 * que alguien navegaba a otro lado y volvía. De ahí el "tarda en aparecer".
 *
 * Ahora se relee cada 2 minutos y al volver a la pestaña. Y el `staleTime` de 60 s hace lo
 * inverso en el caso frecuente: ir a la bandeja, abrir una obra y volver ya no dispara de
 * nuevo las dos llamadas a Odoo y las dos a Supabase para traer lo mismo.
 */
export function useBandejaHabilitaciones() {
  return useQuery({
    queryKey: ["habilitaciones"],
    queryFn: () => pedir<Bandeja>("/api/habilitaciones"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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

/**
 * La ficha de una obra.
 *
 * `staleTime` de 60 s porque volver a entrar a la misma obra cuesta caro: dos llamadas a
 * Odoo más una a Supabase. Las mutaciones ya parchean esta entrada con setQueryData
 * (ver useAplicar), así que lo que se ve nunca queda atrasado respecto de lo que uno hizo
 * — el minuto sólo evita releer lo que no cambió.
 */
export function useHabilitacion(otId: number | null) {
  return useQuery({
    queryKey: ["habilitacion", otId],
    queryFn: async () =>
      (await pedir<{ ficha: FichaHabilitacion }>(`/api/habilitaciones/${otId}`)).ficha,
    enabled: !!otId,
    staleTime: 60_000,
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
 * Parchea la ficha en caché sin volver a pedirla.
 *
 * Invalidar cuesta ~520 ms de Odoo en dos llamadas secuenciales, y encima el push sale en
 * after() —después de responder—, así que el refetch puede leer el estado viejo. Se
 * aplica el cambio que ya conocemos y se predicen etapa y semáforo con la misma fórmula
 * que corre en Odoo. La bandeja sólo se marca vencida: no está montada, así que no
 * dispara ninguna lectura hasta que se vuelva a ella.
 */
function useParchearFicha(otId: number) {
  const qc = useQueryClient();
  return (cambio: Partial<FichaHabilitacion>) => {
    qc.setQueryData<FichaHabilitacion>(["habilitacion", otId], (prev) => {
      if (!prev) return prev;
      const siguiente = { ...prev, ...cambio };
      // Mismo criterio que derivarInputs, para que la predicción no se separe de lo que
      // el servidor va a escribir: al revertir, una obra sin ningún papel movido vuelve a
      // `pendiente` (semáforo rojo) y no a `en_curso` (amarillo).
      // "No aplica" es habilitada: no hay nada que tramitar, así que no hay nada que la
      // frene. Mismo criterio que derivarInputs.
      const habEstado = siguiente.habilitadaEl || siguiente.triage === "no_aplica"
        ? "habilitada"
        : siguiente.requisitos.some((r) => r.estado !== "pendiente") || siguiente.fechaEnvio
          ? "en_curso"
          : "pendiente";

      const { etapa, semaforo } = preverDerivados({
        habEstado,
        fechaConsulta: siguiente.fechaConsulta,
        fechaEnvio: siguiente.fechaEnvio,
        vencimiento: siguiente.vencimiento,
        otEjecutada: ["completada", "cancelada"].includes(siguiente.estadoOt),
      });
      return { ...siguiente, etapa, semaforo };
    });
    qc.invalidateQueries({ queryKey: ["habilitaciones"] });
  };
}

/** Declarar habilitada la obra, o revertirlo. */
export function useDeclararHabilitacion(otId: number) {
  const parchear = useParchearFicha(otId);
  return useMutation({
    mutationFn: (v: { habilitar: boolean; faltan: number; motivo?: string | null }) =>
      pedir<RespuestaGestion>(`/api/habilitaciones/${otId}/habilitacion`, {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: (res, v) => {
      const hoy = hoyISO();
      parchear({
        habilitadaEl: v.habilitar ? hoy : null,
        habilitadaMotivo: v.habilitar ? (v.faltan > 0 ? (v.motivo ?? null) : null) : null,
        fechaHabilitada: v.habilitar ? hoy : null,
        ...(res.gestion ?? {}),
      });
    },
  });
}

/** Registrar que ya se le consultó al cliente. Es lo único que pasa de la etapa `a` a la `b`. */
export function useRegistrarConsulta(otId: number) {
  const parchear = useParchearFicha(otId);
  return useMutation({
    mutationFn: () =>
      pedir<RespuestaGestion>(`/api/habilitaciones/${otId}/consulta`, { method: "POST" }),
    onSuccess: (res) => parchear({ fechaConsulta: hoyISO(), ...(res.gestion ?? {}) }),
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

/**
 * Los archivos de TODOS los requisitos de la obra, en una sola consulta.
 *
 * ANTES ERA UNO POR REQUISITO. Cada `<Adjuntos>` hacía su propio storage.list() desde el
 * browser: con 12 requisitos, 12 requests de ~300 ms que el navegador además serializa de
 * a 6, casi todos devolviendo cero archivos. Y sin staleTime, o sea otra vez enteros en
 * cada montaje de la ficha. Ahora los lista el servidor en paralelo y el browser paga un
 * viaje (ver /api/habilitaciones/[otId]/adjuntos).
 */
export function useAdjuntosDeOt(otId: number) {
  return useQuery({
    queryKey: ["hab-adjuntos", otId],
    queryFn: async () => {
      const r = await pedir<{ adjuntos: Record<string, AdjuntoRequisito[]> }>(
        `/api/habilitaciones/${otId}/adjuntos`,
      );
      return r.adjuntos;
    },
    enabled: !!otId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hab-adjuntos", otId] }),
  });
}

/** Borra por path completo, así que no necesita saber de qué requisito cuelga. */
export function useBorrarAdjunto(otId: number) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hab-adjuntos", otId] }),
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
