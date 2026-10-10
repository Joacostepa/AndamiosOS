"use client";

// La bandeja de la oficina del pañol: la lectura (armada en /api/panol/bandeja, por los
// nombres de Odoo) y lo que se resuelve desde la fila.
//
// Las escrituras van directo a Supabase, como todo el pañol: las aprobaciones y las
// gestiones son RPC que validan quién firma (pan_conteo_resolver, pan_registrar_vale), y
// "marcar resuelto" un artículo sin alta es una columna que la RLS sólo le deja a un
// encargado. Todo invalida ["panol"], así que la bandeja y el catálogo se refrescan juntos.

import { useCallback, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { idDispositivo, registrarVale, rpc, useInvalidarPanol } from "@/hooks/use-panol";
import type { Bandeja } from "@/lib/panol/bandeja";
import type { ItemVale, ResultadoVale } from "@/lib/panol/tipos";

export function useBandejaPanol() {
  return useQuery({
    queryKey: ["panol", "bandeja"],
    queryFn: async (): Promise<Bandeja> => {
      const res = await fetch("/api/panol/bandeja");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      return (await res.json()) as Bandeja;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Aprobar o rechazar un ajuste de conteo. La base frena a quien contó. */
export function useResolverConteo() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: (p: { conteoId: string; aprobar: boolean; motivo?: string }) =>
      rpc<{ estado: string }>("pan_conteo_resolver", {
        p_conteo: p.conteoId, p_aprobar: p.aprobar, p_motivo: p.motivo?.trim() || null, p_token: null,
      }),
    onSettled: invalidar,
  });
}

/**
 * Una gestión de encargado desde la oficina (revisión, taller, pérdida). Un vale de un solo
 * ítem: así el Deshacer del toast deshace exactamente eso.
 */
export function useGestionPanol() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: (item: ItemVale): Promise<ResultadoVale> =>
      registrarVale({ clientUuid: crypto.randomUUID(), tipo: "gestion", dispositivo: idDispositivo(), items: [item] }),
    onSettled: invalidar,
  });
}

/** Marcar (o desmarcar, para el Deshacer) un artículo sin alta como resuelto. */
export function useSinAltaResuelto() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (p: { id: string; resuelto: boolean }) => {
      const db = createClient();
      const { data: auth } = await db.auth.getUser();
      const { error } = await db
        .from("pan_sin_alta")
        .update(p.resuelto ? { resuelto_at: new Date().toISOString(), resuelto_por: auth.user?.id ?? null } : { resuelto_at: null, resuelto_por: null })
        .eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSettled: invalidar,
  });
}

// ─── Lo que vive en este navegador ──────────────────────────────────────────
//
// La lista de reposición y "a quién ya le avisé por WhatsApp" no tienen tabla en la fase 1
// (el borrador de pedido automático es de la fase 3). Se guardan en este navegador: alcanza
// para armar el pedido de la semana y para no mandarle dos veces el mismo mensaje a alguien.

const EVENTO = "panol:guardado";

function leer<T>(clave: string, inicial: T): T {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : inicial;
  } catch {
    return inicial;
  }
}

// useSyncExternalStore compara por identidad: se cachea el valor parseado por el texto crudo.
const cache = new Map<string, { crudo: string | null; valor: unknown }>();

function useGuardado<T>(clave: string, inicial: T): [T, (siguiente: (antes: T) => T) => void] {
  const subscribe = useCallback((avisar: () => void) => {
    const si = (e: Event) => {
      if (e instanceof StorageEvent ? e.key === clave : (e as CustomEvent<string>).detail === clave) avisar();
    };
    window.addEventListener("storage", si);
    window.addEventListener(EVENTO, si);
    return () => {
      window.removeEventListener("storage", si);
      window.removeEventListener(EVENTO, si);
    };
  }, [clave]);
  const getSnapshot = useCallback(() => {
    let crudo: string | null = null;
    try {
      crudo = window.localStorage.getItem(clave);
    } catch {
      /* sin almacenamiento */
    }
    const previo = cache.get(clave);
    if (previo && previo.crudo === crudo) return previo.valor as T;
    const valor = leer(clave, inicial);
    cache.set(clave, { crudo, valor });
    return valor;
  }, [clave, inicial]);
  const valor = useSyncExternalStore(subscribe, getSnapshot, () => inicial);
  const guardar = useCallback((siguiente: (antes: T) => T) => {
    const nuevo = siguiente(leer(clave, inicial));
    try {
      window.localStorage.setItem(clave, JSON.stringify(nuevo));
    } catch {
      /* sin almacenamiento: se pierde al recargar */
    }
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: clave }));
  }, [clave, inicial]);
  return [valor, guardar];
}

export type ItemReposicion = { clave: string; articuloId: string; varianteId: string | null; cantidad: number; texto: string; agregado: string };

const SIN_ITEMS: ItemReposicion[] = [];

export function useListaReposicion() {
  const [items, guardar] = useGuardado<ItemReposicion[]>("panol:reposicion", SIN_ITEMS);
  return {
    items,
    tiene: (clave: string) => items.some((i) => i.clave === clave),
    agregar: (i: Omit<ItemReposicion, "agregado">) =>
      guardar((antes) => [...antes.filter((x) => x.clave !== i.clave), { ...i, agregado: new Date().toISOString() }]),
    quitar: (clave: string) => guardar((antes) => antes.filter((x) => x.clave !== clave)),
    vaciar: () => guardar(() => []),
    reponer: (lista: ItemReposicion[]) => guardar(() => lista),
  };
}

const SIN_AVISOS: Record<string, string> = {};

/** clave del aviso → cuándo se abrió el WhatsApp. */
export function useAvisadosWhatsapp() {
  const [avisados, guardar] = useGuardado<Record<string, string>>("panol:avisados", SIN_AVISOS);
  return {
    avisados,
    marcar: (clave: string) => guardar((antes) => ({ ...antes, [clave]: new Date().toISOString() })),
    desmarcar: (clave: string) => guardar((antes) => {
      const { [clave]: _fuera, ...resto } = antes;
      void _fuera;
      return resto;
    }),
  };
}
