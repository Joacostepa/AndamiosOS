"use client";

// Lo que el kiosco del pañol lee y escribe además de lo compartido (use-panol.ts): la
// planificación de hoy (para proponer obra), la tabla de códigos (para resolver un
// escaneo sin ir a la red), la señal, los vales guardados sin conexión y las fotos.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_PANOL, deshacerVale, nombreCompleto, registrarVale, resolverCodigo, useCatalogoPanol, useInvalidarPanol, usePersonasPanol,
} from "@/hooks/use-panol";
import { esErrorDeRed, resolverLocal, type CatalogoKiosco, type CodigoLocal } from "@/lib/panol/kiosco";
import { leerLugar, leerRechazo, type Rechazo } from "@/lib/panol/estado";
import type { CodigoResuelto, Movimiento, PersonaTipo, ResultadoVale, Vale } from "@/lib/panol/tipos";
import type { HoyKiosco, OtKiosco } from "@/app/api/panol/kiosco/hoy/route";

export type { HoyKiosco, OtKiosco };

// ─── Planificación de hoy ───────────────────────────────────────────────────

export function useHoyKiosco() {
  return useQuery({
    queryKey: ["panol", "kiosco", "hoy"],
    queryFn: async (): Promise<HoyKiosco> => {
      const res = await fetch("/api/panol/kiosco/hoy");
      const body = (await res.json().catch(() => null)) as (HoyKiosco & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `Error ${res.status}`);
      return body;
    },
    staleTime: 15 * 60_000,
    retry: 1,
  });
}

// ─── Códigos ────────────────────────────────────────────────────────────────

/** Todos los códigos (también los anulados: el kiosco tiene que poder decir "esa etiqueta es vieja"). */
export function useCodigosPanol() {
  return useQuery({
    queryKey: ["panol", "kiosco", "codigos"],
    queryFn: async () => {
      const { data, error } = await createClient().from("pan_codigos").select("codigo, tipo, entidad_id, activo");
      if (error) throw new Error(error.message);
      return (data ?? []) as CodigoLocal[];
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

// ─── Todo junto ─────────────────────────────────────────────────────────────

/**
 * Lo que cada pantalla del kiosco necesita, ya cruzado. Los nombres de personas pueden no
 * llegar (si el usuario del kiosco no lee Legajos): por eso todo nombre tiene un "otra
 * persona" de respaldo y nunca bloquea un flujo.
 */
export function useDatosKiosco() {
  const catalogo = useCatalogoPanol();
  const personas = usePersonasPanol();
  const hoy = useHoyKiosco();
  const codigos = useCodigosPanol();

  const valor = useMemo(() => {
    const cat: CatalogoKiosco = catalogo.data ?? { ubicaciones: [], articulos: [], variantes: [], unidades: [], saldos: [] };
    const personasPorLugar = new Map<string, string>();
    for (const p of personas.data?.personas ?? []) personasPorLugar.set(`${p.tipo === "externa" ? "x" : "p"}:${p.id}`, nombreCompleto(p));
    const cuadrillas = personas.data?.cuadrillas ?? [];
    const nombrePersona = (id: string | null | undefined) => (id ? personasPorLugar.get(`p:${id}`) ?? null : null);
    const ots = new Map<number, OtKiosco>((hoy.data?.ots ?? []).map((o) => [o.id, o]));

    const tituloOt = (id: number | null | undefined) => {
      if (!id) return "Sin obra · Taller/Depósito";
      return ots.get(id)?.titulo ?? `OT ${id}`;
    };
    const cortoOt = (id: number | null | undefined) => {
      if (!id) return "Taller/Depósito";
      const t = ots.get(id)?.titulo;
      // "OT 4812 · Av. Corrientes" → "OT 4812"; si el título no empieza así, el número.
      const m = t ? /^(OT\s*\S+)/i.exec(t) : null;
      return m ? m[1] : `OT ${id}`;
    };
    const nombreDeLugar = (lugar: string): string => {
      const l = leerLugar(lugar);
      if (!l) return lugar;
      switch (l.clase) {
        case "persona":
        case "externa":
          return personasPorLugar.get(lugar) ?? "otra persona";
        case "cuadrilla":
          return cuadrillas.find((c) => c.id === l.id)?.nombre ?? "una cuadrilla";
        case "obra":
          return tituloOt(l.ot);
        case "ubicacion":
          return cat.ubicaciones.find((u) => u.id === l.id)?.nombre ?? "el pañol";
        case "taller":
          return "el taller";
        case "faltante":
          return "faltantes";
        case "perdida":
          return "perdidas";
        case "baja":
          return "bajas";
        default:
          return lugar;
      }
    };
    const otHoyDeCuadrilla = (cuadrillaId: string | null | undefined) =>
      cuadrillaId ? hoy.data?.cuadrillas.find((c) => c.cuadrillaId === cuadrillaId)?.otId ?? null : null;

    return { cat, cuadrillas, ots: hoy.data?.ots ?? [], cuadrillasHoy: hoy.data?.cuadrillas ?? [], codigos: codigos.data ?? [],
      nombreDeLugar, nombrePersona, tituloOt, cortoOt, otHoyDeCuadrilla };
  }, [catalogo.data, personas.data, hoy.data, codigos.data]);

  return { ...valor, cargando: catalogo.isLoading, error: catalogo.error as Error | null };
}

export type DatosKiosco = ReturnType<typeof useDatosKiosco>;

/**
 * Un escaneo → qué es. Primero con lo que ya está en memoria (instantáneo y sin señal);
 * si no lo conoce, le pregunta a la base, que puede saber de un alta recién hecha.
 */
export async function resolverEscaneo(texto: string, datos: Pick<DatosKiosco, "codigos" | "cat">): Promise<CodigoResuelto> {
  const local = resolverLocal(texto, datos.codigos, datos.cat.articulos);
  if (local) return local;
  return resolverCodigo(texto);
}

// ─── Señal ──────────────────────────────────────────────────────────────────

function suscribirSenal(f: () => void) {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => {
    window.removeEventListener("online", f);
    window.removeEventListener("offline", f);
  };
}

export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribirSenal, () => navigator.onLine, () => true);
}

// ─── Vales guardados sin conexión ───────────────────────────────────────────
//
// Fase 1 necesita señal (docs §9), pero si se corta con un vale armado no se pierde: queda
// en este equipo y se manda solo cuando vuelve. `clientUuid` hace que reintentarlo no lo
// duplique. Lo que la base RECHAZA al reintentar (p. ej. el token de 15 minutos venció)
// no se reintenta más: queda a la vista para que alguien lo cargue de nuevo.

export type Pendiente = { vale: Vale; resumen: string; quien: string; guardadoAt: string; rechazo?: string };

const CLAVE_PENDIENTES = "panol:kiosco:pendientes";
const oyentesPendientes = new Set<() => void>();
let cachePendientes: Pendiente[] | null = null;

function leerPendientes(): Pendiente[] {
  if (cachePendientes) return cachePendientes;
  try {
    cachePendientes = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) ?? "[]") as Pendiente[];
  } catch {
    cachePendientes = [];
  }
  return cachePendientes;
}

function escribirPendientes(lista: Pendiente[]) {
  cachePendientes = lista;
  try {
    localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista));
  } catch {
    // sin almacenamiento: vive mientras no se recargue la página
  }
  oyentesPendientes.forEach((f) => f());
}

const SIN_PENDIENTES: Pendiente[] = [];

export function usePendientes(): Pendiente[] {
  return useSyncExternalStore(
    (f) => {
      oyentesPendientes.add(f);
      return () => {
        oyentesPendientes.delete(f);
      };
    },
    leerPendientes,
    () => SIN_PENDIENTES,
  );
}

export function guardarPendiente(p: Omit<Pendiente, "guardadoAt">) {
  const lista = leerPendientes().filter((x) => x.vale.clientUuid !== p.vale.clientUuid);
  escribirPendientes([...lista, { ...p, guardadoAt: new Date().toISOString() }]);
}

export function descartarPendiente(clientUuid: string) {
  escribirPendientes(leerPendientes().filter((x) => x.vale.clientUuid !== clientUuid));
}

let vaciando = false;
// Lo que el vaciado mandó (o está mandando) en esta pestaña: si alguien toca «Deshacer» en
// la pantalla verde justo cuando volvió la señal, el vale ya no está en la lista pero sí en
// la base, y hay que deshacerlo allá.
const enviados = new Map<string, Promise<string | null>>();

/** Manda lo guardado. Corre al volver la señal y cada 20 s mientras haya algo. */
export function useVaciarPendientes() {
  const enLinea = useEnLinea();
  const pendientes = usePendientes();
  const invalidar = useInvalidarPanol();
  const hay = pendientes.some((p) => !p.rechazo);

  const vaciar = useCallback(async () => {
    if (vaciando || !navigator.onLine) return;
    vaciando = true;
    let alguno = false;
    try {
      for (const p of leerPendientes().filter((x) => !x.rechazo)) {
        const envio = registrarVale(p.vale).then((r) => r.valeId);
        enviados.set(p.vale.clientUuid, envio.catch(() => null));
        try {
          await envio;
          descartarPendiente(p.vale.clientUuid);
          alguno = true;
        } catch (e) {
          enviados.delete(p.vale.clientUuid);
          if (esErrorDeRed(e)) break;
          const r = leerRechazo(e instanceof Error ? e.message : String(e));
          escribirPendientes(leerPendientes().map((x) => (x.vale.clientUuid === p.vale.clientUuid ? { ...x, rechazo: r.texto } : x)));
        }
      }
    } finally {
      vaciando = false;
      if (alguno) invalidar();
    }
  }, [invalidar]);

  useEffect(() => {
    if (!enLinea || !hay) return;
    void vaciar();
    const reloj = window.setInterval(() => void vaciar(), 20_000);
    return () => window.clearInterval(reloj);
  }, [enLinea, hay, vaciar]);
}

/**
 * «Deshacer» de un vale que quedó guardado sin señal: si todavía no salió, se saca de la
 * lista; si el vaciado ya lo mandó (o lo está mandando), se deshace en la base.
 */
export async function deshacerGuardado(clientUuid: string): Promise<void> {
  const envio = enviados.get(clientUuid);
  if (!envio) {
    descartarPendiente(clientUuid);
    return;
  }
  const valeId = await envio;
  descartarPendiente(clientUuid);
  if (valeId) await deshacerVale(valeId);
}

export type Confirmado = { estado: "ok"; valeId: string } | { estado: "guardado" };

/**
 * Confirmar un vale desde el kiosco: con señal, a la base; sin señal (o si se cae en el
 * camino), queda guardado. Un RECHAZO de la base se tira como Error con el Rechazo
 * adentro, para que la pantalla conteste con lo que sigue (LA_TIENE → "¿te la pasó?").
 */
export class RechazoVale extends Error {
  constructor(public readonly rechazo: Rechazo, mensaje: string) {
    super(mensaje);
    this.name = "RechazoVale";
  }
}

export async function confirmarVale(vale: Vale, info: { resumen: string; quien: string }, nombreDe?: (lugar: string) => string): Promise<Confirmado> {
  if (!navigator.onLine) {
    guardarPendiente({ vale, ...info });
    return { estado: "guardado" };
  }
  try {
    const r: ResultadoVale = await registrarVale(vale);
    return { estado: "ok", valeId: r.valeId };
  } catch (e) {
    if (esErrorDeRed(e)) {
      guardarPendiente({ vale, ...info });
      return { estado: "guardado" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new RechazoVale(leerRechazo(msg, nombreDe), msg);
  }
}

// ─── La última obra de cada persona (en este equipo) ────────────────────────

const claveObra = (tipo: PersonaTipo, id: string) => `panol:kiosco:obra:${tipo}:${id}`;

/** null = nunca eligió; 0 = eligió "Sin obra". */
export function ultimaObra(tipo: PersonaTipo, id: string): number | null {
  try {
    const v = localStorage.getItem(claveObra(tipo, id));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function guardarUltimaObra(tipo: PersonaTipo, id: string, ot: number | null) {
  try {
    localStorage.setItem(claveObra(tipo, id), String(ot ?? 0));
  } catch {
    // nada
  }
}

// ─── Historial puntual ──────────────────────────────────────────────────────

/** Los últimos retiros de un artículo por una persona: de ahí sale "¿de qué obra vuelve?". */
export function useRetirosDe(articuloId: string | null, quienId: string | null) {
  return useQuery({
    queryKey: ["panol", "kiosco", "retiros", articuloId, quienId],
    enabled: !!articuloId && !!quienId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("pan_movimientos")
        .select("odoo_ot_id, created_at")
        .eq("articulo_id", articuloId!)
        .eq("quien_id", quienId!)
        .eq("tipo", "retiro")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []).map((m) => ({ odoo_ot_id: m.odoo_ot_id === null ? null : Number(m.odoo_ot_id), created_at: m.created_at as string }));
    },
  });
}

/** Cómo salió cada herramienta con la cuadrilla (el control de salida), para compararlo a la vuelta. */
export function useSalidasDe(unidadIds: string[], cuadrillaId: string | null) {
  const clave = [...unidadIds].sort().join(",");
  return useQuery({
    queryKey: ["panol", "kiosco", "salidas", cuadrillaId, clave],
    enabled: !!cuadrillaId && unidadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("pan_movimientos")
        .select("unidad_id, estado_vuelta, motivo, created_at, hacia")
        .in("unidad_id", unidadIds)
        .eq("hacia", `c:${cuadrillaId}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const ultima = new Map<string, Pick<Movimiento, "estado_vuelta" | "motivo" | "created_at">>();
      for (const m of data ?? []) if (m.unidad_id && !ultima.has(m.unidad_id)) ultima.set(m.unidad_id, m);
      return ultima;
    },
  });
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

/** Achica la foto antes de subirla: el kiosco suele estar con datos del celular. */
async function achicar(archivo: File, lado = 1600): Promise<Blob> {
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    if (escala === 1 && archivo.size < 1_500_000) return archivo;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")?.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob>((ok) => lienzo.toBlob((b) => ok(b ?? archivo), "image/jpeg", 0.8));
  } catch {
    return archivo;
  }
}

/** Sube una foto al bucket del pañol: `{tipo}/{id}/{archivo}`. Devuelve el path. */
export async function subirFotoPanol(archivo: File, tipo: "devolucion" | "sin-alta" | "salida" | "vuelta", id: string): Promise<string> {
  const blob = await achicar(archivo);
  const path = `${tipo}/${id}/${crypto.randomUUID()}.jpg`;
  const { error } = await createClient().storage.from(BUCKET_PANOL).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
