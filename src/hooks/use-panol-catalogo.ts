"use client";

// Pañol, la oficina: el catálogo (artículos, talles, herramientas numeradas), el historial
// filtrado y el consumo. Lo compartido con el kiosco (leer el catálogo entero, registrar un
// vale, anular) está en use-panol.ts; esto suma lo que sólo hace la oficina.
//
// EL CATÁLOGO SE EDITA DIRECTO POR TABLA (la RLS deja a los encargados); lo que MUEVE cosas
// —ingresos, gestiones de una herramienta, altas de unidades— va por las RPC, que son las
// que garantizan que el historial cierre. `ultimo_costo`, `lugar` y `estado` no tienen
// permiso de UPDATE: los escribe el trigger.

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_PANOL, nombreCompleto, rpc, useCatalogoPanol, useInvalidarPanol, usePersonasPanol,
} from "@/hooks/use-panol";
import { leerLugar } from "@/lib/panol/estado";
import type { ResumenConsumo, PorConsumo } from "@/lib/panol/consumo";
import type { Articulo, Movimiento, TipoArticulo, TipoMovimiento, Ubicacion, Unidad } from "@/lib/panol/tipos";
import { rutaUbicacion } from "@/components/panol/oficina/catalogo/selector-ubicacion";

function falla(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ─── Nombres ────────────────────────────────────────────────────────────────

const LUGARES_FIJOS: Record<string, string> = {
  taller: "Taller externo",
  faltante: "Faltante",
  perdida: "Perdida/Robada",
  baja: "Baja",
  proveedor: "Proveedor",
  consumo: "Consumo",
  alta: "Alta",
  ajuste: "Ajuste",
};

/**
 * `lugar` → un nombre que se lee: "Pañol › E3 › Cajón 4", "Diego Acosta", "Cuadrilla 3 ·
 * Sergio Ruiz", "OT 4812". Las OT quedan con el número: el nombre de la obra está en Odoo y
 * no vale un viaje por fila.
 */
export function useNombreLugar() {
  const cat = useCatalogoPanol();
  const per = usePersonasPanol();
  return useCallback(
    (lugar: string | null | undefined): string => {
      if (!lugar) return "—";
      const l = leerLugar(lugar);
      if (!l) return lugar;
      switch (l.clase) {
        case "ubicacion":
          return rutaUbicacion(cat.data?.ubicaciones ?? [], l.id) ?? "Ubicación borrada";
        case "persona":
        case "externa": {
          const p = per.data?.personas.find((x) => x.tipo === l.clase && x.id === l.id);
          return p ? nombreCompleto(p) : l.clase === "externa" ? "Persona externa" : "Persona";
        }
        case "cuadrilla": {
          const c = per.data?.cuadrillas.find((x) => x.id === l.id);
          if (!c) return "Cuadrilla";
          const capataz = c.responsableId ? per.data?.personas.find((x) => x.tipo === "persona" && x.id === c.responsableId) : null;
          return capataz ? `${c.nombre} · ${nombreCompleto(capataz)}` : c.nombre;
        }
        case "obra":
          return `OT ${l.ot}`;
        case "fuente":
          return LUGARES_FIJOS[l.nombre];
        default:
          return LUGARES_FIJOS[l.clase] ?? lugar;
      }
    },
    [cat.data, per.data],
  );
}

/** Persona que firmó un movimiento. */
export function useNombreQuien() {
  const per = usePersonasPanol();
  return useCallback(
    (tipo: string | null, id: string | null) => {
      if (!id) return "—";
      const p = per.data?.personas.find((x) => x.tipo === (tipo ?? "persona") && x.id === id);
      return p ? nombreCompleto(p) : "—";
    },
    [per.data],
  );
}

// ─── Movimientos con filtros ────────────────────────────────────────────────

export type FiltroMovimientos = {
  tipo?: TipoMovimiento | "";
  articuloId?: string;
  unidadId?: string;
  quien?: { tipo: "persona" | "externa"; id: string } | null;
  cuadrillaId?: string;
  ot?: number | null;
  /** YYYY-MM-DD, fecha de Buenos Aires, inclusive. */
  desde?: string;
  hasta?: string;
  sinEncargado?: boolean;
  /** Desde esta fecha ISO (la ficha: últimas 8 semanas). */
  desdeISO?: string;
  /** Sólo los que tocan el consumo (las barras de la ficha). */
  soloConsumo?: boolean;
};

export type ValeResumen = { id: string; sin_encargado: boolean; proveedor: string | null; comprobante: string | null; nota: string | null; origen: string };
export type MovimientoFila = Movimiento & { vale: ValeResumen | null };

export type PaginaMovimientos = {
  filas: MovimientoFila[];
  total: number;
  /** ids de los movimientos de la página que tienen una anulación. */
  anulados: Set<string>;
};

function diaSiguiente(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function leerMovimientos(f: FiltroMovimientos, pagina = 0, porPagina = 50): Promise<PaginaMovimientos> {
  const db = createClient();
  // El embed con !inner sólo cuando se filtra por el vale: si no, un movimiento sin vale
  // (no debería haber, pero el esquema lo permite) desaparecería de la lista.
  const embed = f.sinEncargado
    ? "vale:pan_vales!inner(id, sin_encargado, proveedor, comprobante, nota, origen)"
    : "vale:pan_vales(id, sin_encargado, proveedor, comprobante, nota, origen)";
  let q = db.from("pan_movimientos").select(`*, ${embed}`, { count: "exact" }).order("created_at", { ascending: false });
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.articuloId) q = q.eq("articulo_id", f.articuloId);
  if (f.unidadId) q = q.eq("unidad_id", f.unidadId);
  if (f.quien) q = q.eq("quien_tipo", f.quien.tipo).eq("quien_id", f.quien.id);
  if (f.cuadrillaId) q = q.eq("cuadrilla_id", f.cuadrillaId);
  if (f.ot) q = q.eq("odoo_ot_id", f.ot);
  if (f.desde) q = q.gte("created_at", `${f.desde}T00:00:00-03:00`);
  if (f.hasta) q = q.lt("created_at", `${diaSiguiente(f.hasta)}T00:00:00-03:00`);
  if (f.desdeISO) q = q.gte("created_at", f.desdeISO);
  if (f.sinEncargado) q = q.eq("vale.sin_encargado", true);
  if (f.soloConsumo) q = q.or("hacia.eq.consumo,desde.eq.consumo");
  const { data, error, count } = await q.range(pagina * porPagina, pagina * porPagina + porPagina - 1);
  falla(error);
  const filas = (data ?? []) as MovimientoFila[];

  const ids = filas.filter((m) => m.tipo !== "anulacion").map((m) => m.id);
  const anulados = new Set<string>();
  if (ids.length) {
    const r = await db.from("pan_movimientos").select("anula_a").in("anula_a", ids);
    falla(r.error);
    for (const x of r.data ?? []) if (x.anula_a) anulados.add(x.anula_a as string);
  }
  return { filas: filas.map((m) => ({ ...m, cantidad: Number(m.cantidad) })), total: count ?? filas.length, anulados };
}

export function useMovimientosFiltrados(f: FiltroMovimientos, pagina = 0, porPagina = 50) {
  return useQuery({
    queryKey: ["panol", "movimientos-filtrados", f, pagina, porPagina],
    queryFn: () => leerMovimientos(f, pagina, porPagina),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

// ─── Artículos y talles ─────────────────────────────────────────────────────

export type NuevoArticulo = {
  nombre: string;
  tipo: TipoArticulo;
  seguridad_critica: boolean;
  tiene_talles: boolean;
  unidad: string;
  minimo: number | null;
  reponer_hasta: number | null;
  ubicacion_id: string | null;
  talles: string[];
};

export function useCrearArticulo() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (a: NuevoArticulo) => {
      const db = createClient();
      const { talles, ...fila } = a;
      const { data, error } = await db.from("pan_articulos").insert(fila).select("*").single();
      falla(error);
      const articulo = data as Articulo;
      if (a.tiene_talles && talles.length) {
        const r = await db.from("pan_variantes").insert(talles.map((nombre, orden) => ({ articulo_id: articulo.id, nombre, orden })));
        falla(r.error);
      }
      return articulo;
    },
    onSuccess: invalidar,
  });
}

/**
 * "Me llevo algo que no está" → ya tiene alta: se marca resuelto con el artículo nuevo (la
 * bandeja deja de mostrarlo). Sólo esas tres columnas tienen permiso de UPDATE.
 */
export async function resolverSinAlta(sinAltaId: string, articuloId: string) {
  const db = createClient();
  const { data } = await db.auth.getUser();
  const { error } = await db.from("pan_sin_alta")
    .update({ resuelto_articulo_id: articuloId, resuelto_por: data.user?.id ?? null, resuelto_at: new Date().toISOString() })
    .eq("id", sinAltaId);
  falla(error);
}

export type CambiosArticulo = Partial<Pick<Articulo,
  "nombre" | "unidad" | "unidad_compra" | "factor_compra" | "minimo" | "reponer_hasta" | "ubicacion_id"
  | "proveedor" | "codigo_barras" | "foto_path" | "notas" | "activo" | "seguridad_critica" | "tiene_talles">>;

export function useGuardarArticulo() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: CambiosArticulo }) => {
      const { error } = await createClient().from("pan_articulos")
        .update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", id);
      // El código de barras es único: el mensaje de Postgres no le dice nada a nadie.
      if (error?.code === "23505") throw new Error("Ese código de barras ya está en otro artículo.");
      falla(error);
    },
    onSuccess: invalidar,
  });
}

export function useAgregarTalle() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async ({ articuloId, nombre, orden }: { articuloId: string; nombre: string; orden: number }) => {
      const { error } = await createClient().from("pan_variantes").insert({ articulo_id: articuloId, nombre, orden });
      if (error?.code === "23505") throw new Error(`El talle ${nombre} ya existe.`);
      falla(error);
    },
    onSuccess: invalidar,
  });
}

/** Un talle no se borra (tiene historial): se desactiva y deja de ofrecerse. */
export function useDesactivarTalle() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async (varianteId: string) => {
      const { error } = await createClient().from("pan_variantes").update({ activo: false }).eq("id", varianteId);
      falla(error);
    },
    onSuccess: invalidar,
  });
}

/** Sube la foto del artículo a panol/articulo/{id}/… y la deja como foto_path. */
export function useSubirFotoArticulo() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async ({ articuloId, archivo }: { articuloId: string; archivo: File }) => {
      const db = createClient();
      const ext = (archivo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `articulo/${articuloId}/${Date.now()}.${ext}`;
      const up = await db.storage.from(BUCKET_PANOL).upload(path, archivo, { contentType: archivo.type || undefined });
      falla(up.error);
      const { error } = await db.from("pan_articulos").update({ foto_path: path, updated_at: new Date().toISOString() }).eq("id", articuloId);
      falla(error);
      return path;
    },
    onSuccess: invalidar,
  });
}

/** El bucket es privado: la foto se ve con un link firmado de una hora. */
export function useFotoPanol(path: string | null | undefined) {
  return useQuery({
    queryKey: ["panol", "foto", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().storage.from(BUCKET_PANOL).createSignedUrl(path!, 3600);
      falla(error);
      return data?.signedUrl ?? null;
    },
  });
}

// ─── Herramientas con número ────────────────────────────────────────────────

/** Sólo las columnas de ficha: lugar, estado y demás las escribe el historial. */
export type CambiosUnidad = Partial<Pick<Unidad,
  "serie" | "marca_modelo" | "fecha_compra" | "costo" | "ubicacion_id" | "proxima_inspeccion" | "notas">>;

export function useGuardarUnidad() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: CambiosUnidad }) => {
      const { error } = await createClient().from("pan_unidades").update(cambios).eq("id", id);
      falla(error);
    },
    onSuccess: invalidar,
  });
}

export type AltaUnidades = {
  articuloId: string;
  cantidad: number;
  prefijo: string;
  series: (string | null)[];
  marcaModelo?: string;
  fechaCompra?: string;
  costo?: number | null;
  ubicacionId?: string | null;
  proximaInspeccion?: string;
  proveedor?: string;
  comprobante?: string;
};

export type ResultadoAlta = { valeId: string; unidades: { id: string; numero: string; codigo: string }[] };

export function useAltaUnidades() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: (p: AltaUnidades) => rpc<ResultadoAlta>("pan_alta_unidades", { p }),
    onSuccess: invalidar,
  });
}

/** El código activo de una unidad (o de lo que sea). null si todavía no tiene. */
export function useCodigoActivo(tipo: "unidad" | "ubicacion", entidadId: string | undefined) {
  return useQuery({
    queryKey: ["panol", "codigo", tipo, entidadId],
    enabled: !!entidadId,
    queryFn: async () => {
      const { data, error } = await createClient().from("pan_codigos")
        .select("codigo, impreso_at, created_at").eq("tipo", tipo).eq("entidad_id", entidadId!).eq("activo", true).maybeSingle();
      falla(error);
      return (data ?? null) as { codigo: string; impreso_at: string | null; created_at: string } | null;
    },
  });
}

/** Reimprimir anula el código viejo y crea otro (pan_codigo con reimprimir). */
export function useNuevoCodigo() {
  const invalidar = useInvalidarPanol();
  return useMutation({
    mutationFn: ({ tipo, entidadId, reimprimir }: { tipo: "unidad" | "ubicacion"; entidadId: string; reimprimir: boolean }) =>
      rpc<string>("pan_codigo", { p_tipo: tipo, p_entidad: entidadId, p_reimprimir: reimprimir }),
    onSuccess: invalidar,
  });
}

// ─── Consumo ────────────────────────────────────────────────────────────────

export type RespuestaConsumo = ResumenConsumo & {
  por: PorConsumo;
  desde: string;
  hasta: string;
  nombres: Record<string, string>;
  odooError: string | null;
};

export function useConsumoPanol(f: { por: PorConsumo; desde: string; hasta: string }) {
  return useQuery({
    queryKey: ["panol", "consumo", f],
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/panol/consumo?por=${f.por}&desde=${f.desde}&hasta=${f.hasta}`);
      const body = (await res.json().catch(() => null)) as (RespuestaConsumo & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `Error ${res.status}`);
      return body;
    },
  });
}

// ─── Utilidades de pantalla ─────────────────────────────────────────────────

/** Los ids de una ubicación y todo lo que cuelga de ella. */
export function useSubarbol(ubicaciones: readonly Ubicacion[], raiz: string | null | undefined) {
  return useMemo(() => {
    if (!raiz) return null;
    const hijos = new Map<string, string[]>();
    for (const u of ubicaciones) if (u.padre_id) hijos.set(u.padre_id, [...(hijos.get(u.padre_id) ?? []), u.id]);
    const s = new Set<string>();
    const pila = [raiz];
    while (pila.length) {
      const id = pila.pop()!;
      if (s.has(id)) continue;
      s.add(id);
      pila.push(...(hijos.get(id) ?? []));
    }
    return s;
  }, [ubicaciones, raiz]);
}

export const formatoPesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const formatoCantidad = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
