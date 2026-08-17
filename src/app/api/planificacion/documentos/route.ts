import { NextRequest, NextResponse } from "next/server";
import { fetchDocumentosOt } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// GET /api/planificacion/documentos?otId=123
//
// Adjuntos de una OT (x_doc_ids). Se piden aparte del tablero porque solo hacen falta
// al abrir el panel lateral de una tarjeta: traerlos con la semana entera sería peso
// muerto en la llamada que más se repite.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const otId = Number(req.nextUrl.searchParams.get("otId"));
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Parámetro 'otId' inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json({ documentos: await fetchDocumentosOt(otId) });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
