import { NextResponse } from "next/server";
import { fetchListado } from "@/lib/informes-obra/servicio";
import { errorResponse, sesion } from "./_comun";

// GET /api/informes-obra — la lista de informes vigentes y los contadores de los chips.
//
// Devuelve TODOS los vigentes y el filtrado se hace en el cliente: son ~278 filas ya
// calculadas en Supabase, sin tocar Odoo. Traerlas de una hace que cambiar de chip sea
// instantáneo, y el número del chip es la mitad de su valor: "12 mal costeadas" avisa sin
// que nadie filtre.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await sesion();
    return NextResponse.json(await fetchListado(db));
  } catch (e) {
    return errorResponse(e);
  }
}
