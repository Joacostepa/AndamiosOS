import { NextResponse } from "next/server";
import { leerHistorial } from "@/lib/parametros-cotizacion/servidor";
import { db, errorResponse } from "../../_comun";

// GET /api/comercial/parametros/historial — los últimos cambios de tarifas, criterio y listas.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ cambios: await leerHistorial(await db()) });
  } catch (e) {
    return errorResponse(e);
  }
}
