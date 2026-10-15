import { NextResponse } from "next/server";
import { cargarCatalogo } from "@/lib/tecnica/persistencia/servidor";
import { fallo, guardia, sesion, sinCache } from "../_comun";

// GET /api/tecnica/modelador/catalogo → { catalogo: Catalogo, avisos }
// El catálogo REAL para el editor: catalogo_piezas + stock + tec_pieza_mapa + tec_kits. Pesos tal cual
// (null = «sin peso»), y lo que no está en el mapa queda «sin código».

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardia("ver");
  if (g instanceof NextResponse) return g;
  try {
    const { catalogo, avisos } = await cargarCatalogo(await sesion());
    return NextResponse.json({ catalogo, avisos }, { headers: sinCache });
  } catch (e) {
    return fallo(e);
  }
}
