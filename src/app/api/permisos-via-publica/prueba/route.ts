import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearTramiteDePrueba } from "@/lib/permisos-via-publica/portal";

// POST /api/permisos-via-publica/prueba — "Probar el circuito": crea un trámite de prueba y
// manda el link "del cliente" a la casilla de la app. Nada sale a clientes, a Segucom ni a
// Slack (ver supabase/migrations/20260915000003_permisos_modo_prueba.sql). El proxy exige
// nivel "editar".

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  try {
    return NextResponse.json(await crearTramiteDePrueba(createAdminClient(), user?.id ?? null, req.nextUrl.origin));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
