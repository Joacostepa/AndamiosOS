"use client";

// Pañol: lecturas y escrituras compartidas por el kiosco y la oficina.
//
// VA DIRECTO A SUPABASE, sin /api. Las reglas viven en la base: la RLS deja leer a quien
// tiene el pañol (o el kiosco) y TODA escritura que mueve cosas es una RPC SECURITY
// DEFINER que valida quién firma (ver la migración 20261010000001_panol.sql). Pasar por
// una ruta de Next sumaría un salto sin sumar una garantía, y en el kiosco cada salto se
// siente: la regla es menos de 10 segundos por retiro.
//
// Lo que necesita Odoo (nombres de OT, la planificación del día) sí va por /api/panol.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Articulo, CodigoResuelto, Identidad, Movimiento, Parametro, PersonaExterna, ResultadoVale,
  Saldo, Ubicacion, Unidad, Vale, Variante,
} from "@/lib/panol/tipos";

export const BUCKET_PANOL = "panol";

/** Un error de la RPC → Error con el mensaje de Postgres (los códigos LA_TIENE:… viajan ahí). */
function falla(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message);
}

export async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().rpc(nombre, args);
  falla(error);
  return data as T;
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

export type Catalogo = {
  ubicaciones: Ubicacion[];
  articulos: Articulo[];
  variantes: Variante[];
  unidades: Unidad[];
  saldos: Saldo[];
};

/**
 * Todo el catálogo en una sola lectura. Es chico (cientos de filas, no miles) y el kiosco
 * lo necesita entero para que un escaneo se resuelva sin ir a la red.
 */
export async function leerCatalogo(): Promise<Catalogo> {
  const db = createClient();
  const [u, a, v, un, s] = await Promise.all([
    db.from("pan_ubicaciones").select("*").eq("activo", true).order("orden"),
    db.from("pan_articulos").select("*").order("nombre"),
    db.from("pan_variantes").select("*").eq("activo", true).order("orden"),
    db.from("pan_unidades").select("*").order("numero"),
    db.from("pan_saldos").select("articulo_id, variante_id, lugar, cantidad").neq("cantidad", 0),
  ]);
  for (const r of [u, a, v, un, s]) falla(r.error);
  return {
    ubicaciones: (u.data ?? []) as Ubicacion[],
    articulos: (a.data ?? []) as Articulo[],
    variantes: (v.data ?? []) as Variante[],
    unidades: (un.data ?? []) as Unidad[],
    saldos: ((s.data ?? []) as Saldo[]).map((x) => ({ ...x, cantidad: Number(x.cantidad) })),
  };
}

export function useCatalogoPanol() {
  return useQuery({
    queryKey: ["panol", "catalogo"],
    queryFn: leerCatalogo,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

// ─── Personas y cuadrillas ──────────────────────────────────────────────────

export type PersonaPanol = {
  tipo: "persona" | "externa";
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  activo: boolean;
  /** Externas: la empresa. Legajos: el puesto. */
  detalle: string | null;
  cuadrillaId: string | null;
  userId: string | null;
};

export type CuadrillaPanol = { id: string; nombre: string; activo: boolean; responsableId: string | null };

export async function leerPersonas(): Promise<{ personas: PersonaPanol[]; cuadrillas: CuadrillaPanol[] }> {
  const db = createClient();
  const [p, x, c, cp] = await Promise.all([
    db.from("personal").select("id, nombre, apellido, telefono, activo, puesto, user_id").order("apellido"),
    db.from("pan_personas_externas").select("*").order("apellido"),
    db.from("cuadrillas").select("id, nombre, activo, responsable_id").order("orden"),
    db.from("cuadrilla_personal").select("cuadrilla_id, personal_id"),
  ]);
  for (const r of [p, x, c, cp]) falla(r.error);
  const cuadrillaDe = new Map((cp.data ?? []).map((f) => [f.personal_id as string, f.cuadrilla_id as string]));
  const personas: PersonaPanol[] = [
    ...(p.data ?? []).map((f) => ({
      tipo: "persona" as const, id: f.id, nombre: f.nombre, apellido: f.apellido, telefono: f.telefono,
      activo: f.activo, detalle: f.puesto, cuadrillaId: cuadrillaDe.get(f.id) ?? null, userId: f.user_id ?? null,
    })),
    ...((x.data ?? []) as PersonaExterna[]).map((f) => ({
      tipo: "externa" as const, id: f.id, nombre: f.nombre, apellido: f.apellido, telefono: f.telefono,
      activo: f.activo, detalle: f.empresa, cuadrillaId: f.cuadrilla_id, userId: null,
    })),
  ];
  const cuadrillas = (c.data ?? []).map((f) => ({
    id: f.id, nombre: f.nombre, activo: f.activo, responsableId: f.responsable_id ?? null,
  }));
  return { personas, cuadrillas };
}

export function usePersonasPanol() {
  return useQuery({ queryKey: ["panol", "personas"], queryFn: leerPersonas, staleTime: 5 * 60_000 });
}

export const nombreCompleto = (p: { nombre: string; apellido: string }) => `${p.nombre} ${p.apellido}`.trim();

// ─── Parámetros ─────────────────────────────────────────────────────────────

export function useParametrosPanol() {
  return useQuery({
    queryKey: ["panol", "parametros"],
    queryFn: async () => {
      const { data, error } = await createClient().from("pan_parametros").select("*");
      falla(error);
      const filas = (data ?? []) as Parametro[];
      return Object.fromEntries(filas.map((f) => [f.clave, Number(f.valor)])) as Record<Parametro["clave"], number>;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Movimientos ────────────────────────────────────────────────────────────

export function useMovimientosPanol(filtro: { articuloId?: string; unidadId?: string; limite?: number }) {
  return useQuery({
    queryKey: ["panol", "movimientos", filtro],
    queryFn: async () => {
      let q = createClient().from("pan_movimientos").select("*").order("created_at", { ascending: false })
        .limit(filtro.limite ?? 100);
      if (filtro.articuloId) q = q.eq("articulo_id", filtro.articuloId);
      if (filtro.unidadId) q = q.eq("unidad_id", filtro.unidadId);
      const { data, error } = await q;
      falla(error);
      return (data ?? []) as Movimiento[];
    },
  });
}

// ─── Escrituras (RPC) ───────────────────────────────────────────────────────

export const identificar = (args: { codigo?: string; pin?: string; dispositivo: string }) =>
  rpc<Identidad | { error: string }>("pan_identificar", {
    p_codigo: args.codigo ?? null, p_pin: args.pin ?? null, p_dispositivo: args.dispositivo,
  });

export const resolverCodigo = (codigo: string) => rpc<CodigoResuelto>("pan_resolver_codigo", { p_codigo: codigo });

export const registrarVale = (vale: Vale) => rpc<ResultadoVale>("pan_registrar_vale", { p: vale });

export const deshacerVale = (valeId: string) => rpc<{ ok: boolean }>("pan_deshacer_vale", { p_vale_id: valeId });

export const anularMovimiento = (movimientoId: string, motivo: string, token?: string) =>
  rpc<{ valeId: string }>("pan_anular", { p_movimiento_id: movimientoId, p_motivo: motivo, p_token: token ?? null });

/** Invalida lo que cambia con cualquier movimiento. */
export function useInvalidarPanol() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["panol"] });
  };
}

/** Registrar un vale y refrescar catálogo y saldos. */
export function useRegistrarVale() {
  const invalidar = useInvalidarPanol();
  return useMutation({ mutationFn: registrarVale, onSuccess: invalidar });
}

/** Un id estable por dispositivo, para el bloqueo de PIN y el "desde dónde se cargó". */
export function idDispositivo(): string {
  try {
    const guardado = localStorage.getItem("panol:dispositivo");
    if (guardado) return guardado;
    const nuevo = crypto.randomUUID();
    localStorage.setItem("panol:dispositivo", nuevo);
    return nuevo;
  } catch {
    return "sin-almacenamiento";
  }
}
