import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { armarSeguimiento } from "@/lib/permisos-via-publica/seguimiento";

// GET /api/permisos-via-publica/seguimiento
//
// Cada trámite con sus 7 etapas, quién lo tiene y las medianas para la fecha estimada.
// Sólo lee, con la sesión del usuario.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createClient();
    return NextResponse.json(await armarSeguimiento(db));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
