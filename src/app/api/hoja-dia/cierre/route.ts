import { NextRequest, NextResponse } from "next/server";
import { precargaCierre } from "@/lib/hoja-dia/servicio";
import { conPermiso, fallo, fechaValida } from "../_comun";

// GET /api/hoja-dia/cierre?cuadrilla=<odoo id>&fecha=YYYY-MM-DD[&ot=<id>] — la precarga de
// "Cerrar jornada" según la hoja (§13): puntero (hr.employee), cantidad de personas, camión
// en obra y fletes sugeridos por los viajes del día a esa obra. Sin hoja: { hayHoja: false }
// y el formulario sigue como siempre. La pide quien cierra partes (Planificación o Partes).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia", "planificacion", "partes"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const sp = req.nextUrl.searchParams;
  const cuadrilla = Number(sp.get("cuadrilla"));
  const fecha = sp.get("fecha");
  const ot = sp.get("ot") ? Number(sp.get("ot")) : null;
  if (!cuadrilla || !fechaValida(fecha)) return NextResponse.json({ error: "Faltan cuadrilla y fecha" }, { status: 400 });
  try {
    return NextResponse.json(await precargaCierre(cuadrilla, fecha, ot));
  } catch (e) {
    return fallo(e);
  }
}
