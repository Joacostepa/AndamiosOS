import { NextRequest, NextResponse } from "next/server";
import { fetchOrdenes, DOMINIOS } from "@/lib/odoo/ordenes";
import { OdooError } from "@/lib/odoo/client";
import type { FiltroOrdenes } from "@/lib/tablero/tipos-orden";

// GET /api/ordenes-trabajo?filtro=abiertas
//
// Devuelve el listado del filtro pedido MÁS los contadores de todos los chips: el número
// es la mitad del valor de un chip ("9 críticas" avisa sin que nadie filtre), así que
// vienen siempre, no sólo cuando se selecciona.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pedido = req.nextUrl.searchParams.get("filtro") ?? "abiertas";
  if (!(pedido in DOMINIOS)) {
    return NextResponse.json({ error: `Filtro desconocido: ${pedido}` }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchOrdenes(pedido as FiltroOrdenes));
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
