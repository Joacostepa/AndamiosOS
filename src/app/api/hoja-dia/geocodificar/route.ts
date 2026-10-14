import { NextRequest, NextResponse } from "next/server";
import { geocodificarDireccion } from "@/lib/odoo/geocodificar";
import { conPermiso, fallo } from "../_comun";

// GET /api/hoja-dia/geocodificar?dir=… — las coordenadas de una "otra dirección" (un pedido o
// una parada del recorrido, F4) para el pin del mini-mapa, los tiempos de Google y el desvío.
// { ok: true, lat, lng, consulta } o { ok: false, estado } ("sin_resultado", "fuera_del_amba"…).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const dir = (req.nextUrl.searchParams.get("dir") ?? "").trim();
  if (dir.length < 3 || dir.length > 200) return NextResponse.json({ error: "Escribí una dirección" }, { status: 400 });
  try {
    const r = await geocodificarDireccion(dir);
    if (r.estado === "ok") return NextResponse.json({ ok: true, lat: r.punto.lat, lng: r.punto.lng, consulta: r.consulta });
    return NextResponse.json({ ok: false, estado: r.estado });
  } catch (e) {
    return fallo(e);
  }
}
