import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarLista } from "@/lib/permisos-via-publica/lista";

// GET /api/permisos-via-publica
//
// La lista "Permisos de andamio" (rediseño 09/10): una fila por permiso con su estado, quién lo
// tiene y qué le toca a la oficina, más el latido del robot. Reemplaza a la bandeja y a
// Seguimiento. Lee con la sesión del usuario; la service role sólo resuelve los nombres de la
// gente de la oficina. Lo arma armarLista (lib/permisos-via-publica/lista.ts).

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await armarLista(await createClient(), createAdminClient()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
