import type { SupabaseClient } from "@supabase/supabase-js";

// Lo que decide la oficina y no está en TAD ni en Odoo (rediseño 09/10). Vive en pvp_config, la
// misma tabla que el modo supervisado, para no sumar tablas por dos listas chicas:
//
//   - "descartes": ventas que no se tramitan acá (las saca de "Ventas para iniciar") y
//     expedientes que se dejaron de seguir (viejos sin novedades, o archivados ya mirados).
//   - "gestores": quiénes pueden tocar lo que no se deshace (armar la encomienda, presentar,
//     empezar de cero). Sin lista, cualquiera que edite el módulo, como antes.
//
// Se lee con la sesión (la tabla es legible para cualquier usuario autenticado) y se escribe con
// service role desde rutas que ya pasaron por el proxy.

export type Descarte = { motivo: string; por: string | null; at: string };
export type Descartes = { ventas: Record<string, Descarte>; expedientes: Record<string, Descarte> };

const VACIO: Descartes = { ventas: {}, expedientes: {} };

export async function leerDescartes(db: SupabaseClient): Promise<Descartes> {
  const { data } = await db.from("pvp_config").select("valores").eq("id", "descartes").maybeSingle();
  const v = (data?.valores ?? {}) as Partial<Descartes>;
  return { ventas: v.ventas ?? {}, expedientes: v.expedientes ?? {} };
}

/** Agrega o saca (motivo = null) un descarte. Devuelve cómo quedó. */
export async function guardarDescarte(
  db: SupabaseClient,
  tipo: keyof Descartes,
  id: string,
  motivo: string | null,
  por: string | null,
): Promise<Descartes> {
  const actual = await leerDescartes(db).catch(() => VACIO);
  const lista = { ...actual[tipo] };
  if (motivo) lista[id] = { motivo, por, at: new Date().toISOString() };
  else delete lista[id];
  const nuevos = { ...actual, [tipo]: lista };
  const { error } = await db.from("pvp_config").upsert({ id: "descartes", valores: nuevos, updated_at: new Date().toISOString(), updated_by: null });
  if (error) throw new Error(error.message);
  return nuevos;
}

/** Mails de los gestores, en minúscula. Lista vacía = sin restricción. */
export async function leerGestores(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("pvp_config").select("valores").eq("id", "gestores").maybeSingle();
  const emails = (data?.valores as { emails?: unknown } | undefined)?.emails;
  return Array.isArray(emails) ? emails.filter((m): m is string => typeof m === "string").map((m) => m.trim().toLowerCase()) : [];
}

export async function guardarGestores(db: SupabaseClient, emails: string[], userId: string | null): Promise<string[]> {
  const limpios = [...new Set(emails.map((m) => m.trim().toLowerCase()).filter((m) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)))];
  const { error } = await db.from("pvp_config").upsert({ id: "gestores", valores: { emails: limpios }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(error.message);
  return limpios;
}

/** ¿Puede tocar lo que no se deshace? Admin siempre; si hay lista de gestores, sólo ellos. */
export function puedeLoIrreversible(yo: { esAdmin: boolean; email: string | null }, gestores: string[]): boolean {
  if (yo.esAdmin) return true;
  if (gestores.length === 0) return true;
  return !!yo.email && gestores.includes(yo.email.trim().toLowerCase());
}
