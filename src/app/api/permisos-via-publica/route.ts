import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { agrupar, type Bandeja, type EstadoRobot, type Expediente, type TramiteNuevo } from "@/lib/permisos-via-publica/tipos";

// GET /api/permisos-via-publica
//
// La bandeja: expedientes de TAD agrupados por lo que hay que hacer, más el latido del
// robot. Todo lo escribe el robot (robot/worker-tad.mjs); esta ruta sólo lee, con la
// sesión del usuario.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createClient();
    const [expedientes, robot, abiertas, nuevos] = await Promise.all([
      db.from("pvp_expedientes").select("*"),
      db.from("pvp_robot").select("*").eq("id", "tad").maybeSingle(),
      db.from("pvp_tareas").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "tomada"]),
      // Trámites abiertos desde una venta que todavía no tienen expediente en TAD.
      db.from("pvp_tramites")
        .select("id, direccion, odoo_venta_nombre, cliente_nombre, titular_nombre, titular_cargado_at, link_enviado_at, link_error, created_at, pvp_documentos(estado, origen, clave)")
        .is("expediente_id", null)
        .order("created_at", { ascending: false }),
    ]);
    if (expedientes.error) throw expedientes.error;

    const filas = (expedientes.data ?? []) as Expediente[];
    const bandeja: Bandeja = {
      tramitesNuevos: (nuevos.data ?? []) as TramiteNuevo[],
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
