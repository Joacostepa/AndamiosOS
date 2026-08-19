import { NextResponse } from "next/server";
import { fetchBandeja } from "@/lib/habilitaciones/servicio";
import { errorResponse, sesion } from "./_comun";

// GET /api/habilitaciones — la bandeja completa, agrupada por acción pendiente.
//
// No hay paginado ni buscador y no hace falta: con ~19 obras en trámite no hay que
// encontrar nada, hay que decidir por dónde empezar. Los grupos vienen ya armados y
// son excluyentes (ver agruparBandeja), así que los contadores suman el total.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await sesion();
    return NextResponse.json(await fetchBandeja(db));
  } catch (e) {
    return errorResponse(e);
  }
}
