// Piezas compartidas por las rutas de /api/comercial (parámetros y asistente).
//
// Las rutas trabajan con la sesión del usuario: las escrituras van por funciones SECURITY
// DEFINER que chequean el permiso con auth.uid() y dejan el historial firmado. La service
// role se usa sólo para lo que no es de nadie (firmar URLs de Storage, fotos de Odoo).

import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { OdooError } from "@/lib/odoo/client";
import { accesoActual } from "@/lib/auth/servidor";
import { nivelEn, type Acceso, type ModuloId, type Nivel } from "@/lib/auth/acceso";

/**
 * Segunda llave para las rutas que después usan la service role.
 *
 * El proxy ya filtra por módulo, pero una ruta con la llave maestra no puede depender de una
 * sola puerta (mismo criterio que exigirAdmin): si mañana alguien toca la tabla de APIs,
 * esto sigue en pie. Devuelve el rechazo o quién llama.
 */
export async function exigirModulo(
  modulo: ModuloId,
  nivel: Nivel,
): Promise<{ userId: string; acceso: Acceso } | NextResponse> {
  const sesion = await accesoActual();
  const tiene = sesion ? nivelEn(sesion.acceso, modulo) : null;
  if (!sesion || !tiene || (nivel === "editar" && tiene !== "editar")) {
    return NextResponse.json({ error: "No tenés permiso para hacer esto." }, { status: 403 });
  }
  return sesion;
}

export function invalido(msg: string | ZodError) {
  const texto = typeof msg === "string" ? msg : msg.issues.map((i) => i.message).join(" · ");
  return NextResponse.json({ error: texto }, { status: 400 });
}

/**
 * Error de una función de la base o de Odoo → respuesta legible.
 * Los RAISE EXCEPTION de las funciones ya vienen en castellano y para quien los lee: se
 * pasan tal cual (400). Lo demás es una falla nuestra o de afuera (502).
 */
export function errorResponse(e: unknown) {
  if (e instanceof OdooError) return NextResponse.json({ error: e.message }, { status: 502 });
  const pg = e as { code?: string; message?: string } | null;
  if (pg?.code === "P0001" && pg.message) return NextResponse.json({ error: pg.message }, { status: 400 });
  const msg = e instanceof Error ? e.message : typeof pg?.message === "string" ? pg.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

export function db() {
  return createClient();
}
