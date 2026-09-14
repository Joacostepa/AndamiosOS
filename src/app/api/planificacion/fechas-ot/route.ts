import { NextRequest, NextResponse } from "next/server";
import { fechasDeOt } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// GET /api/planificacion/fechas-ot?otId=123
//
// En qué fechas tiene jornadas una OT, en cualquier rango. El tablero sólo carga las
// semanas alrededor de la vista, así que el buscador de la bandeja la pide para llevar a
// una obra planificada más adelante (o más atrás) de lo que hay en memoria.
// Ruta protegida por sesión (no está en publicPaths del middleware).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const otId = Number(req.nextUrl.searchParams.get("otId"));
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Parámetro 'otId' inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json({ fechas: await fechasDeOt(otId) });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
