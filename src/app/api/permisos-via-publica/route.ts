import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { agrupar, type Bandeja, type EstadoRobot, type Expediente } from "@/lib/permisos-via-publica/tipos";

// GET /api/permisos-via-publica
//
// La bandeja: expedientes de TAD agrupados por lo que hay que hacer, más el latido del
// robot. Todo lo escribe el robot (robot/worker-tad.mjs); esta ruta sólo lee, con la
// sesión del usuario.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createClient();
    const [expedientes, robot, abiertas] = await Promise.all([
      db.from("pvp_expedientes").select("*"),
      db.from("pvp_robot").select("*").eq("id", "tad").maybeSingle(),
      db.from("pvp_tareas").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "tomada"]),
    ]);
    if (expedientes.error) throw expedientes.error;

    const filas = (expedientes.data ?? []) as Expediente[];
    const bandeja: Bandeja = {
      grupos: agrupar(filas),
      total: filas.length,
      robot: (robot.data as EstadoRobot | null) ?? null,
      revisando: (abiertas.count ?? 0) > 0,
    };
    return NextResponse.json(bandeja);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
