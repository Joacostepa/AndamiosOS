// Dar o sacar un módulo `exigeExplicito` (Dirección › Socios, Sistemas · Revisión) desde la
// pantalla de usuarios.
//
// exigirAdmin() no alcanza: ser admin no es ser socio. Sólo quien YA tiene el módulo puede
// darlo o sacarlo (acceso.ts → motivoRechazoExplicitos), salvo el arranque (nadie lo tiene
// todavía). Cada cambio queda en direccion_auditoria con quién lo hizo; además la base
// registra cualquier cambio, venga de donde venga (trigger de la migración de Dirección).
// SÓLO SERVIDOR: usa la service role.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accesoActual } from "@/lib/auth/servidor";
import { explicitosCambiados, motivoRechazoExplicitos, normalizarPermisos, type ModuloId, type Permisos } from "@/lib/auth/acceso";
import { registrarAuditoria, type AccionAuditoria } from "@/lib/direccion/auditoria";

export type CambioExplicito = { cambiados: ModuloId[]; antes: Permisos; despues: Permisos; actor: string };

/**
 * Controla el cambio de permisos de `destinoId`. Devuelve el rechazo (403) o lo que cambia
 * (vacío si no toca módulos explícitos), para registrarlo después de guardar.
 */
export async function controlarExplicitos(
  admin: SupabaseClient,
  destinoId: string | null,
  nuevos: Permisos | undefined,
): Promise<CambioExplicito | NextResponse> {
  const sesion = await accesoActual();
  if (!sesion) return NextResponse.json({ error: "Tu sesión venció: volvé a iniciar sesión." }, { status: 401 });
  const vacio: CambioExplicito = { cambiados: [], antes: {}, despues: {}, actor: sesion.userId };
  if (nuevos === undefined) return vacio;

  let antes: Permisos = {};
  if (destinoId) {
    const { data, error } = await admin.from("user_profiles").select("permisos").eq("id", destinoId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    antes = normalizarPermisos(data?.permisos);
  }
  const cambiados = explicitosCambiados(antes, nuevos);
  if (!cambiados.length) return vacio;

  // ¿Alguien activo ya lo tiene? (para el arranque). Son pocas cuentas: se leen y se miran
  // acá (la clave tiene guion y no conviene filtrarla por PostgREST). Ante un error, se
  // asume que sí hay titular: cerrado.
  const { data: activos, error: errActivos } = await admin.from("user_profiles").select("permisos").eq("activo", true);
  const hayTitular = (m: ModuloId) => (errActivos ? true : (activos ?? []).some((f) => normalizarPermisos(f.permisos)[m] != null));
  const motivo = motivoRechazoExplicitos(sesion.acceso, cambiados, hayTitular);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 403 });
  return { cambiados, antes, despues: nuevos, actor: sesion.userId };
}

/**
 * Con qué acción queda cada módulo explícito en direccion_auditoria. Uno que falte cae en
 * "permiso_socios", que era lo único que había antes de Sistemas.
 */
const ACCION: Partial<Record<ModuloId, AccionAuditoria>> = { "direccion-socios": "permiso_socios", sistemas: "permiso_sistemas" };

/**
 * Registra el cambio (si lo hubo). Con la service role; sin la tabla, no registra. Una fila
 * por acción, con los módulos de esa acción: dar Socios y Sistemas a la vez deja dos filas.
 */
export async function registrarCambioExplicito(destinoId: string, c: CambioExplicito): Promise<void> {
  if (!c.cambiados.length) return;
  const porAccion = new Map<AccionAuditoria, ModuloId[]>();
  for (const m of c.cambiados) {
    const accion = ACCION[m] ?? "permiso_socios";
    porAccion.set(accion, [...(porAccion.get(accion) ?? []), m]);
  }
  for (const [accion, modulos] of porAccion) {
    await registrarAuditoria(c.actor, accion, {
      usuario: destinoId,
      modulos,
      antes: Object.fromEntries(modulos.map((m) => [m, c.antes[m] ?? null])),
      despues: Object.fromEntries(modulos.map((m) => [m, c.despues[m] ?? null])),
    });
  }
}
