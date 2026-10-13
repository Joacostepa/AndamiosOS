import { NextResponse } from "next/server";
import { fetchMapaObras } from "@/lib/odoo/mapa-obras";
import { OdooError } from "@/lib/odoo/client";
import type { RespuestaMapaObras } from "@/lib/mapa-obras/tipos";

// GET /api/operaciones/mapa-obras → RespuestaMapaObras (src/lib/mapa-obras/tipos.ts)
//
// Todas las obras de Ciudad Armada —armadas, pendientes de desarme y desarmadas—, con su
// fachada calculada y sus fotos, más la curva del histórico. Sin parámetros: son ~460 filas,
// entran en una sola respuesta y el filtrado (vista, chips, búsqueda, fecha del histórico)
// se hace en el cliente; pedirle a Odoo un recorte por cada chip costaría un round trip para
// ahorrar unos kilobytes.

export const dynamic = "force-dynamic";
// La primera carga después de un deploy calcula las fachadas (baja tiles de OpenFreeMap);
// tiene su propio plazo de 25 s y después responde sin las que falten.
export const maxDuration = 60;

export async function GET() {
  try {
    const respuesta: RespuestaMapaObras = await fetchMapaObras();
    return NextResponse.json(respuesta);
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
