// Lo propio de Dirección guardado en Supabase: notas y dueños de "Para decidir", metas,
// configuración (colchón mínimo, escenario) y el registro de accesos.
//
// Se lee POR USUARIO, con su sesión (la RLS decide qué ve), FUERA de la caché de la
// pantalla. Si las tablas no existen todavía, devuelve todo vacío con `disponible: false`
// y la pantalla sigue andando (los botones de guardar avisan, ver api/direccion/_comun.ts).
// SÓLO SERVIDOR.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esTablaFaltante } from "./supabase.ts";

export type Nota = { id: string; alertaId: string; texto: string; dueno: string | null; reunion: boolean; autor: string | null; fecha: string };

export type Propios = {
  /** false = faltan las tablas (migración sin aplicar): no se puede guardar. */
  disponible: boolean;
  notas: Nota[];
  /** alerta_id → dueño vigente (null = sin dueño). */
  duenos: Record<string, string | null>;
  /** kpi_id → meta vigente. */
  metas: Record<string, number>;
  config: { colchonMinimoArs: number | null; escenario: string | null };
};

const VACIO: Propios = { disponible: false, notas: [], duenos: {}, metas: {}, config: { colchonMinimoArs: null, escenario: null } };

/** Las personas que pueden ser dueñas de una decisión (socios + gerencia). */
export const DUENOS = ["Jorge", "Gabriel", "Joaquín", "Juan Pablo"] as const;

export async function leerPropios(db: SupabaseClient, opts: { desdeNotas?: string } = {}): Promise<Propios> {
  const [notas, duenos, metas, config] = await Promise.all([
    db
      .from("direccion_notas")
      .select("id, alerta_id, texto, dueno, reunion, created_at, autor:user_profiles(nombre)")
      .gte("created_at", opts.desdeNotas ?? "1970-01-01")
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("direccion_duenos").select("alerta_id, dueno"),
    db.from("direccion_metas").select("kpi_id, meta, created_at").order("created_at", { ascending: false }).limit(500),
    db.from("direccion_config").select("clave, valor"),
  ]);
  const errores = [notas.error, duenos.error, metas.error, config.error].filter(Boolean);
  if (errores.some((e) => esTablaFaltante(e))) return VACIO;
  for (const e of errores) console.warn("[direccion] propios:", e!.message);

  const salida: Propios = { ...VACIO, disponible: true, duenos: {}, metas: {}, config: { colchonMinimoArs: null, escenario: null } };
  salida.notas = (notas.data ?? []).map((n) => {
    const autor = n.autor as { nombre?: string } | { nombre?: string }[] | null;
    const nombre = Array.isArray(autor) ? autor[0]?.nombre : autor?.nombre;
    return { id: n.id as string, alertaId: n.alerta_id as string, texto: n.texto as string, dueno: (n.dueno as string) ?? null, reunion: !!n.reunion, autor: nombre ?? null, fecha: n.created_at as string };
  });
  for (const d of duenos.data ?? []) salida.duenos[d.alerta_id as string] = (d.dueno as string) ?? null;
  // Vale la última meta de cada indicador; una meta null es "se sacó".
  const vistas = new Set<string>();
  for (const m of metas.data ?? []) {
    const k = m.kpi_id as string;
    if (vistas.has(k)) continue;
    vistas.add(k);
    if (m.meta != null) salida.metas[k] = Number(m.meta);
  }
  for (const c of config.data ?? []) {
    const v = c.valor as Record<string, unknown>;
    if (c.clave === "colchon_minimo" && typeof v?.ars === "number") salida.config.colchonMinimoArs = v.ars;
    if (c.clave === "escenario" && typeof v?.valor === "string") salida.config.escenario = v.valor;
  }
  return salida;
}

/** Últimas aperturas de Socios (pie de la pantalla Socios). Sólo socios la pueden leer (RLS). */
export async function ultimasAperturas(db: SupabaseClient, limite = 10): Promise<{ nombre: string | null; fecha: string }[]> {
  const { data, error } = await db
    .from("direccion_auditoria")
    .select("created_at, usuario:user_profiles(nombre)")
    .eq("accion", "abrir_socios")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) {
    if (!esTablaFaltante(error)) console.warn("[direccion] aperturas:", error.message);
    return [];
  }
  return (data ?? []).map((f) => {
    const u = f.usuario as { nombre?: string } | { nombre?: string }[] | null;
    return { nombre: (Array.isArray(u) ? u[0]?.nombre : u?.nombre) ?? null, fecha: f.created_at as string };
  });
}
