import { NextRequest, NextResponse } from "next/server";
import { accionContratista, accionContratistaSchema } from "@/lib/hoja-dia/acciones";
import { resumenContratistasMes } from "@/lib/hoja-dia/contratistas-servidor";
import { conPermiso, fallo, invalidoZod, sesion } from "../_comun";

// Contratistas de la Hoja del día (mano de obra tercerizada: ni Legajos ni Odoo).
//
// GET /api/hoja-dia/contratistas?mes=YYYY-MM — el resumen del mes por contratista:
//   jornadas-persona (la suma de las cantidades de cada día y cuadrilla), el detalle, el
//   total estimado si tiene valor por jornada y el prorrateo por obra. La lista de
//   contratistas viene con el día (GET /api/hoja-dia).
// POST /api/hoja-dia/contratistas { accion: "crear" | "editar", … } — alta, edición y baja
//   (`activo: false`). Con la sesión: la RLS pide Hoja del día en editar.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const mes = req.nextUrl.searchParams.get("mes");
  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "Falta el mes (YYYY-MM)" }, { status: 400 });
  try {
    return NextResponse.json(await resumenContratistasMes(mes));
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = accionContratistaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json(await accionContratista(await sesion(), guardia.userId, parsed.data));
  } catch (e) {
    return fallo(e);
  }
}
