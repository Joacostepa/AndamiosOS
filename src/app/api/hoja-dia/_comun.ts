// Lo que comparten las rutas de /api/hoja-dia: la segunda llave de permisos y las respuestas.
//
// El proxy ya filtró por APIS (src/lib/auth/acceso.ts). Esto lo repite del lado de la ruta
// porque la lectura del día usa la service role: una ruta con la llave maestra no puede
// depender de una sola puerta.

import { NextResponse } from "next/server";
import type { z } from "zod";
import { exigirModulo } from "@/lib/auth/servidor";
import type { ModuloId, Nivel } from "@/lib/auth/acceso";
import { createClient } from "@/lib/supabase/server";
import { OdooError } from "@/lib/odoo/client";

export async function conPermiso(modulos: readonly ModuloId[], nivel: Nivel) {
  return exigirModulo(modulos, nivel);
}

/** La sesión del usuario: las escrituras de hd_* van con ella (la RLS decide). */
export const sesion = () => createClient();

export function invalidoZod(e: z.ZodError) {
  return NextResponse.json({ error: e.issues.map((i) => i.message).join(" · ") }, { status: 400 });
}

/** Un error en palabras. Los de Odoo son 502 (no es culpa de quien pidió). */
export function fallo(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const status = e instanceof OdooError ? 502 : /permiso/i.test(msg) ? 403 : /no existe|no encuentro/i.test(msg) ? 404 : 400;
  return NextResponse.json({ error: msg }, { status });
}

export const fechaValida = (f: string | null): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f);
