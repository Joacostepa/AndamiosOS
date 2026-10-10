"use client";

// Acceso a la Hoja del día desde las pantallas. Todo pasa por /api/hoja-dia/* (que lee
// Odoo y Supabase del lado del servidor); las cuentas las hace src/lib/hoja-dia/estado.ts
// en el navegador con el `DiaHoja` que devuelve el GET y la hora (`useAhora`).
//
// NO SON OPTIMISTAS (a diferencia del tablero): cada gesto devuelve el texto del aviso y el
// id del historial para "Deshacer", y después se vuelve a pedir el día. Un gesto de la hoja
// toca varias filas (la persona sale de una cuadrilla y entra en otra, el chofer arrastra
// sus viajes), y adivinar el resultado en el navegador sería escribir la regla dos veces.
//
// EN VIVO: escucha el canal de la hoja (otro coordinador, el capataz que tocó Recibido, el
// chofer que marcó Hecho) Y el del tablero (mover una obra cambia la hoja). Agrupa las
// ráfagas como use-avisos-tablero, y al volver a la pestaña refresca igual.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import type { AccionAusencia, AccionHoja, AccionPedido, AccionViaje, Resultado } from "@/lib/hoja-dia/acciones";
import type { Preparado, EstadoTelegram } from "@/lib/hoja-dia/envios";
import type { PrecargaCierre } from "@/lib/hoja-dia/servicio";
import { minutosDesde } from "@/lib/hoja-dia/estado";
import { avisarCambioHoja, conectarAvisosHoja, type AvisoHoja } from "@/lib/hoja-dia/avisos";
import { conectarAvisos } from "@/lib/tablero/avisos";
import { useUser } from "@/hooks/use-user";

export const CLAVE_HOJA = ["hoja-dia"] as const;
export const claveDia = (fecha: string) => [...CLAVE_HOJA, "dia", fecha] as const;

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}
const post = <T>(url: string, body: unknown) => pedir<T>(url, { method: "POST", body: JSON.stringify(body) });

/** El día entero. `fecha` en YYYY-MM-DD. */
export function useHojaDia(fecha: string | null) {
  return useQuery({
    queryKey: claveDia(fecha ?? ""),
    queryFn: () => pedir<DiaHoja>(`/api/hoja-dia?fecha=${fecha}`),
    enabled: !!fecha,
    placeholderData: keepPreviousData,
    // Compartida y editada por más de uno, como el tablero: medio minuto de vigencia y los
    // cambios ajenos por aviso en vivo.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/**
 * La hora en la escala del módulo (minutos desde las 0:00 del día de la hoja), que avanza
 * sola cada 30 segundos. Es el `ahora` que piden las funciones de estado.ts.
 */
export function useAhora(fecha: string | null, cadaMs = 30_000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return fecha ? minutosDesde(fecha, t) : 0;
}

/** Escucha los cambios de los demás (hoja y tablero) y refresca el día que se mira. */
export function useAvisosHojaDia(fecha: string | null) {
  const qc = useQueryClient();
  const { data: user } = useUser();
  const nombre = user?.nombre?.trim() || "Alguien";
  const pendientes = useRef<AvisoHoja[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fecha) return;
    const refrescar = (a: AvisoHoja | null) => {
      if (a) pendientes.current.push(a);
      if (timer.current) clearTimeout(timer.current);
      // El link del capataz no espera (es un toque, no una ráfaga); los demás, 2 s.
      timer.current = setTimeout(() => {
        const lote = pendientes.current;
        pendientes.current = [];
        void qc.invalidateQueries({ queryKey: CLAVE_HOJA });
        const afuera = lote.filter((x) => x.desde === "afuera" && x.fecha === fecha);
        if (afuera.length === 1) toast.info(`${afuera[0].autor} ${afuera[0].accion}`);
      }, a?.desde === "afuera" ? 300 : 2000);
    };
    const offHoja = conectarAvisosHoja(nombre, (a) => { if (a.fecha === fecha) refrescar(a); });
    // Un cambio en el tablero (obra que entra, sale o cambia de orden) cambia la hoja.
    const offTablero = conectarAvisos(nombre, () => refrescar(null));
    return () => {
      offHoja();
      offTablero();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc, nombre, fecha]);
}

/**
 * El andamiaje de todos los gestos: manda, refresca el día, avisa a los demás y muestra el
 * texto con "Deshacer" (si el gesto lo tiene).
 */
function useGesto<B>(url: string, fecha: string | null, opts: { aviso?: boolean } = {}) {
  const qc = useQueryClient();
  const deshacer = useDeshacer(fecha);
  return useMutation({
    mutationFn: (body: B) => post<Resultado>(url, body),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: CLAVE_HOJA });
      if (fecha) avisarCambioHoja(fecha, r.texto);
      if (opts.aviso !== false) {
        toast(r.texto, r.historialId ? { action: { label: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) }, duration: 9000 } : undefined);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useAccionHoja = (fecha: string | null) => useGesto<AccionHoja>("/api/hoja-dia", fecha);
export const useAccionViaje = (fecha: string | null) => useGesto<AccionViaje>("/api/hoja-dia/viajes", fecha);
export const useAccionPedido = (fecha: string | null) => useGesto<AccionPedido>("/api/hoja-dia/pedidos", fecha);
export const useAccionAusencia = (fecha: string | null) => useGesto<AccionAusencia & { fechaVista?: string }>("/api/hoja-dia/ausencias", fecha);
export const usePrecarga = (fecha: string | null) => useGesto<{ fecha: string; modo: "hoy" | "plantel" | "vacio" }>("/api/hoja-dia/precarga", fecha, { aviso: false });
export const useAccionPersona = (fecha: string | null) =>
  useGesto<{ accion: "celular"; personaId: string; telefono: string } | { accion: "puede_estar_a_cargo"; personaId: string; valor: boolean }>("/api/hoja-dia/personas", fecha);
export const useAccionLugar = (fecha: string | null) => useGesto<Record<string, unknown> & { accion: "crear" | "editar" }>("/api/hoja-dia/lugares", fecha);

export function useDeshacer(fecha: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (historialId: string) => post<{ ok: true; texto: string }>("/api/hoja-dia/deshacer", { historialId }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: CLAVE_HOJA });
      if (fecha) avisarCambioHoja(fecha, "deshizo un cambio");
      toast(r.texto);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** La lista de envío (crea los links que falten). */
export function useEnvios(fecha: string | null, abierta: boolean) {
  return useQuery({
    queryKey: [...CLAVE_HOJA, "envios", fecha],
    queryFn: () => pedir<{ filas: Preparado[] }>(`/api/hoja-dia/envios?fecha=${fecha}`),
    enabled: !!fecha && abierta,
    staleTime: 0,
  });
}

export type AccionEnvio =
  | { accion: "preparar" | "no_hace_falta" | "anular_link"; fecha: string; personaId: string }
  | { accion: "enviar" | "reenviar"; fecha: string; personaId: string; canal: "telegram" | "manual" }
  | { accion: "enviar_todos"; fecha: string }
  | { accion: "avisar_operario"; fecha: string; personaId: string; canal: "telegram" | "manual" | "no_hace_falta" }
  | { accion: "avisar_deposito"; fecha: string; viajeId: string; canal: "telegram" | "manual" }
  | { accion: "avisar_capataz"; fecha: string; pedidoId: string; canal: "telegram" | "manual" };

/** Mandar y avisar. Si Telegram falla, el resultado trae `waLink` para el camino manual. */
export function useEnviar(fecha: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AccionEnvio) => post<Resultado & { enviado?: boolean; waLink?: string | null; mensaje?: string }>("/api/hoja-dia/envios", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_HOJA });
      if (fecha) avisarCambioHoja(fecha, "mandó hojas");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTelegram() {
  return useQuery({ queryKey: [...CLAVE_HOJA, "telegram"], queryFn: () => pedir<EstadoTelegram>("/api/hoja-dia/telegram"), staleTime: 60_000 });
}
export function useVincularTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { accion: "vincular" | "desvincular"; personaId: string }) => post<{ ok: true; link?: string; waLink?: string | null; texto: string }>("/api/hoja-dia/telegram", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE_HOJA }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useHistorialHoja(params: { fecha?: string; hojaId?: string; viajeId?: string; pedidoId?: string } | null) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString() : "";
  return useQuery({
    queryKey: [...CLAVE_HOJA, "historial", qs],
    queryFn: () => pedir<{ historial: { id: string; at: string; accion: string; texto: string; por_texto: string | null; origen: string; deshecho_at: string | null }[] }>(`/api/hoja-dia/historial?${qs}`),
    enabled: !!params,
  });
}

/** La precarga de "Cerrar jornada" (sin hoja, `hayHoja: false`). */
export function usePrecargaCierre(cuadrillaOdooId: number | null, fecha: string | null, otId: number | null) {
  return useQuery({
    queryKey: [...CLAVE_HOJA, "cierre", cuadrillaOdooId, fecha, otId],
    queryFn: () => pedir<PrecargaCierre>(`/api/hoja-dia/cierre?cuadrilla=${cuadrillaOdooId}&fecha=${fecha}${otId ? `&ot=${otId}` : ""}`),
    enabled: !!cuadrillaOdooId && !!fecha,
    staleTime: 60_000,
    retry: false,
  });
}
