// Lecturas de Parámetros de cotización. SOLO server-side.
//
// Las usan dos lados que no se conocen: la pantalla de Parámetros (con la sesión de quien
// mira) y el asistente (con service role, para armar el prompt y alimentar el motor). Por
// eso reciben el cliente de Supabase en vez de crearlo: quién lee lo decide la ruta.
//
// Las escrituras NO están acá: van por las funciones SECURITY DEFINER de la migración
// 20260926000001, que chequean el permiso y dejan el historial en la misma transacción.

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchRead } from "@/lib/odoo/client";
import type {
  CambioParametro,
  ListaAlquiler,
  Parametro,
  PiezaAlquiler,
  ProductoOdoo,
  VersionCriterio,
} from "./tipos";

type Perfil = { nombre: string | null; apellido: string | null } | null;
const nombreDe = (p: Perfil) => (p ? [p.nombre, p.apellido].filter(Boolean).join(" ") || null : null);

/** Postgres numeric llega como número por PostgREST, pero un null o un string raro no rompe. */
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export async function leerParametros(db: SupabaseClient): Promise<Parametro[]> {
  const { data, error } = await db
    .from("cotizacion_parametros")
    .select("clave, grupo, etiqueta, descripcion, tipo, unidad, valor, valor_min, valor_max, texto, vigente_desde, orden, updated_at")
    .order("grupo")
    .order("orden");
  if (error) throw new Error(`No se pudieron leer los parámetros: ${error.message}`);
  return (data ?? []).map((p) => ({ ...p, valor: num(p.valor), valor_min: num(p.valor_min), valor_max: num(p.valor_max) })) as Parametro[];
}

export async function leerProductos(db: SupabaseClient): Promise<ProductoOdoo[]> {
  const { data, error } = await db.from("cotizacion_productos_odoo").select("*").order("clave");
  if (error) throw new Error(`No se pudieron leer los productos: ${error.message}`);
  return (data ?? []) as ProductoOdoo[];
}

export async function leerCriterio(
  db: SupabaseClient,
  version?: number,
): Promise<{ version: number; contenido: string; notas: string | null; created_at: string } | null> {
  let q = db.from("cotizacion_criterios").select("version, contenido, notas, created_at");
  q = version ? q.eq("version", version) : q.eq("vigente", true);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`No se pudo leer el criterio: ${error.message}`);
  return data;
}

export async function leerVersionesCriterio(db: SupabaseClient): Promise<VersionCriterio[]> {
  const { data, error } = await db
    .from("cotizacion_criterios")
    .select("version, notas, vigente, created_at, autor:user_profiles(nombre, apellido)")
    .order("version", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las versiones del criterio: ${error.message}`);
  return (data ?? []).map((v) => ({
    version: v.version,
    notas: v.notas,
    vigente: v.vigente,
    created_at: v.created_at,
    autor: nombreDe(v.autor as unknown as Perfil),
  }));
}

export async function leerListas(db: SupabaseClient): Promise<(ListaAlquiler & { piezas: number })[]> {
  const { data, error } = await db
    .from("lista_alquiler")
    .select("id, nombre, vigente_desde, vigente, origen, notas, created_at, lista_alquiler_piezas(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las listas de alquiler: ${error.message}`);
  return (data ?? []).map(({ lista_alquiler_piezas, ...l }) => ({
    ...l,
    piezas: (lista_alquiler_piezas as unknown as { count: number }[])?.[0]?.count ?? 0,
  })) as (ListaAlquiler & { piezas: number })[];
}

export async function leerPiezas(db: SupabaseClient, listaId: string): Promise<PiezaAlquiler[]> {
  const { data, error } = await db
    .from("lista_alquiler_piezas")
    .select("codigo, descripcion, precio")
    .eq("lista_id", listaId)
    .order("orden");
  if (error) throw new Error(`No se pudieron leer las piezas: ${error.message}`);
  return (data ?? []).map((p) => ({ ...p, precio: Number(p.precio) }));
}

/** La lista vigente con sus piezas. null si no hay ninguna vigente. */
export async function leerListaVigente(db: SupabaseClient): Promise<{ lista: ListaAlquiler; piezas: PiezaAlquiler[] } | null> {
  const { data, error } = await db
    .from("lista_alquiler")
    .select("id, nombre, vigente_desde, vigente, origen, notas, created_at")
    .eq("vigente", true)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la lista vigente: ${error.message}`);
  if (!data) return null;
  return { lista: data as ListaAlquiler, piezas: await leerPiezas(db, data.id) };
}

export async function leerHistorial(db: SupabaseClient, limite = 200): Promise<CambioParametro[]> {
  const { data, error } = await db
    .from("cotizacion_parametros_cambios")
    .select("id, clave, antes, despues, motivo, created_at, autor:user_profiles(nombre, apellido)")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    clave: c.clave,
    antes: c.antes,
    despues: c.despues,
    motivo: c.motivo,
    created_at: c.created_at,
    autor: nombreDe(c.autor as unknown as Perfil),
  }));
}

/**
 * Chequea cada producto de la tabla contra Odoo y deja el resultado en la fila.
 *
 * Con service role: el resultado no es una edición de nadie sino una foto de Odoo, y la
 * tabla no tiene políticas de escritura para usuarios (a propósito: el product_id no se
 * toca desde la pantalla). Un producto archivado o borrado queda en verificado_ok = false,
 * y el asistente no lo usa hasta que alguien lo resuelva.
 */
export async function verificarProductosEnOdoo(admin: SupabaseClient): Promise<{ ok: number; mal: number }> {
  const productos = await leerProductos(admin);
  const ids = productos.map((p) => p.product_id);
  const enOdoo = await searchRead<{ id: number; display_name: string; active: boolean }>(
    "product.product",
    [["id", "in", ids], ["active", "in", [true, false]]],
    ["id", "display_name", "active"],
  );
  const porId = new Map(enOdoo.map((p) => [p.id, p]));
  const ahora = new Date().toISOString();
  let ok = 0;
  let mal = 0;
  for (const p of productos) {
    const o = porId.get(p.product_id);
    // Sólo existir y estar activo: "Puede venderse" es un filtro del buscador de Odoo, no una
    // regla. "Mano de Obra" (199) lo tiene apagado y está en más de 90 líneas de órdenes.
    const bien = !!o && o.active;
    if (bien) ok++; else mal++;
    const { error } = await admin
      .from("cotizacion_productos_odoo")
      .update({ verificado_at: ahora, verificado_ok: bien, verificado_nombre: o?.display_name ?? null })
      .eq("clave", p.clave);
    if (error) throw new Error(`No se pudo guardar la verificación de ${p.clave}: ${error.message}`);
  }
  return { ok, mal };
}
