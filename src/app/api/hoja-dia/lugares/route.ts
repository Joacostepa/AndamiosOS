import { NextRequest, NextResponse } from "next/server";
import { accionLugar, accionLugarSchema } from "@/lib/hoja-dia/acciones";
import { conPermiso, fallo, invalidoZod, sesion } from "../_comun";

// POST /api/hoja-dia/lugares { accion: "crear" | "editar", … } — los lugares frecuentes
// (depósitos, proveedores, taller, VTV). La lista viene con el día (GET /api/hoja-dia).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = accionLugarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json(await accionLugar(await sesion(), guardia.userId, parsed.data));
  } catch (e) {
    return fallo(e);
  }
}
