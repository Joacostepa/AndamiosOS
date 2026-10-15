// La segunda llave de Dirección, del lado del servidor (la primera es el proxy). Lo de
// socios no puede depender de una sola puerta: cada API y cada server component que toca
// retiros, dividendos, política o circuitos de facturación lo vuelve a chequear acá.
// SÓLO SERVIDOR.

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { accesoActual } from "@/lib/auth/servidor";
import type { Acceso, Nivel } from "@/lib/auth/acceso";
import { MENSAJE_SIN_ACCESO, MENSAJE_SIN_SOCIOS, permisosDireccion, type PermisosDireccion } from "./permisos.ts";

export type SesionDireccion = PermisosDireccion & { userId: string; acceso: Acceso };

/** Quién mira y qué puede en Dirección. null = sin sesión. */
export async function sesionDireccion(): Promise<SesionDireccion | null> {
  const s = await accesoActual();
  if (!s) return null;
  return { ...permisosDireccion(s.acceso), userId: s.userId, acceso: s.acceso };
}

/** Para las APIs: la sesión, o la respuesta de rechazo (401/403) para devolver tal cual. */
export async function exigirDireccionApi(nivel: Nivel = "ver"): Promise<SesionDireccion | NextResponse> {
  const s = await sesionDireccion();
  if (!s) return NextResponse.json({ error: "Tu sesión venció: volvé a iniciar sesión." }, { status: 401 });
  if (!s.puedeVer) return NextResponse.json({ error: MENSAJE_SIN_ACCESO }, { status: 403 });
  if (nivel === "editar" && !s.puedeEditar) return NextResponse.json({ error: "Tenés Dirección en sólo lectura: no podés hacer cambios." }, { status: 403 });
  return s;
}

/** Para las APIs de socios: además de Dirección, direccion-socios. */
export async function exigirSociosApi(nivel: Nivel = "ver"): Promise<SesionDireccion | NextResponse> {
  const s = await exigirDireccionApi(nivel);
  if (s instanceof NextResponse) return s;
  if (!s.conSocios) return NextResponse.json({ error: MENSAJE_SIN_SOCIOS }, { status: 403 });
  return s;
}

/** Para server components de Dirección. null = no tiene el módulo (el layout lo explica). */
export async function sesionPaginaDireccion(): Promise<SesionDireccion | null> {
  const s = await sesionDireccion();
  return s?.puedeVer ? s : null;
}

/** Para /direccion/socios: sin las dos llaves, vuelve a La semana con el aviso. */
export async function exigirSociosPagina(): Promise<SesionDireccion> {
  const s = await sesionPaginaDireccion();
  if (!s?.conSocios) redirect("/direccion?motivo=sin-acceso");
  return s;
}
