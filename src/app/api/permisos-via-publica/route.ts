import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { armarBandeja } from "@/lib/permisos-via-publica/bandeja";

// GET /api/permisos-via-publica
//
// La bandeja: expedientes de TAD agrupados por lo que hay que hacer, más el latido del
// robot. Todo lo escribe el robot (robot/worker-tad.mjs); esta ruta sólo lee, con la
// sesión del usuario.
// Lo arma armarBandeja (lib/permisos-via-publica/bandeja.ts).

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await armarBandeja(await createClient()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
