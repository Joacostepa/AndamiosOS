import { NextRequest, NextResponse } from "next/server";
import { fetchDetalleOt } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// GET /api/planificacion/ot?otId=123
//
// La ficha de una OT: lo que el panel lateral necesita y el tablero no. Mismo criterio
// que los adjuntos —se pide al abrir la tarjeta, no con la semana entera— porque la
// llamada del tablero trae medio centenar de OTs y esto se mira de a una.
// Ruta protegida por sesión (no está en publicPaths del middleware).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const otId = Number(req.nextUrl.searchParams.get("otId"));
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Parámetro 'otId' inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json({ detalle: await fetchDetalleOt(otId) });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
