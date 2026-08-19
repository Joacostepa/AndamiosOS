import { NextRequest, NextResponse } from "next/server";
import { notasFijadasDe } from "@/lib/habilitaciones/servicio";
import { errorResponse, sesion } from "../_comun";

// GET /api/habilitaciones/notas-fijadas?otIds=1,2,3
//
// LAS NOTAS SON DE LA OBRA, NO DE AGUSTINA, así que no pueden quedar encerradas en el
// módulo: el panel del tablero las necesita para que quien planifica sepa que "el
// administrador sólo atiende martes y jueves" antes de prometer una fecha.
//
// Ruta aparte y no la ficha completa a propósito: esto NO toca Odoo, así que abrir el
// panel de una OT no paga los ~800 ms de un RPC para mostrar dos líneas de texto.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("otIds") ?? "";
  const otIds = raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (otIds.length === 0) return NextResponse.json({ notas: {} });

  try {
    const { db } = await sesion();
    const mapa = await notasFijadasDe(db, otIds);
    return NextResponse.json({ notas: Object.fromEntries(mapa) });
  } catch (e) {
    return errorResponse(e);
  }
}
