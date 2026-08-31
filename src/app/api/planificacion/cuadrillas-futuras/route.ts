import { NextResponse } from "next/server";
import { fetchFuturasPorCuadrilla } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// GET /api/planificacion/cuadrillas-futuras
//
// Jornadas de hoy en adelante por cuadrilla, para que configuración pueda frenar el
// borrado de una cuadrilla que tiene trabajo por delante. Ruta protegida por sesión
// (no está en publicPaths del middleware).
//
// Existe como route handler porque la capa de Odoo es server-only: lee ODOO_API_KEY.

export const dynamic = "force-dynamic";

export async function GET() {
  // El corte es "hoy" en el server. Es una guarda, no un reporte: un día de diferencia
  // por zona horaria a lo sumo cuenta de más, que es el lado seguro para lo que decide.
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    return NextResponse.json({ cuadrillas: await fetchFuturasPorCuadrilla(hoy) });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
