import { NextRequest, NextResponse } from "next/server";
import { fotoDelViaje } from "@/lib/hoja-dia/publico";
import { conPermiso, fallo } from "../_comun";

// GET /api/hoja-dia/foto?viajeId=… — la foto del remito de un viaje, como URL firmada por
// 10 minutos (el bucket `hoja-dia` es privado). Para el menú del viaje en Camiones.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const id = req.nextUrl.searchParams.get("viajeId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Viaje inválido" }, { status: 400 });
  try {
    return NextResponse.json({ url: await fotoDelViaje(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fallo(e);
  }
}
