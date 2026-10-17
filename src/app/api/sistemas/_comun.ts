// Lo que comparten las rutas de /api/sistemas (docs/sistemas/contrato.md §3).
//
// DOS PUERTAS COMO SIEMPRE. El proxy ya filtró (acceso.ts: /api/sistemas/reportes es de
// todos, /api/sistemas/revision pide el módulo `sistemas`); acá se repite porque después se
// usa la service role para firmar URLs, leer nombres y crear avisos. La revisión pide
// «editar» TAMBIÉN EN LOS GET: con «ver» no se ve nada (las capturas pueden traer cualquier
// cosa). La tercera llave es la base: RLS de lectura y RPC SECURITY DEFINER para escribir.

import { NextResponse } from "next/server";
import type { z } from "zod";
import { accesoActual, exigirModulo } from "@/lib/auth/servidor";
import type { Acceso } from "@/lib/auth/acceso";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFaltante } from "@/lib/sistemas/servidor";
import { mensajeZod } from "@/lib/sistemas/validar";
import { MENSAJE_SIN_INSTALAR } from "@/lib/sistemas/tipos";

type Sesion = { userId: string; acceso: Acceso };

/** Cualquiera con sesión activa (Mis reportes y reportar). */
export async function exigirSesion(): Promise<Sesion | NextResponse> {
  const s = await accesoActual();
  if (!s) return NextResponse.json({ error: "Tu sesión venció: volvé a iniciar sesión." }, { status: 401 });
  if (!s.acceso.activo) return NextResponse.json({ error: "Tu usuario no tiene acceso a la aplicación." }, { status: 403 });
  return s;
}

/** Quien revisa: Sistemas · Revisión en «editar», en todas las rutas de la bandeja. */
export async function exigirRevisor(): Promise<Sesion | NextResponse> {
  return exigirModulo(["sistemas"], "editar");
}

/** La sesión del usuario: las RPC usan auth.uid() y la lectura pasa por la RLS. */
export const sesion = () => createClient();
export const admin = () => createAdminClient();

export const sinCache = { "Cache-Control": "no-store" };

export function invalido(e: z.ZodError | string) {
  return NextResponse.json({ error: typeof e === "string" ? e : mensajeZod(e) }, { status: 400 });
}

export function noExiste() {
  return NextResponse.json({ error: "Ese reporte no existe." }, { status: 404 });
}

/** Si el error es «falta la migración», la respuesta 503 con el mensaje de siempre; si no, null. */
export function sinInstalar(error: unknown): NextResponse | null {
  return esFaltante(error) ? NextResponse.json({ error: MENSAJE_SIN_INSTALAR }, { status: 503 }) : null;
}

/** El body como JSON, o null si no lo es. */
export async function leerJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Un error → respuesta. Los RAISE EXCEPTION de las RPC (P0001) ya vienen en castellano y
 * para quien los lee: van tal cual (404 si es «no existe», 403 si es de permiso, si no 400).
 * Lo demás es una falla nuestra: se loguea y no se muestra el texto crudo de Postgres.
 */
export function errorResponse(e: unknown) {
  const faltante = sinInstalar(e);
  if (faltante) return faltante;
  const pg = e as { code?: string; message?: string } | null;
  if (pg?.code === "P0001" && pg.message) {
    const status = /no existe/i.test(pg.message) ? 404 : /permiso/i.test(pg.message) ? 403 : 400;
    return NextResponse.json({ error: pg.message }, { status });
  }
  console.error("[sistemas]", e instanceof Error ? e.message : pg?.message ?? String(e));
  return NextResponse.json({ error: "Algo falló en Sistemas. Probá de nuevo en un rato." }, { status: 500 });
}
