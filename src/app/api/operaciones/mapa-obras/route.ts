import { NextResponse } from "next/server";
import { fetchMapaObras } from "@/lib/odoo/mapa-obras";
import { OdooError } from "@/lib/odoo/client";

// GET /api/operaciones/mapa-obras
//
// Las obras armadas con coordenadas. Sin parámetros: son ~85 filas, entran en una sola
// respuesta y el filtrado se hace en el cliente — pedirle a Odoo un recorte por cada chip
// costaría un round trip para ahorrar unos kilobytes.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ obras: await fetchMapaObras() });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
