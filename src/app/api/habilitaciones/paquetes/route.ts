import { NextResponse } from "next/server";
import { listarPaquetes } from "@/lib/habilitaciones/servicio";
import { errorResponse, sesion } from "../_comun";

// GET /api/habilitaciones/paquetes — los presets de requisitos.
//
// Los cuatro iniciales salen de las combinaciones reales del tracker (1364 obras desde
// 2025). El paquete es un punto de partida, no una jaula: una vez aplicado, los
// requisitos se agregan y se quitan uno por uno.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await sesion();
    return NextResponse.json({ paquetes: await listarPaquetes(db) });
  } catch (e) {
    return errorResponse(e);
  }
}
