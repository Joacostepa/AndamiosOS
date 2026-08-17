import { NextRequest, NextResponse } from "next/server";
import { fetchTablero } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// GET /api/planificacion/tablero?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Devuelve la semana completa en una sola llamada: cuadrillas activas, asignaciones
// del rango, OTs candidatas, partes diarios del rango y qué OTs ya están asignadas.
// Ruta protegida por sesión (no está en publicPaths del middleware).

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");

  if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: "Parámetros 'desde' y 'hasta' (YYYY-MM-DD) requeridos" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "'desde' no puede ser posterior a 'hasta'" }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchTablero(desde, hasta));
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
