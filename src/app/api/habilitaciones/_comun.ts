// Piezas compartidas por las rutas de /api/habilitaciones.
//
// Todas las rutas del módulo trabajan con la sesión del usuario (no con service role):
// las políticas de RLS de hab_gestiones son las que garantizan que el historial sea
// append-only, y saltearlas con una clave de servicio anularía la garantía.

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OdooError } from "@/lib/odoo/client";
import { sincronizarOt } from "@/lib/habilitaciones/servicio";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export type Sesion = { db: SupabaseClient; userId: string | null };

export async function sesion(): Promise<Sesion> {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  return { db, userId: data.user?.id ?? null };
}

/**
 * El cliente con la sesión del usuario, SIN preguntarle a Supabase quién es.
 *
 * `sesion()` llama a `auth.getUser()`, que valida el JWT contra el servidor de auth: es
 * un round trip más, y a ~300 ms fijos por request contra Supabase eso se nota en cada
 * clic. Cuando el autor de lo que se escribe lo resuelve Postgres con `auth.uid()` —o
 * cuando la operación no tiene autor— ese viaje no compra nada.
 *
 * NO AFLOJA NINGUNA GARANTÍA: `createClient()` arma el cliente con el JWT de la cookie y
 * es Postgres el que lo verifica al aplicar RLS. Lo que se saltea es preguntar dos veces.
 * Usar `sesion()` sigue siendo lo correcto donde el userId se necesita en TypeScript.
 */
export function db(): Promise<SupabaseClient> {
  return createClient();
}

export function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

export function invalido(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function parseOtId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Empuja los inputs a Odoo DESPUÉS de responder.
 *
 * La UI es optimista y ninguna pantalla espera este resultado. Un fallo acá no puede
 * tirar abajo la escritura que el usuario pidió: queda en `hab_ots.sync_estado = 'error'`
 * —visible en el contador de la bandeja— y la reconciliación lo repara. Es el único
 * punto del módulo que puede fallar en silencio, y por eso deja rastro.
 */
export function sincronizarLuego(db: SupabaseClient, otIds: number | number[]) {
  const ids = Array.isArray(otIds) ? otIds : [otIds];
  after(async () => {
    for (const id of ids) {
      try {
        await sincronizarOt(db, id);
      } catch (e) {
        console.error(`[habilitaciones] no se pudo sincronizar la OT ${id} con Odoo`, e);
      }
    }
  });
}
