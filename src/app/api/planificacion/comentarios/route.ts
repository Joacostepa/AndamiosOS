import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resumenComentarios } from "@/lib/comentarios-ot";

// GET /api/planificacion/comentarios?otIds=1,2,3
//
// Lo que la TARJETA necesita: si la OT tiene comentarios, cuántos y cuál fue el último.
// El hilo entero se lee en el panel, por /api/ordenes-trabajo/:id/comentarios.
//
// UNA SOLA CONSULTA PARA TODO EL TABLERO, como el candado. Una por tarjeta en una grilla
// con cien asignaciones serían cien viajes para dibujar un globito.
//
// No toca Odoo: abrir el tablero no puede costar un RPC más por una señal de color.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("otIds") ?? "";
  const otIds = raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (otIds.length === 0) return NextResponse.json({ resumen: {} });

  try {
    const db = await createClient();
    // Sólo los de operaciones: el globito de la tarjeta no puede prender por una nota
    // de trámite que quien planifica no va a leer ni le sirve.
    const mapa = await resumenComentarios(db, otIds, "operaciones");
    return NextResponse.json({ resumen: Object.fromEntries(mapa) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
