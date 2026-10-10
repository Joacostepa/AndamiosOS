// Permisos del lado del servidor: quién llama, y la segunda llave de las rutas de admin.

import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROLES, accesoDeFila, esAdmin, nivelEn, normalizarPermisos, type Acceso, type ModuloId, type Nivel } from "@/lib/auth/acceso";

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

/**
 * La segunda llave de las rutas que usan la service role en nombre de un módulo (la Hoja
 * del día lee con la llave maestra porque cruza tablas de cuatro módulos). El proxy ya
 * filtró por APIS, pero una ruta con la llave maestra no puede depender de una sola puerta.
 * Alcanza con tener UNO de los módulos en el nivel pedido.
 */
export async function exigirModulo(modulos: readonly ModuloId[], nivel: Nivel): Promise<{ userId: string; acceso: Acceso } | NextResponse> {
  const sesion = await accesoActual();
  if (!sesion) return NextResponse.json({ error: "Tu sesión venció: volvé a iniciar sesión." }, { status: 401 });
  const ok = modulos.some((m) => {
    const tiene = nivelEn(sesion.acceso, m);
    return tiene === "editar" || (tiene === "ver" && nivel === "ver");
  });
  if (!ok) return NextResponse.json({ error: nivel === "editar" ? "No tenés permiso para hacer cambios acá." : "No tenés acceso a esto." }, { status: 403 });
  return sesion;
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
