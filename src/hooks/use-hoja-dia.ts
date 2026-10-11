"use client";

// Acceso a la Hoja del día desde las pantallas. Todo pasa por /api/hoja-dia/* (que lee
// Odoo y Supabase del lado del servidor); las cuentas las hace src/lib/hoja-dia/estado.ts
// en el navegador con el `DiaHoja` que devuelve el GET y la hora (`useAhora`).
//
// LOS GESTOS DE LAS TARJETAS SON OPTIMISTAS (10/10, "tarda mucho"): agregar, sacar, pasar,
// a cargo, contratistas, chofer, modo, vehículo, horas, encuentro, notas e instrucciones se
// ven AL INSTANTE (optimista.ts, con las mismas reglas de estado.ts) y el servidor confirma
// con el toast de siempre ("Ramírez pasó a la 3" + Deshacer). Si el servidor dice que no,
// la tarjeta vuelve a como estaba y sale el error. Después de confirmar, el día se vuelve a
// pedir EN SEGUNDO PLANO, una sola vez por ráfaga (refrescarHoja): así lo que calculó el
// servidor (ids, textos, viajes) reemplaza a lo adivinado. Los viajes, pedidos, envíos y la
// precarga no se adivinan: esperan al servidor y refrescan igual, en segundo plano.
//
// EN VIVO: escucha el canal de la hoja (otro coordinador, el capataz que tocó Recibido, el
// chofer que marcó Hecho) Y el del tablero (mover una obra cambia la hoja). Agrupa las
// ráfagas como use-avisos-tablero, y al volver a la pestaña refresca igual.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import type { AccionAusencia, AccionContratista, AccionHoja, AccionPedido, AccionViaje, Resultado } from "@/lib/hoja-dia/acciones";
import type { ResumenMesContratistas } from "@/lib/hoja-dia/contratistas-servidor";
import type { Preparado, EstadoTelegram } from "@/lib/hoja-dia/envios";
import type { PrecargaCierre } from "@/lib/hoja-dia/servicio";
import { minutosDesde } from "@/lib/hoja-dia/estado";
import { aplicarOptimista } from "@/lib/hoja-dia/optimista";
import { avisarCambioHoja, conectarAvisosHoja, type AvisoHoja } from "@/lib/hoja-dia/avisos";
import { conectarAvisos } from "@/lib/tablero/avisos";
import { useUser } from "@/hooks/use-user";

export const CLAVE_HOJA = ["hoja-dia"] as const;
export const claveDia = (fecha: string) => [...CLAVE_HOJA, "dia", fecha] as const;
/** Todas las mutaciones de la hoja llevan esta clave: el refresco espera a que no quede ninguna. */
const GESTO = [...CLAVE_HOJA, "gesto"] as const;

// Los días que la próxima lectura tiene que pedir con Odoo fresco (llegó el aviso del
// tablero: se movió una obra). El resto sale del caché del servidor (~0,7 s en vez de ~2,5 s).
const frescos = new Set<string>();

// El refresco en segundo plano: uno por ráfaga, y nunca con un gesto en vuelo (pisaría lo
// que se ve al instante con un día que todavía no lo tiene).
let timerRefresco: ReturnType<typeof setTimeout> | null = null;
export function refrescarHoja(qc: QueryClient, ms = 500): void {
  if (timerRefresco) clearTimeout(timerRefresco);
  timerRefresco = setTimeout(() => {
    timerRefresco = null;
    if (qc.isMutating({ mutationKey: GESTO }) > 0) return refrescarHoja(qc, Math.max(ms, 150));
    void qc.invalidateQueries({ queryKey: CLAVE_HOJA });
  }, ms);
}

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
    queryFn: () => pedir<DiaHoja>(`/api/hoja-dia?fecha=${fecha}${fecha && frescos.delete(fecha) ? "&fresco=1" : ""}`),
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
        refrescarHoja(qc, 0);
        const afuera = lote.filter((x) => x.desde === "afuera" && x.fecha === fecha);
        if (afuera.length === 1) toast.info(`${afuera[0].autor} ${afuera[0].accion}`);
      }, a?.desde === "afuera" ? 300 : 2000);
    };
    const offHoja = conectarAvisosHoja(nombre, (a) => { if (a.fecha === fecha) refrescar(a); });
    // Un cambio en el tablero (obra que entra, sale o cambia de orden) cambia la hoja.
    // Ese refresco pide el tablero fresco a Odoo (el resto de las veces sale del caché).
    const offTablero = conectarAvisos(nombre, () => {
      frescos.add(fecha);
      refrescar(null);
    });
    return () => {
      offHoja();
      offTablero();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc, nombre, fecha]);
}

type Optimista<B> = (dia: DiaHoja, body: B) => DiaHoja | null;
type Previo = { prev: DiaHoja | undefined; puesto: DiaHoja | null } | undefined;

/**
 * El andamiaje de todos los gestos: (si se puede) lo muestra al instante, manda, avisa a los
 * demás, muestra el texto con "Deshacer" (si el gesto lo tiene) y refresca el día en segundo
 * plano.
 */
function useGesto<B>(url: string, fecha: string | null, opts: { aviso?: boolean; optimista?: Optimista<B> } = {}) {
  const qc = useQueryClient();
  const deshacer = useDeshacer(fecha);
  return useMutation<Resultado, Error, B, Previo>({
    mutationKey: GESTO,
    mutationFn: (body: B) => post<Resultado>(url, body),
    onMutate: async (body) => {
      if (!fecha || !opts.optimista) return undefined;
      const clave = claveDia(fecha);
      // Una lectura en vuelo traería el día SIN este gesto y lo taparía.
      await qc.cancelQueries({ queryKey: clave });
      const prev = qc.getQueryData<DiaHoja>(clave);
      const puesto = prev ? opts.optimista(prev, body) : null;
      if (puesto) qc.setQueryData(clave, puesto);
      return { prev, puesto };
    },
    onSuccess: (r) => {
      if (fecha) avisarCambioHoja(fecha, r.texto);
      if (opts.aviso !== false) {
        toast(r.texto, r.historialId ? { action: { label: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) }, duration: 9000 } : undefined);
      }
    },
    onError: (e, _body, ctx) => {
      // Volver atrás lo adivinado, si nadie lo cambió después (otro gesto encima): si no, el
      // refresco trae lo que de verdad hay.
      if (fecha && ctx?.puesto && qc.getQueryData(claveDia(fecha)) === ctx.puesto) qc.setQueryData(claveDia(fecha), ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => refrescarHoja(qc, 500),
  });
}

export const useAccionHoja = (fecha: string | null) => useGesto<AccionHoja>("/api/hoja-dia", fecha, { optimista: (dia, a) => aplicarOptimista(dia, a) });
/**
 * `{ aviso: false }`: el gesto no muestra su toast (lo arma la pantalla, p. ej. con "Avisar a
 * Gómez" al lado de "Deshacer"). Por defecto, el toast con Deshacer de siempre.
 */
export const useAccionViaje = (fecha: string | null, opts?: { aviso?: boolean }) => useGesto<AccionViaje>("/api/hoja-dia/viajes", fecha, opts);
export const useAccionPedido = (fecha: string | null, opts?: { aviso?: boolean }) => useGesto<AccionPedido>("/api/hoja-dia/pedidos", fecha, opts);
export const useAccionAusencia = (fecha: string | null) => useGesto<AccionAusencia & { fechaVista?: string }>("/api/hoja-dia/ausencias", fecha);
export const usePrecarga = (fecha: string | null) => useGesto<{ fecha: string; modo: "hoy" | "plantel" | "vacio" }>("/api/hoja-dia/precarga", fecha, { aviso: false });
export const useAccionPersona = (fecha: string | null) =>
  useGesto<{ accion: "celular"; personaId: string; telefono: string } | { accion: "puede_estar_a_cargo"; personaId: string; valor: boolean }>("/api/hoja-dia/personas", fecha);
export const useAccionLugar = (fecha: string | null) => useGesto<Record<string, unknown> & { accion: "crear" | "editar" }>("/api/hoja-dia/lugares", fecha);
/** Alta, edición y baja de contratistas (la lista viene con el día). */
export const useAccionContratista = (fecha: string | null) => useGesto<AccionContratista>("/api/hoja-dia/contratistas", fecha);

/** El resumen del mes por contratista ("Contratistas · octubre"). `mes` en YYYY-MM. */
export function useResumenContratistas(mes: string | null) {
  return useQuery({
    queryKey: [...CLAVE_HOJA, "contratistas", mes],
    queryFn: () => pedir<ResumenMesContratistas>(`/api/hoja-dia/contratistas?mes=${mes}`),
    enabled: !!mes,
    staleTime: 60_000,
  });
}

export function useDeshacer(fecha: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: GESTO,
    mutationFn: (historialId: string) => post<{ ok: true; texto: string }>("/api/hoja-dia/deshacer", { historialId }),
    onSuccess: (r) => {
      refrescarHoja(qc, 0);
      if (fecha) avisarCambioHoja(fecha, "deshizo un cambio");
      toast(r.texto);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** La lista de envío (sólo lee: los links se crean al mandar). */
export function useEnvios(fecha: string | null, abierta: boolean) {
  return useQuery({
    queryKey: [...CLAVE_HOJA, "envios", fecha],
    queryFn: () => pedir<{ filas: Preparado[] }>(`/api/hoja-dia/envios?fecha=${fecha}`),
    enabled: !!fecha && abierta,
    staleTime: 10_000,
  });
}

export type AccionEnvio =
  | { accion: "preparar" | "no_hace_falta" | "anular_link"; fecha: string; personaId: string }
  | { accion: "enviar" | "reenviar"; fecha: string; personaId: string; canal: "telegram" | "manual" }
  | { accion: "enviar_todos"; fecha: string }
  | { accion: "avisar_operario"; fecha: string; personaId: string; canal: "telegram" | "manual" | "no_hace_falta" }
  | { accion: "avisar_deposito"; fecha: string; viajeId: string; canal: "telegram" | "manual" }
  | { accion: "avisar_capataz"; fecha: string; pedidoId: string; canal: "telegram" | "manual" }
  | { accion: "avisar_mensaje"; fecha: string; tipo: "sacar_rato" | "tarde" | "vuelven_solos" | "lista_carga"; viajeId?: string | null; cuadrilla?: number | null; canal?: "telegram" | "manual" | "auto" };

/** Mandar y avisar. Si Telegram falla, el resultado trae `waLink` para el camino manual. */
export function useEnviar(fecha: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AccionEnvio) => post<Resultado & { enviado?: boolean; waLink?: string | null; mensaje?: string; para?: string; canal?: "telegram" | "manual" }>("/api/hoja-dia/envios", body),
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
