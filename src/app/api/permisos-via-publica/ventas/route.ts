import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ventasParaIniciar } from "@/lib/permisos-via-publica/portal";

// GET /api/permisos-via-publica/ventas — ventas con permiso que todavía no arrancaron, para el
// botón "Iniciar trámite". Aparte de la bandeja porque lee Odoo (~1-2 s) y la bandeja no
// tiene por qué esperarlo.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await ventasParaIniciar(await createClient()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
