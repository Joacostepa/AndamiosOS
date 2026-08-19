// Piezas compartidas por las rutas de /api/informes-obra.
//
// DOS MODOS DE AUTENTICACIÓN, a propósito:
//
//   sesion()      → lectura desde la app, con las cookies del usuario y RLS de select.
//   servicio()    → escritura desde el cron, con service role.
//
// `informes_obra` no tiene política de insert para `authenticated`: un informe congelado
// que cualquier sesión puede insertar no es evidencia de nada. Lo escribe sólo el cron.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { OdooError } from "@/lib/odoo/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function sesion(): Promise<{ db: SupabaseClient; userId: string | null }> {
  const db = await createServerClient();
  const { data } = await db.auth.getUser();
  return { db, userId: data.user?.id ?? null };
}

/** Cliente de service role: saltea RLS. Sólo para el cron y la regeneración manual. */
export function servicio(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Un cron NO TRAE COOKIES: si esta ruta dependiera de la sesión, correría, no fallaría
 * visiblemente, y no escribiría nada. Por eso se autentica con un secreto compartido.
 *
 * Vercel Cron manda `Authorization: Bearer $CRON_SECRET`. Se acepta también el header
 * `x-cron-secret` para poder dispararlo a mano desde un script.
 */
export function cronAutorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  // Sin secreto configurado se rechaza todo: fallar cerrado es lo correcto en un endpoint
  // que escribe. Un `if (!esperado) return true` dejaría la ruta abierta al mundo.
  if (!esperado) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${esperado}` || req.headers.get("x-cron-secret") === esperado;
}

export function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

export function invalido(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
