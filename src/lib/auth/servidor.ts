// Permisos del lado del servidor: quién llama, y la segunda llave de las rutas de admin.

import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROLES, accesoDeFila, esAdmin, normalizarPermisos, type Acceso } from "@/lib/auth/acceso";

/** Quién hace el pedido y qué puede. null = sin sesión o sin perfil. */
export async function accesoActual(): Promise<{ userId: string; acceso: Acceso } | null> {
  const db = await createClient();
  // En paralelo: mi_acceso() resuelve el usuario con auth.uid(), no necesita el id.
  const [{ data: auth }, { data: fila }] = await Promise.all([
    db.auth.getUser(),
    db.rpc("mi_acceso").maybeSingle(),
  ]);
  const acceso = accesoDeFila(fila);
  if (!auth.user || !acceso) return null;
  return { userId: auth.user.id, acceso };
}

/**
 * Para las rutas que usan la service role en nombre de un admin.
 *
 * El proxy ya filtra /api/usuarios, pero una ruta con la llave maestra no puede depender
 * de una sola puerta: si mañana alguien toca el matcher o la lista de APIs, esto sigue en
 * pie. Devuelve la respuesta de rechazo o el id de quien llama.
 */
export async function exigirAdmin(): Promise<{ userId: string } | NextResponse> {
  const sesion = await accesoActual();
  if (!sesion || !esAdmin(sesion.acceso)) {
    return NextResponse.json({ error: "Sólo un administrador puede administrar usuarios." }, { status: 403 });
  }
  return { userId: sesion.userId };
}

export const datosUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(80),
  apellido: z.string().trim().max(80),
  telefono: z.string().trim().max(40).nullable(),
  rol: z.enum(ROLES),
  permisos: z.record(z.string(), z.enum(["ver", "editar"])).transform(normalizarPermisos),
});

export function invalido(error: z.ZodError) {
  return NextResponse.json({ error: error.issues.map((i) => i.message).join(" · ") }, { status: 400 });
}

// Sin 0/o, 1/l/i: se dicta por teléfono o se copia de un WhatsApp, y ahí se confunden.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

/** Contraseña temporal legible: tres bloques de cuatro (xk7m-p3qa-9rtf), ~60 bits. */
export function claveTemporal(): string {
  const bloque = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return `${bloque()}-${bloque()}-${bloque()}`;
}
