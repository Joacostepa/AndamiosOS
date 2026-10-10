import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conPermiso, fallo, fechaValida } from "../_comun";

// GET /api/hoja-dia/historial?fecha=…[&hojaId=…|&viajeId=…|&pedidoId=…] — la línea de
// tiempo de un día, una hoja, un viaje o un pedido (sin las filas de antes/después).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const sp = req.nextUrl.searchParams;
  const fecha = sp.get("fecha");
  let q = createAdminClient().from("hd_historial").select("id, at, fecha, entidad, entidad_id, hoja_id, viaje_id, pedido_id, accion, texto, por, por_texto, origen, deshecho_at").order("at", { ascending: false }).limit(200);
  if (fechaValida(fecha)) q = q.eq("fecha", fecha);
  for (const k of ["hojaId", "viajeId", "pedidoId"] as const) {
    const v = sp.get(k);
    if (v) q = q.eq(k === "hojaId" ? "hoja_id" : k === "viajeId" ? "viaje_id" : "pedido_id", v);
  }
  const r = await q;
  if (r.error) return fallo(new Error(r.error.message));
  return NextResponse.json({ historial: r.data ?? [] });
}
